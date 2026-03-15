# -*- coding: utf-8 -*-
"""In-memory async task tracking."""

import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Task:
    task_id: str
    status: str = "pending"     # pending, running, complete, error
    progress: float = 0.0       # 0-100
    message: Optional[str] = None  # e.g. "Processing 2015..."
    result: Optional[Any] = None
    error: Optional[str] = None


_tasks: dict[str, Task] = {}


def create_task() -> Task:
    task_id = uuid.uuid4().hex[:12]
    task = Task(task_id=task_id)
    _tasks[task_id] = task
    return task


def get_task(task_id: str) -> Optional[Task]:
    return _tasks.get(task_id)


def update_task(task_id: str, **kwargs):
    task = _tasks.get(task_id)
    if task:
        for k, v in kwargs.items():
            setattr(task, k, v)
