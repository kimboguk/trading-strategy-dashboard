# -*- coding: utf-8 -*-
"""Pydantic models for optimization API."""

from pydantic import BaseModel
from typing import Optional


class OptimizationRequest(BaseModel):
    symbol: str = "EURUSD"
    timeframe: str = "D1"
    ma_type: str = "ema"
    filter_tfs: Optional[list[str]] = None
    tp_range: list[float] = [100, 200, 300]
    sl_range: list[float] = [50, 100, 150]
    include_no_tpsl: bool = True


class OptimizationRow(BaseModel):
    label: str
    tp: str
    sl: str
    trades: int
    win_pct: float
    pf: float
    net_pips: float
    net_usd: float
    exp_pips: float
    max_dd: float
    ann_ret: float
    tp_exits: int
    sl_exits: int
    sig_exits: int
