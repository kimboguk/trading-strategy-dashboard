# -*- coding: utf-8 -*-
"""Pydantic models — US/KR ATH+volume breakout 횡단면 백테스트."""

from pydantic import BaseModel, Field
from typing import Optional, Literal


class BacktestRequest(BaseModel):
    market: Literal["USD", "KRW"] = "KRW"
    start: Optional[str] = None          # YYYY-MM-DD
    end: Optional[str] = None

    # 신호 파라미터
    ath_ratio: float = 1.02
    vol_ratio: float = 2.0
    min_trading_value: Optional[float] = None   # None=시장 프로파일 기본

    # 포트폴리오/청산
    top_n: int = 3
    tp_pct: float = 0.20
    sl_pct: float = 0.03
    no_sl: bool = False
    slot_fraction: float = 0.33
    entry_timing: Literal["avg_close_open", "next_open", "next_close", "same_close"] = "avg_close_open"

    # 랭킹/데이터
    ranking: Literal["bayes_stein", "sharpe", "expected_sharpe"] = "bayes_stein"
    lookback: int = 504                  # 126 | 252 | 504
    quality_filter: bool = True
    price_mode: Optional[Literal["raw", "adjusted"]] = None  # None=시장 프로파일 기본

    # 자본/비용 (None=시장 프로파일 기본)
    initial_capital: Optional[float] = None
    buy_commission: Optional[float] = None
    sell_commission: Optional[float] = None
    sell_tax: Optional[float] = None


class TaskStatus(BaseModel):
    task_id: str
    status: str  # pending, running, complete, error
    progress: float = 0  # 0-100
    message: Optional[str] = None
    error: Optional[str] = None
