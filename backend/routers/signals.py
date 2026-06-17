# -*- coding: utf-8 -*-
"""신호운용 API — 일일 forward 사이클 + 상태/주문/포지션/자본."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from schemas.signals import RunCycleRequest
from services import signals_service
from routers.backtest import _sanitize_floats

router = APIRouter(prefix="/api/signals", tags=["signals"])


@router.post("/run-cycle")
def run_cycle(req: RunCycleRequest):
    try:
        result = signals_service.run_daily_cycle(market=req.market, as_of=req.as_of)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))
    return JSONResponse(content=_sanitize_floats(result))


@router.get("/state")
def state(market: str = "KRW"):
    return JSONResponse(content=_sanitize_floats(signals_service.get_signal_state(market)))


@router.get("/orders")
def orders(market: str = "KRW", as_of: str | None = None):
    return JSONResponse(content=_sanitize_floats(
        signals_service.get_orders_for_execution(market, as_of)))


@router.get("/equity")
def equity(market: str = "KRW"):
    return JSONResponse(content=_sanitize_floats(signals_service.get_forward_equity(market)))


@router.get("/positions")
def positions(market: str = "KRW", status: str | None = None):
    state = signals_service.get_signal_state(market)
    if status == "open":
        data = state["open_positions"]
    elif status == "pending":
        data = state["pending"]
    elif status == "closed":
        data = state["closed_recent"]
    else:
        data = {"open": state["open_positions"], "pending": state["pending"],
                "closed": state["closed_recent"]}
    return JSONResponse(content=_sanitize_floats(data))
