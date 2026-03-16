# -*- coding: utf-8 -*-
"""Portfolio API endpoints."""

import math
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from schemas.portfolio import PortfolioRequest
from services.task_manager import create_task, get_task, update_task
from services.portfolio_service import run_portfolio_task
from services.db import (
    save_portfolio_result,
    get_portfolio_result_by_id,
    list_portfolio_results,
    delete_portfolio_result,
)
from core.executor import executor


def _sanitize_floats(obj):
    """Replace inf/nan with JSON-safe values recursively."""
    if isinstance(obj, float):
        if math.isinf(obj):
            return 9999.99 if obj > 0 else -9999.99
        if math.isnan(obj):
            return 0.0
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_floats(v) for v in obj]
    return obj


router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


def _run_with_error_handling(task_id: str, result_id: str, params: dict):
    try:
        result = run_portfolio_task(task_id, params)
        # Persist to DB BEFORE marking complete (so history panel sees it)
        sanitized = _sanitize_floats(result)
        save_portfolio_result(result_id, params, sanitized)
        update_task(task_id, status="complete")
    except Exception as e:
        update_task(task_id, status="error", error=str(e))


@router.post("/run")
def run_portfolio(req: PortfolioRequest):
    if not req.symbols:
        raise HTTPException(400, "At least one symbol is required")
    task = create_task()
    params = req.model_dump()
    result_id = uuid.uuid4().hex[:12]
    executor.submit(_run_with_error_handling, task.task_id, result_id, params)
    return {"task_id": task.task_id, "result_id": result_id}


@router.get("/history")
def get_history():
    """List saved portfolio results (lightweight)."""
    return list_portfolio_results(limit=30)


@router.get("/saved/{result_id}")
def get_saved_result(result_id: str):
    """Fetch full portfolio result from DB."""
    result = get_portfolio_result_by_id(result_id)
    if not result:
        raise HTTPException(404, "Result not found")
    return JSONResponse(content=result)


@router.delete("/saved/{result_id}")
def delete_saved_result(result_id: str):
    delete_portfolio_result(result_id)
    return {"ok": True}


@router.get("/{task_id}")
def get_portfolio_status(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "message": task.message,
        "error": task.error,
    }


@router.get("/{task_id}/result")
def get_portfolio_result_endpoint(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "complete":
        raise HTTPException(400, f"Task status: {task.status}")
    return JSONResponse(content=_sanitize_floats(task.result))
