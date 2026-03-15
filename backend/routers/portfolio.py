# -*- coding: utf-8 -*-
"""Portfolio API endpoints."""

from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException

from schemas.portfolio import PortfolioRequest
from services.task_manager import create_task, get_task, update_task
from services.portfolio_service import run_portfolio_task

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

_executor = ThreadPoolExecutor(max_workers=2)


def _run_with_error_handling(task_id: str, params: dict):
    try:
        run_portfolio_task(task_id, params)
    except Exception as e:
        update_task(task_id, status="error", error=str(e))


@router.post("/run")
def run_portfolio(req: PortfolioRequest):
    if not req.symbols:
        raise HTTPException(400, "At least one symbol is required")
    task = create_task()
    params = req.model_dump()
    _executor.submit(_run_with_error_handling, task.task_id, params)
    return {"task_id": task.task_id}


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
def get_portfolio_result(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "complete":
        raise HTTPException(400, f"Task status: {task.status}")
    return task.result
