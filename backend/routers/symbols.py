# -*- coding: utf-8 -*-
"""Symbol and metadata endpoints."""

from fastapi import APIRouter
from bridge.engine_adapter import get_symbols_config, get_data_loader

router = APIRouter(prefix="/api", tags=["metadata"])


@router.get("/symbols")
def list_symbols():
    symbols = get_symbols_config()
    return {
        name: {
            "pip_size": cfg["pip_size"],
            "spread_pips": cfg["spread_pips"],
            "commission_pips": cfg["commission_pips"],
        }
        for name, cfg in symbols.items()
    }


@router.get("/symbols/{name}/date-range")
def symbol_date_range(name: str):
    DataLoader = get_data_loader()
    loader = DataLoader()
    start, end = loader.get_date_range(name)
    return {
        "symbol": name,
        "start": start.isoformat() if start else None,
        "end": end.isoformat() if end else None,
    }


@router.get("/timeframes")
def list_timeframes():
    return ["D1", "H4", "H1", "M30", "M15"]


@router.get("/strategies")
def list_strategies():
    return [
        {
            "id": "trend_ribbon",
            "name": "Trend Ribbon",
            "description": "EMA grid breakout trend-following",
            "ma_types": ["ema", "sma", "vwma"],
        },
    ]
