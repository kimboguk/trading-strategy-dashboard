# -*- coding: utf-8 -*-
"""라이브 서비스 — 데이터 동기화 + 일일 사이클 실행 (+ Phase3 자동매매 제출).

sync_and_run: strategy-test/sync_equity_db.py 로 market_data + rt_* 증분 동기화 후
signals_service.run_daily_cycle 실행. 오래 걸리므로 task_manager 비동기 + 폴링.
"""

import datetime
import subprocess
import sys
import time

from core.config import settings
from services import signals_service, db
from services.execution import get_kiwoom
from services.task_manager import update_task

# 라이브 데이터 신선도에 필요한 증분 동기화 대상
_SYNC_TABLES = ["market_data", "rt_expected_returns", "rt_asset_metrics"]

# 자동매매 대상 시장 (forward_* 가 KRW 단일시장)
_AUTO_MARKET = "KRW"

# 키움 주문 API 초당 유량 제한(유량=1) 회피용 주문 간 지연(초)
_ORDER_THROTTLE_SEC = 0.6

# 장중 가드 — KR 정규장 09:00~15:30(KST) 평일에만 제출 (장 마감 후 헛주문 방지).
# 공휴일은 여기서 못 거르지만 키움이 거부하므로, 이 가드는 "명백한 장외" 차단용.
_ENFORCE_MARKET_HOURS = True
_MARKET_OPEN = datetime.time(9, 0)
_MARKET_CLOSE = datetime.time(15, 30)


def _market_open_now() -> bool:
    """현재 시각이 KR 정규장(평일 09:00~15:30 KST)인지. 시스템 로컬시간=KST 전제."""
    now = datetime.datetime.now()
    if now.weekday() >= 5:          # 토(5)/일(6)
        return False
    return _MARKET_OPEN <= now.time() <= _MARKET_CLOSE


def submit_open_entries(market: str = "KRW") -> dict:
    """개장(09:00) 자동 진입 — arm된 pending 진입을 **시장가 매수** 제출.

    18:00 사이클이 확정(arm)한 신호를 다음날 개장 시 실주문. auto_trade ON + 장중 필수.
    Phase A: 진입만(TP/SL 스톱 예약은 Phase B). 사이징 = forward 자본 × 슬롯.
    - 멱등: order_log 예약(cycle_as_of=오늘, BUY, ticker) → 중복/재실행 이중제출 차단
    - 예외는 절대 전파하지 않음
    """
    summary = {"gated": True, "reason": None, "attempted": 0,
               "submitted": 0, "failed": 0, "skipped": 0, "orders": []}
    try:
        # ── 게이트 (submit_cycle_orders 와 동일 원칙) ──
        if market != _AUTO_MARKET:
            summary["reason"] = f"KR 전용(현재 {market})"; return summary
        if settings.EXECUTION_MODE != "kiwoom":
            summary["reason"] = f"EXECUTION_MODE={settings.EXECUTION_MODE} (kiwoom 아님)"; return summary
        if not settings.broker_configured():
            summary["reason"] = "브로커 미구성"; return summary
        st = db.get_live_settings()
        if not st.get("auto_trade"):
            summary["reason"] = "자동매매 OFF"; return summary
        if _ENFORCE_MARKET_HOURS and not _market_open_now():
            summary["reason"] = "장 시간 아님 — KR 정규장(평일 09:00~15:30 KST)에만 진입 제출"
            return summary

        summary["gated"] = False
        pending = signals_service.get_pending_entries()
        if not pending:
            summary["reason"] = "진입 대기(pending) 종목 없음"; return summary

        equity = signals_service.current_forward_equity()
        szcfg = signals_service.get_sizing_config()
        slot_notional = equity * szcfg["slot_fraction"]
        comm = szcfg["buy_commission"]
        today = datetime.date.today().isoformat()
        env = settings.KIWOOM_ENV
        cap_n = settings.MAX_ORDERS_PER_CYCLE
        cap_notional = settings.MAX_NOTIONAL_PER_ORDER
        adapter = get_kiwoom()
        sent = 0

        for p in pending:
            summary["attempted"] += 1
            ticker = p["ticker"]
            # 현재가 조회 (사이징용) — 실패 시 신호일 종가 fallback
            try:
                pr = adapter.get_price(ticker)
                price = pr.get("price") or p.get("close_at_signal")
            except Exception:
                price = p.get("close_at_signal")
            qty = int(slot_notional / (price * (1 + comm))) if price and price > 0 else 0
            base = {"cycle_as_of": today, "market": market, "side": "BUY", "ticker": ticker,
                    "product_id": p.get("product_id"), "qty": qty, "price": None,
                    "order_type": "market", "broker_env": env, "adapter": "kiwoom"}

            def _skip(reason):
                db.insert_order_log({**base, "intent": "auto_skip",
                                     "status": "skipped", "error": reason})
                summary["skipped"] += 1
                summary["orders"].append({"side": "BUY", "ticker": ticker,
                                          "qty": qty, "status": "skipped", "reason": reason})

            if not price or price <= 0:
                _skip("가격 조회 실패"); continue
            if qty <= 0:
                _skip("수량 0 (자본/가격)"); continue
            if sent >= cap_n:
                _skip(f"주문수 캡({cap_n}) 초과"); continue
            notional = price * qty
            if cap_notional and notional > cap_notional:
                _skip(f"금액 캡({cap_notional:.0f}) 초과: {notional:.0f}"); continue

            oid = db.reserve_order_log({**base, "intent": "auto", "status": "submitting"})
            if oid is None:
                summary["skipped"] += 1
                summary["orders"].append({"side": "BUY", "ticker": ticker,
                                          "qty": qty, "status": "dup_skipped"})
                continue

            try:
                if sent > 0:
                    time.sleep(_ORDER_THROTTLE_SEC)
                # 시장가 매수 (price=None → trde_tp=03)
                resp = adapter.submit_entry({"ticker": ticker, "qty": qty, "price": None})
                sent += 1
                st_val = resp.get("status") or "submitted"
                db.update_order_log(oid, {
                    "status": st_val,
                    "broker_order_id": resp.get("broker_order_id"),
                    "raw_request": resp.get("raw_request"),
                    "raw_response": resp.get("raw_response"),
                    "error": resp.get("error"),
                    "price": price,   # 참고가(시장가라 실체결가는 별도)
                })
                if st_val in ("failed", "rejected", "error"):
                    summary["failed"] += 1
                else:
                    summary["submitted"] += 1
                summary["orders"].append({"side": "BUY", "ticker": ticker, "qty": qty,
                                          "status": st_val,
                                          "broker_order_id": resp.get("broker_order_id")})
            except Exception as e:
                sent += 1
                db.update_order_log(oid, {"status": "error", "error": str(e)})
                summary["failed"] += 1
                summary["orders"].append({"side": "BUY", "ticker": ticker,
                                          "qty": qty, "status": "error", "error": str(e)})
        return summary
    except Exception as e:
        summary["reason"] = f"진입 제출 예외(무시): {e}"
        return summary


def monitor_and_exit(market: str = "KRW") -> dict:
    """장중 청산 감시 — 보유종목 현재가가 TP/SL 도달 시 시장가 매도.

    키움엔 독립 스톱주문 함수가 없어 프로그램 로직으로 구현(제미나이/공식 확인).
    장중 주기(5분 등) 호출. auto_trade ON + 장중 필수. 초당 유량 준수(throttle).
    - 멱등: 같은 날 이미 auto SELL 있으면 skip (order_log)
    - 예외는 전파하지 않음
    """
    summary = {"gated": True, "reason": None, "checked": 0,
               "sold": 0, "failed": 0, "skipped": 0, "orders": []}
    try:
        if market != _AUTO_MARKET:
            summary["reason"] = f"KR 전용(현재 {market})"; return summary
        if settings.EXECUTION_MODE != "kiwoom":
            summary["reason"] = f"EXECUTION_MODE={settings.EXECUTION_MODE}"; return summary
        if not settings.broker_configured():
            summary["reason"] = "브로커 미구성"; return summary
        st = db.get_live_settings()
        if not st.get("auto_trade"):
            summary["reason"] = "자동매매 OFF"; return summary
        if _ENFORCE_MARKET_HOURS and not _market_open_now():
            summary["reason"] = "장 시간 아님"; return summary

        summary["gated"] = False
        opens = signals_service.get_open_positions_for_exit()
        if not opens:
            summary["reason"] = "보유 포지션 없음"; return summary

        today = datetime.date.today().isoformat()
        env = settings.KIWOOM_ENV
        adapter = get_kiwoom()
        n_calls = 0

        for pos in opens:
            ticker = pos["ticker"]
            shares = int(pos.get("shares") or 0)
            tp = pos.get("tp_price")
            sl = pos.get("sl_price")
            # 이미 오늘 청산 주문했으면 skip (get_price 호출 절약)
            if db.auto_order_exists(today, "SELL", ticker):
                summary["skipped"] += 1
                continue
            if shares <= 0:
                summary["skipped"] += 1
                continue

            summary["checked"] += 1
            # 현재가 조회 (유량 준수)
            if n_calls > 0:
                time.sleep(_ORDER_THROTTLE_SEC)
            try:
                price = adapter.get_price(ticker).get("price")
            except Exception:
                price = None
            n_calls += 1
            if not price or price <= 0:
                summary["skipped"] += 1
                continue

            reason = None
            if tp and price >= tp:
                reason = "TP"
            elif sl and price <= sl:
                reason = "SL"
            if not reason:
                continue   # 아직 미도달

            base = {"cycle_as_of": today, "market": market, "side": "SELL", "ticker": ticker,
                    "product_id": pos.get("product_id"), "qty": shares, "price": None,
                    "order_type": "market", "broker_env": env, "adapter": "kiwoom"}
            oid = db.reserve_order_log({**base, "intent": "auto", "status": "submitting"})
            if oid is None:
                summary["skipped"] += 1
                continue
            try:
                time.sleep(_ORDER_THROTTLE_SEC)
                resp = adapter.submit_exit({"ticker": ticker, "qty": shares, "price": None})
                st_val = resp.get("status") or "submitted"
                db.update_order_log(oid, {
                    "status": st_val,
                    "broker_order_id": resp.get("broker_order_id"),
                    "raw_request": resp.get("raw_request"),
                    "raw_response": resp.get("raw_response"),
                    "error": f"{reason} @{price:.0f}" if not resp.get("error") else resp.get("error"),
                    "price": price,
                })
                if st_val in ("failed", "rejected", "error"):
                    summary["failed"] += 1
                else:
                    summary["sold"] += 1
                summary["orders"].append({"ticker": ticker, "reason": reason,
                                          "price": price, "qty": shares, "status": st_val})
            except Exception as e:
                db.update_order_log(oid, {"status": "error", "error": str(e)})
                summary["failed"] += 1
        return summary
    except Exception as e:
        summary["reason"] = f"청산 감시 예외(무시): {e}"
        return summary


def submit_cycle_orders(market: str, as_of: str) -> dict:
    """사이클 이후 자동매매 주문 제출 — 게이트 전부 통과 시에만 실제 주문.

    안전 원칙:
      - 3조건(KR · EXECUTION_MODE=kiwoom · auto_trade=ON) + broker_configured 모두 만족해야 제출
      - 캡: MAX_ORDERS_PER_CYCLE(제출 건수) / MAX_NOTIONAL_PER_ORDER(주문 금액)
      - 멱등: order_log 예약(유니크 부분인덱스) → 재실행 이중제출 차단
      - 예외는 절대 사이클/태스크로 전파하지 않음 (가상 forward 추적 무오염)
      - SELL 먼저 → BUY (자금 확보 순서)
    """
    summary = {"gated": True, "reason": None, "attempted": 0,
               "submitted": 0, "failed": 0, "skipped": 0, "orders": []}
    try:
        # ── 게이트 ──
        if market != _AUTO_MARKET:
            summary["reason"] = f"KR 전용(현재 {market})"; return summary
        if settings.EXECUTION_MODE != "kiwoom":
            summary["reason"] = f"EXECUTION_MODE={settings.EXECUTION_MODE} (kiwoom 아님)"; return summary
        if not settings.broker_configured():
            summary["reason"] = "브로커 미구성"; return summary
        st = db.get_live_settings()
        if not st.get("auto_trade"):
            summary["reason"] = "자동매매 OFF"; return summary
        if _ENFORCE_MARKET_HOURS and not _market_open_now():
            # 장 마감 후 제출하면 키움이 "장종료(RC4058)"로 거부 → 헛주문 방지
            summary["reason"] = ("장 시간 아님 — KR 정규장(평일 09:00~15:30 KST)에만 제출. "
                                 "개장 후 'Sync and Run today' 재실행 필요")
            return summary

        summary["gated"] = False   # 게이트 통과 — 실제 제출 진행
        fills = signals_service.get_cycle_fills(as_of)
        # SELL 먼저(청산=자금확보), 그다음 BUY
        queue = [("SELL", o) for o in fills["sells"]] + [("BUY", o) for o in fills["buys"]]

        adapter = get_kiwoom()
        env = settings.KIWOOM_ENV
        cap_n = settings.MAX_ORDERS_PER_CYCLE
        cap_notional = settings.MAX_NOTIONAL_PER_ORDER
        sent = 0

        for side, o in queue:
            summary["attempted"] += 1
            ticker = o["ticker"]
            qty = int(o.get("shares") or 0)
            price = o.get("price")
            base = {"cycle_as_of": as_of, "market": market, "side": side, "ticker": ticker,
                    "product_id": o.get("product_id"), "qty": qty, "price": price,
                    "order_type": "market", "broker_env": env, "adapter": "kiwoom"}

            def _skip(reason):
                db.insert_order_log({**base, "intent": "auto_skip",
                                     "status": "skipped", "error": reason})
                summary["skipped"] += 1
                summary["orders"].append({"side": side, "ticker": ticker,
                                          "qty": qty, "status": "skipped", "reason": reason})

            if qty <= 0:
                _skip("수량 0"); continue
            if sent >= cap_n:
                _skip(f"주문수 캡({cap_n}) 초과"); continue
            notional = (price or 0) * qty
            if cap_notional and notional > cap_notional:
                _skip(f"금액 캡({cap_notional:.0f}) 초과: {notional:.0f}"); continue

            # 멱등 예약 (제출 전 슬롯 확보)
            oid = db.reserve_order_log({**base, "intent": "auto", "status": "submitting"})
            if oid is None:
                summary["skipped"] += 1
                summary["orders"].append({"side": side, "ticker": ticker,
                                          "qty": qty, "status": "dup_skipped"})
                continue

            # 실제 제출 (⚠ 실주문) — 주문 API 유량 제한 회피 지연
            try:
                if sent > 0:
                    time.sleep(_ORDER_THROTTLE_SEC)
                resp = (adapter.submit_exit(o) if side == "SELL"
                        else adapter.submit_entry(o))
                sent += 1
                st_val = resp.get("status") or "submitted"
                db.update_order_log(oid, {
                    "status": st_val,
                    "broker_order_id": resp.get("broker_order_id"),
                    "raw_request": resp.get("raw_request"),
                    "raw_response": resp.get("raw_response"),
                    "error": resp.get("error"),
                })
                if st_val in ("failed", "rejected", "error"):
                    summary["failed"] += 1
                else:
                    summary["submitted"] += 1
                summary["orders"].append({"side": side, "ticker": ticker, "qty": qty,
                                          "status": st_val,
                                          "broker_order_id": resp.get("broker_order_id")})
            except Exception as e:
                sent += 1
                db.update_order_log(oid, {"status": "error", "error": str(e)})
                summary["failed"] += 1
                summary["orders"].append({"side": side, "ticker": ticker,
                                          "qty": qty, "status": "error", "error": str(e)})
        return summary
    except Exception as e:
        # 제출 경로 실패는 사이클에 영향 없음 — 로그만
        summary["reason"] = f"제출 예외(무시): {e}"
        return summary


def run_sync_and_cycle_task(task_id: str, market: str = "KRW", as_of=None):
    """동기화 → 일일 사이클. task_manager 갱신."""
    try:
        update_task(task_id, status="running", progress=10,
                    message="데이터 동기화 (market_data + rt_*)...")
        proc = subprocess.run(
            [sys.executable, "sync_equity_db.py", "--only", *_SYNC_TABLES],
            cwd=str(settings.STRATEGY_ROOT),
            capture_output=True, text=True, timeout=1800,
        )
        if proc.returncode != 0:
            tail = (proc.stderr or proc.stdout or "")[-800:]
            update_task(task_id, status="error", error=f"sync 실패:\n{tail}")
            return

        update_task(task_id, progress=70, message="일일 사이클 실행...")
        result = signals_service.run_daily_cycle(market=market, as_of=as_of)

        # 자동매매 제출 (게이트 통과 시에만 실주문 — 예외는 사이클 무영향)
        update_task(task_id, progress=90, message="자동매매 주문 제출 확인...")
        auto = submit_cycle_orders(market=market, as_of=result["as_of"])
        result["auto_submitted"] = auto.get("submitted", 0) > 0
        result["auto_summary"] = auto

        update_task(task_id, progress=100, status="complete", result=result)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        update_task(task_id, status="error", error=str(e))


def freshness(market: str = "KRW") -> dict:
    """rt_* 가 market_data 대비 낡았는지 (라이브 신호 정합성 경고용)."""
    conn = db._conn(); cur = conn.cursor()
    cur.execute("SELECT max(trade_date)::text FROM market_data")
    md = cur.fetchone()[0]
    cur.execute("SELECT max(snapshot_date)::text FROM rt_expected_returns")
    rt = cur.fetchone()[0]
    cur.close(); conn.close()
    stale = bool(md and rt and rt < md)
    return {"market_data_max": md, "rt_max": rt, "stale": stale}
