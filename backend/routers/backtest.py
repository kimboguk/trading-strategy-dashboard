# -*- coding: utf-8 -*-
"""Backtest API endpoints."""

import math
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from schemas.backtest import BacktestRequest, TaskStatus
from services.task_manager import create_task, get_task, update_task
from services.backtest_service import run_backtest_task
from services.db import (
    save_backtest_result,
    get_backtest_result_by_id,
    list_backtest_results,
    delete_backtest_result,
)
from core.executor import executor


def _sanitize_floats(obj):
    """Replace inf/nan with JSON-safe values and convert numpy types recursively."""
    import numpy as np
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        val = float(obj)
        if math.isinf(val):
            return "+inf" if val > 0 else "-inf"
        if math.isnan(val):
            return 0.0
        return val
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: _sanitize_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_floats(v) for v in obj]
    return obj


router = APIRouter(prefix="/api/backtest", tags=["backtest"])


def _run_with_error_handling(task_id: str, result_id: str, params: dict):
    try:
        result = run_backtest_task(task_id, params)
        # Persist to DB BEFORE marking complete (so history panel sees it)
        sanitized = _sanitize_floats(result)
        save_backtest_result(result_id, params, sanitized)
        update_task(task_id, status="complete")
    except Exception as e:
        update_task(task_id, status="error", error=str(e))


@router.post("/run")
def run_backtest(req: BacktestRequest):
    task = create_task()
    params = req.model_dump()
    result_id = uuid.uuid4().hex[:12]
    executor.submit(_run_with_error_handling, task.task_id, result_id, params)
    return {"task_id": task.task_id, "result_id": result_id}


@router.get("/history")
def get_history():
    """List saved backtest results (lightweight)."""
    return list_backtest_results(limit=50)


@router.get("/saved/{result_id}")
def get_saved_result(result_id: str):
    """Fetch full backtest result from DB."""
    result = get_backtest_result_by_id(result_id)
    if not result:
        raise HTTPException(404, "Result not found")
    return JSONResponse(content=result)


@router.delete("/saved/{result_id}")
def delete_saved_result(result_id: str):
    delete_backtest_result(result_id)
    return {"ok": True}


@router.get("/{task_id}")
def get_backtest_status(task_id: str):
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


@router.get("/{task_id}/stats")
def get_backtest_stats(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "complete":
        raise HTTPException(400, f"Task status: {task.status}")
    return JSONResponse(content=_sanitize_floats(task.result["stats"]))


@router.get("/{task_id}/trades")
def get_backtest_trades(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "complete":
        raise HTTPException(400, f"Task status: {task.status}")
    return JSONResponse(content=_sanitize_floats(task.result["trades"]))


@router.get("/{task_id}/chart")
def get_backtest_chart(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "complete":
        raise HTTPException(400, f"Task status: {task.status}")
    return task.result["grid"]


@router.get("/{task_id}/equity")
def get_backtest_equity(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "complete":
        raise HTTPException(400, f"Task status: {task.status}")
    return JSONResponse(content=_sanitize_floats(task.result["equity"]))


@router.get("/{task_id}/yearly")
def get_backtest_yearly(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "complete":
        raise HTTPException(400, f"Task status: {task.status}")
    return JSONResponse(content=_sanitize_floats(task.result["yearly"]))
