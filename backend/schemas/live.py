# -*- coding: utf-8 -*-
"""Pydantic models — 라이브 트레이딩."""

from pydantic import BaseModel
from typing import Optional, Literal


class SyncRunRequest(BaseModel):
    market: Literal["KRW"] = "KRW"   # 라이브는 현재 KR 전용
    as_of: Optional[str] = None


class AutoTradeRequest(BaseModel):
    on: bool
    confirm: Optional[str] = None    # real 환경에서 계좌 tail 확인
