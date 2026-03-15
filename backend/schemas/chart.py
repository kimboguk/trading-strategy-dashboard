# -*- coding: utf-8 -*-
"""Pydantic models for chart data (TradingView Lightweight Charts format)."""

from pydantic import BaseModel
from typing import Optional


class OHLCVBar(BaseModel):
    time: int  # Unix seconds
    open: float
    high: float
    low: float
    close: float


class LinePoint(BaseModel):
    time: int
    value: float


class SignalMarker(BaseModel):
    time: int
    position: str       # "aboveBar" or "belowBar"
    color: str
    shape: str          # "arrowUp", "arrowDown"
    text: str


class ChartData(BaseModel):
    candles: list[OHLCVBar]
    ma_lines: dict[str, list[LinePoint]]  # "ma_30", "ma_60", "ma_120", "ma_240"
    markers: list[SignalMarker]
    equity: list[LinePoint]
