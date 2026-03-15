# -*- coding: utf-8 -*-
"""Pydantic models for portfolio API."""

from pydantic import BaseModel
from typing import Optional


class PortfolioRequest(BaseModel):
    strategy: str = "trend_ribbon"
    symbols: list[str]  # ["EURUSD", "USDJPY", ...]
    timeframe: str = "D1"
    ma_type: str = "ema"
    start: Optional[str] = None
    end: Optional[str] = None
    tp_pips: Optional[float] = None
    sl_pips: Optional[float] = None
    filter_tfs: Optional[list[str]] = None
    alignment_mas: Optional[list[int]] = None
    ribbon_periods: Optional[list[int]] = None
