# -*- coding: utf-8 -*-
"""Pydantic models for backtest API."""

from pydantic import BaseModel, Field
from typing import Optional


class BacktestRequest(BaseModel):
    strategy: str = "trend_ribbon"
    symbol: str = "EURUSD"
    timeframe: str = "D1"
    ma_type: str = "ema"
    start: Optional[str] = None    # YYYY-MM-DD
    end: Optional[str] = None
    tp_pips: Optional[float] = None
    sl_pips: Optional[float] = None
    filter_tfs: Optional[list[str]] = None  # e.g. ["D1", "H1"]
    alignment_mas: Optional[list[int]] = None  # e.g. [30, 60, 120]
    ribbon_periods: Optional[list[int]] = None  # e.g. [30, 60] — default: all 4
    fast_period: Optional[int] = None   # golden_cross: fast MA period (default 50)
    slow_period: Optional[int] = None   # golden_cross: slow MA period (default 200)


class TradeRecord(BaseModel):
    entry_time: str
    exit_time: str
    direction: str
    entry_price: float
    exit_price: float
    pnl_pips: float
    cost_pips: float
    net_pnl_pips: float
    pnl_usd: float
    equity_after: float
    exit_reason: str


class BacktestStats(BaseModel):
    symbol: str
    timeframe: str
    ma_type: str
    data_period_days: int = 0
    total_trades: int = 0
    long_trades: int = 0
    short_trades: int = 0
    win_rate: float = 0
    profit_factor: float = 0
    total_pnl_pips: float = 0
    total_cost_pips: float = 0
    total_pnl_usd: float = 0
    avg_win_usd: float = 0
    avg_loss_usd: float = 0
    expectancy_pips: float = 0
    max_drawdown_pct: float = 0
    annual_return_pct: float = 0
    avg_holding: str = ""
    initial_capital: float = 10000
    final_equity: float = 10000


class TaskStatus(BaseModel):
    task_id: str
    status: str  # pending, running, complete, error
    progress: float = 0  # 0-100
    error: Optional[str] = None
    stats: Optional[BacktestStats] = None
