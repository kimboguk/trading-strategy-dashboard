# -*- coding: utf-8 -*-
"""라이브 트레이딩 API — 설정·대시보드·동기화+사이클·자동매매·주문로그."""

import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from core.config import settings
from core.executor import executor
from services import signals_service, live_service, db
from services.task_manager import create_task, get_task
from services.execution import get_kiwoom
from schemas.live import SyncRunRequest, AutoTradeRequest
from routers.backtest import _sanitize_floats

router = APIRouter(prefix="/api/live", tags=["live"])


def _live_state() -> dict:
    """비밀 제외 config + DB 정본 auto_trade 병합."""
    cfg = settings.live_config()
    cfg.update(db.get_live_settings())   # auto_trade/kiwoom_env 정본
    return cfg


def _broker_account() -> dict | None:
    """구성 시 키움 계좌 조회 (읽기전용, best-effort)."""
    if not settings.broker_configured():
        return None
    try:
        return get_kiwoom().get_account()
    except Exception as e:
        return {"error": str(e)}


@router.get("/config")
def get_config():
    return _live_state()


@router.get("/dashboard")
def dashboard(market: str = "KRW"):
    state = signals_service.get_signal_state(market)
    equity = signals_service.get_forward_equity(market)
    capital = equity[-1] if equity else None
    # 오늘 = 마지막 사이클(자본 스냅샷)일; 없으면 마지막 신호일
    today = (capital.get("time") if capital else None) or state.get("latest_signal_date")
    orders = signals_service.get_orders_for_execution(market, as_of=today)

    # 수동매매 사이징 제안 (표시 전용) — 현재 자본 기준 슬롯 배분
    szcfg = signals_service.get_sizing_config()
    cur_equity = (capital.get("equity") if capital else None) or szcfg["forward_initial_capital"]
    picks = state.get("latest_signals", [])
    for p in picks:
        s = signals_service.suggest_sizing(p.get("close"), cur_equity, szcfg)
        if s:
            p.update(s)
    sizing = {
        "equity": cur_equity,
        "slot_fraction": szcfg["slot_fraction"],
        "slot_notional": round(cur_equity * szcfg["slot_fraction"]),
        "tp_pct": szcfg["tp_pct"],
        "sl_pct": szcfg["sl_pct"],
        "top_n": szcfg["top_n"],
    }
    payload = {
        "market": market,
        "as_of": today,
        "latest_signal_date": state.get("latest_signal_date"),
        "picks": picks,                                # 최근 신호일 추천 상위 N (+사이징 제안)
        "entries": orders.get("buys", []),             # 진입(BUY) 주문 티켓
        "exits": orders.get("sells", []),              # 청산(SELL) 주문 티켓
        "open_positions": state.get("open_positions", []),
        "pending": state.get("pending", []),
        "closed_recent": state.get("closed_recent", []),
        "capital": capital,
        "equity_series": equity,
        "sizing": sizing,                              # 수동매매 슬롯 배분 요약
        "picks_are_today": bool(today and state.get("latest_signal_date") == today),
        "entry_due": (signals_service.next_trading_day(state["latest_signal_date"])
                      if state.get("latest_signal_date") else None),  # 진입 예정일(다음 거래일)
        "entries_today": signals_service.get_entries_on(today) if today else [],  # 오늘 진입 체결(어제 신호)
        "signal_history": signals_service.get_signal_history(60),  # 신호 이력(주문 무관)
        "live": _live_state(),
        "freshness": live_service.freshness(market),
        "broker": _broker_account(),                   # 키움 구성 시 계좌, 아니면 None
        "auto_orders": db.order_log_summary(today),    # 당일 자동주문 상태 집계
    }
    return JSONResponse(content=_sanitize_floats(payload))


@router.get("/broker/ping")
def broker_ping():
    if not settings.broker_configured():
        raise HTTPException(409, "브로커 미구성 — .env KIWOOM_* + EXECUTION_MODE=kiwoom 필요")
    try:
        return get_kiwoom().ping()
    except Exception as e:
        raise HTTPException(502, str(e))


@router.get("/broker/account")
def broker_account():
    if not settings.broker_configured():
        raise HTTPException(409, "브로커 미구성")
    try:
        return JSONResponse(content=_sanitize_floats(get_kiwoom().get_account()))
    except Exception as e:
        raise HTTPException(502, str(e))


@router.get("/broker/price")
def broker_price(code: str):
    if not settings.broker_configured():
        raise HTTPException(409, "브로커 미구성")
    try:
        return JSONResponse(content=_sanitize_floats(get_kiwoom().get_price(code)))
    except Exception as e:
        raise HTTPException(502, str(e))


@router.post("/sync-and-run")
def sync_and_run(req: SyncRunRequest):
    task = create_task()
    executor.submit(live_service.run_sync_and_cycle_task, task.task_id, req.market, req.as_of)
    return {"task_id": task.task_id}


@router.get("/task/{task_id}")
def task_status(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    resp = {"task_id": task.task_id, "status": task.status,
            "progress": task.progress, "message": task.message, "error": task.error}
    if task.status == "complete" and task.result is not None:
        resp["result"] = _sanitize_floats(task.result)
    return JSONResponse(content=resp)


@router.post("/auto-trade")
def set_auto_trade(req: AutoTradeRequest):
    if req.on:
        if not settings.broker_configured():
            raise HTTPException(409, "브로커 미구성 — 키움 키/계좌 설정 후 EXECUTION_MODE=kiwoom 필요")
        if settings.KIWOOM_ENV == "real":
            tail = settings.KIWOOM_ACCOUNT_NO[-4:] if settings.KIWOOM_ACCOUNT_NO else ""
            if not req.confirm or req.confirm.strip() != tail:
                raise HTTPException(403, "실전 자동매매 활성화: 계좌 뒤 4자리 확인 필요")
    db.set_auto_trade(req.on, by="ui")
    return _live_state()


@router.post("/submit-open-entries")
def submit_open_entries():
    """개장 자동 진입 트리거 — arm된 pending 진입을 시장가 제출 (auto_trade ON + 장중).
    09:00 스케줄 작업 또는 장중 수동 테스트에서 호출."""
    result = live_service.submit_open_entries(market="KRW")
    return JSONResponse(content=_sanitize_floats(result))


@router.post("/monitor-exits")
def monitor_exits():
    """장중 청산 감시 트리거 — 보유종목 TP/SL 도달 시 시장가 매도 (auto_trade ON + 장중).
    장중 5분 주기 스케줄 작업 또는 수동 테스트에서 호출."""
    result = live_service.monitor_and_exit(market="KRW")
    return JSONResponse(content=_sanitize_floats(result))


@router.get("/orders/log")
def orders_log(as_of: str | None = None, limit: int = 100):
    return JSONResponse(content=_sanitize_floats(db.list_order_log(limit=limit, as_of=as_of)))
