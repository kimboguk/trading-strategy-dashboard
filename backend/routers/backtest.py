# -*- coding: utf-8 -*-
"""Backtest API endpoints."""

from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException

from schemas.backtest import BacktestRequest, TaskStatus
from services.task_manager import create_task, get_task
from services.backtest_service import run_backtest_task

router = APIRouter(prefix="/api/backtest", tags=["backtest"])

_executor = ThreadPoolExecutor(max_workers=2)


def _run_with_error_handling(task_id: str, params: dict):
    try:
        run_backtest_task(task_id, params)
    except Exception as e:
        from services.task_manager import update_task
        update_task(task_id, status="error", error=str(e))


@router.post("/run")
def run_backtest(req: BacktestRequest):
    task = create_task()
    params = req.model_dump()
    _executor.submit(_run_with_error_handling, task.task_id, params)
    return {"task_id": task.task_id}


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
    return task.result["stats"]


@router.get("/{task_id}/trades")
def get_backtest_trades(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "complete":
        raise HTTPException(400, f"Task status: {task.status}")
    return task.result["trades"]


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
    return task.result["equity"]


@router.get("/{task_id}/yearly")
def get_backtest_yearly(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.status != "complete":
        raise HTTPException(400, f"Task status: {task.status}")
    return task.result["yearly"]
