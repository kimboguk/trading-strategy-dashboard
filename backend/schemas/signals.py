# -*- coding: utf-8 -*-
"""Pydantic models — 일일 신호운용 (forward tracking)."""

from pydantic import BaseModel
from typing import Optional, Literal


class RunCycleRequest(BaseModel):
    market: Literal["USD", "KRW"] = "KRW"
    as_of: Optional[str] = None   # YYYY-MM-DD, 기본: market_data max(trade_date)
