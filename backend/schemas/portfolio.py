# -*- coding: utf-8 -*-
"""Pydantic models for portfolio API."""

from pydantic import BaseModel
from typing import Optional


class SlotAllocation(BaseModel):
    symbol: str
    strategy: str
    overrides: Optional[dict] = None


class PortfolioRequest(BaseModel):
    # New multi-strategy fields
    allocations: Optional[list[SlotAllocation]] = None
    capital_per_slot: Optional[float] = 10_000
    defaults: Optional[dict] = None            # {timeframe, ma_type, start, end, ...}
    strategy_defaults: Optional[dict] = None   # {"trend_ribbon": {...}, "golden_cross": {...}}

    compound: bool = False
    leverage: int = 1
    kelly_fraction: float = 0.0
    use_kalman: bool = False
    kalman_qr_ratio: float = 0.1
    htf_exit: bool = False

    # Legacy fields (backward compat)
    strategy: Optional[str] = None
    symbols: Optional[list[str]] = None
    timeframe: str = "D1"
    ma_type: str = "ema"
    start: Optional[str] = None
    end: Optional[str] = None
    tp_pips: Optional[float] = None
    sl_pips: Optional[float] = None
    filter_tfs: Optional[list[str]] = None
    alignment_mas: Optional[list[int]] = None
    ribbon_periods: Optional[list[int]] = None
    fast_period: Optional[int] = None
    slow_period: Optional[int] = None
