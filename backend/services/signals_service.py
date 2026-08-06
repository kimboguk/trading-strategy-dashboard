# -*- coding: utf-8 -*-
"""일일 신호운용 (signal + 수동 집행 + forward 추적).

daily_signals.py 의 사이클 함수를 그대로 재사용 — 콘솔 출력 대신 dict 반환.
현재 forward_* 스키마는 단일시장(KR baseline) — US forward 추적은 데이터 적재 후
멀티마켓 분리(market 컬럼)로 확장 예정.
"""

from datetime import datetime, date
from typing import Optional

from bridge.ath_bridge import get_daily_signals
from services.db import _conn
from services.execution import get_adapter, display_adapter

# forward_* 가 단일시장이라 현재 운용 가능한 시장
_FORWARD_MARKET = "KRW"

# ── 수동매매 사이징 (표시 전용 — 슬롯 배분/TP·SL 제안) ──────────────
_sizing_cache = None


def get_sizing_config() -> dict:
    """전략 사이징 상수 (슬롯 비율/TP/SL/매수수수료). 엔진 모듈에서 1회 로드."""
    global _sizing_cache
    if _sizing_cache is None:
        from bridge.ath_bridge import get_engine, get_daily_signals
        eng = get_engine()
        ds = get_daily_signals()
        _sizing_cache = {
            "slot_fraction": float(eng.SLOT_FRACTION),
            "tp_pct": float(eng.TP_PCT),
            "sl_pct": float(eng.SL_PCT),
            "buy_commission": float(eng.BUY_COMMISSION),
            "top_n": int(eng.TOP_N_PER_DAY),
            "forward_initial_capital": float(ds.FORWARD_INITIAL_CAPITAL),
        }
    return _sizing_cache


def suggest_sizing(price, equity, cfg=None) -> Optional[dict]:
    """가격·자본 기준 매수 제안: 슬롯 수량/금액 + TP·SL 가격. 실제 체결은 D+1 시가 반영."""
    cfg = cfg or get_sizing_config()
    if not price or price <= 0 or not equity or equity <= 0:
        return None
    slot_notional = equity * cfg["slot_fraction"]
    shares = int(slot_notional / (price * (1 + cfg["buy_commission"])))
    return {
        "suggested_shares": shares,
        "suggested_notional": round(shares * price),
        "tp_price": round(price * (1 + cfg["tp_pct"]), 2),
        "sl_price": round(price * (1 - cfg["sl_pct"]), 2),
    }


def _resolve_today(cur, as_of: Optional[str]) -> Optional[date]:
    if as_of:
        return datetime.strptime(as_of, "%Y-%m-%d").date()
    cur.execute("SELECT MAX(trade_date) FROM market_data")
    row = cur.fetchone()
    return row[0] if row else None


def run_daily_cycle(market: str = "KRW", as_of: Optional[str] = None) -> dict:
    """forward 사이클 1일 실행 (멱등 — 같은 as_of 재실행 시 UPSERT)."""
    if market != _FORWARD_MARKET:
        raise ValueError(
            f"forward 추적은 현재 {_FORWARD_MARKET}만 지원합니다. "
            f"US({market})는 수정주가 데이터 적재 후 활성화 예정."
        )
    ds = get_daily_signals()
    conn = ds.connect()
    try:
        cur = conn.cursor()
        today = _resolve_today(cur, as_of)
        if today is None:
            raise RuntimeError("market_data 비어있음 — sync 먼저 필요")

        cash, _, total_equity = ds.get_or_init_capital(cur, today)
        cash, n_entries, entries_log = ds.finalize_pending_entries(
            cur, today, cash, total_equity)
        cash_in, n_exits, exits_log = ds.check_exits(cur, today)
        cash += cash_in

        picks, meta = ds.detect_today_signals(today)

        cur.execute("SELECT ticker FROM forward_positions WHERE status='open'")
        already_open = {r[0] for r in cur.fetchall()}
        ds.record_signals(cur, today, picks, meta, already_open)

        total_equity, pos_value, n_open, daily_ret, cum_ret = \
            ds.update_capital_snapshot(cur, today, cash, n_entries, n_exits)
        cash = total_equity - pos_value   # 스냅샷 정합 현금 (상태 기반, 멱등)
        conn.commit()
    finally:
        conn.close()

    adapter = get_adapter()
    return {
        "market": market,
        "as_of": today.isoformat(),
        "execution_mode": adapter.name,
        "capital": {
            "cash": cash, "positions_value": pos_value,
            "total_equity": total_equity, "n_open_positions": n_open,
            "daily_return_pct": daily_ret, "cum_return_pct": cum_ret,
            "n_entries": n_entries, "n_exits": n_exits,
        },
        "entries": [{"ticker": t, "entry_price": px, "shares": sh, "cost": c}
                    for t, px, sh, c in entries_log],
        "exits": [{"ticker": t, "reason": r, "exit_price": px,
                   "pnl": pnl, "pnl_pct": pct}
                  for t, r, px, pnl, pct in exits_log],
        "picks": picks,
        "meta": meta,
    }


def get_signal_state(market: str = "KRW") -> dict:
    """UI용 집계: 최신 신호일 picks, open 포지션(MTM), pending, 최근 청산, 자본 시계열."""
    conn = _conn()
    cur = conn.cursor()

    # 최신 신호일
    cur.execute("SELECT max(signal_date) FROM forward_signals")
    latest = cur.fetchone()[0]
    latest_signals = []
    if latest:
        cur.execute(
            """SELECT rank, ticker, metric_value, close_at_signal, high_at_signal,
                      prev_ath, volume_at_signal, prev_volume
               FROM forward_signals WHERE signal_date=%s ORDER BY rank""",
            (latest,))
        latest_signals = [{
            "rank": r[0], "ticker": r[1], "metric_value": float(r[2]) if r[2] is not None else None,
            "close": float(r[3]) if r[3] is not None else None,
            "high": float(r[4]) if r[4] is not None else None,
            "prev_ath": float(r[5]) if r[5] is not None else None,
            "volume": r[6], "prev_volume": r[7],
        } for r in cur.fetchall()]

    # open 포지션 + MTM
    cur.execute(
        """SELECT fp.ticker, fp.product_id, fp.entry_date, fp.entry_price, fp.shares,
                  fp.cost_basis, fp.tp_price, fp.sl_price,
                  (SELECT close FROM market_data md WHERE md.product_id=fp.product_id
                   ORDER BY trade_date DESC LIMIT 1) AS last_close
           FROM forward_positions fp WHERE status='open' ORDER BY fp.entry_date""")
    open_positions = []
    for r in cur.fetchall():
        last_close = float(r[8]) if r[8] is not None else float(r[3])
        shares = r[4] or 0
        cost_basis = float(r[5]) if r[5] is not None else 0.0
        mkt_val = shares * last_close
        open_positions.append({
            "ticker": r[0], "product_id": r[1],
            "entry_date": r[2].isoformat() if r[2] else None,
            "entry_price": float(r[3]) if r[3] is not None else None,
            "shares": shares, "cost_basis": cost_basis,
            "tp_price": float(r[6]) if r[6] is not None else None,
            "sl_price": float(r[7]) if r[7] is not None else None,
            "last_close": last_close, "market_value": mkt_val,
            "unrealized_pnl": mkt_val - cost_basis,
            "unrealized_pct": (mkt_val / cost_basis - 1) * 100 if cost_basis else 0.0,
        })

    # pending
    cur.execute(
        """SELECT signal_date, rank_at_signal, ticker, product_id, entry_timing
           FROM forward_positions WHERE status='pending' ORDER BY signal_date, rank_at_signal""")
    pending = [{"signal_date": r[0].isoformat() if r[0] else None, "rank": r[1],
                "ticker": r[2], "product_id": r[3], "entry_timing": r[4]}
               for r in cur.fetchall()]

    # 최근 청산 50
    cur.execute(
        """SELECT ticker, entry_date, exit_date, entry_price, exit_price, shares,
                  pnl_krw, pnl_pct, exit_reason, holding_days
           FROM forward_positions WHERE status='closed'
           ORDER BY exit_date DESC LIMIT 50""")
    closed = [{"ticker": r[0],
               "entry_date": r[1].isoformat() if r[1] else None,
               "exit_date": r[2].isoformat() if r[2] else None,
               "entry_price": float(r[3]) if r[3] is not None else None,
               "exit_price": float(r[4]) if r[4] is not None else None,
               "shares": r[5], "pnl": float(r[6]) if r[6] is not None else None,
               "pnl_pct": float(r[7]) if r[7] is not None else None,
               "exit_reason": r[8], "holding_days": r[9]}
              for r in cur.fetchall()]

    cur.close()
    conn.close()
    return {
        "market": market,
        "latest_signal_date": latest.isoformat() if latest else None,
        "latest_signals": latest_signals,
        "open_positions": open_positions,
        "pending": pending,
        "closed_recent": closed,
    }


def get_forward_equity(market: str = "KRW") -> list:
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT snapshot_date, cash, positions_value, total_equity,
                  n_open_positions, daily_return_pct, cum_return_pct
           FROM forward_capital ORDER BY snapshot_date""")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [{"time": r[0].isoformat(), "cash": float(r[1]),
             "positions_value": float(r[2]), "equity": float(r[3]),
             "n_positions": r[4],
             "daily_return_pct": float(r[5]) if r[5] is not None else None,
             "cum_return_pct": float(r[6]) if r[6] is not None else None}
            for r in rows]


def current_forward_equity() -> float:
    """최신 forward_capital 스냅샷의 총자본 (사이징 기준). 없으면 초기자본."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT total_equity FROM forward_capital ORDER BY snapshot_date DESC LIMIT 1")
    r = cur.fetchone()
    cur.close()
    conn.close()
    if r and r[0] is not None:
        return float(r[0])
    return float(get_sizing_config()["forward_initial_capital"])


def get_open_positions_for_exit() -> list:
    """청산 감시 대상 — 현재 보유(open) 포지션 + TP/SL 레벨."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT ticker, product_id, shares, entry_price, tp_price, sl_price
           FROM forward_positions WHERE status='open' ORDER BY entry_date""")
    out = []
    for r in cur.fetchall():
        out.append({
            "ticker": r[0], "product_id": r[1], "shares": r[2],
            "entry_price": float(r[3]) if r[3] is not None else None,
            "tp_price": float(r[4]) if r[4] is not None else None,
            "sl_price": float(r[5]) if r[5] is not None else None,
        })
    cur.close()
    conn.close()
    return out


def get_pending_entries() -> list:
    """arm된 진입 대기 포지션 (전일 신호 → 당일 진입). 09:00 자동 진입의 소스."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT fp.ticker, fp.product_id, fp.signal_date, fp.rank_at_signal,
                  fp.tp_pct, fp.sl_pct, fs.close_at_signal
           FROM forward_positions fp
           LEFT JOIN forward_signals fs
             ON fs.signal_date = fp.signal_date AND fs.ticker = fp.ticker
           WHERE fp.status = 'pending'
           ORDER BY fp.signal_date, fp.rank_at_signal""")
    out = []
    for r in cur.fetchall():
        out.append({
            "ticker": r[0], "product_id": r[1],
            "signal_date": r[2].isoformat() if r[2] else None,
            "rank": r[3],
            "tp_pct": float(r[4]) if r[4] is not None else None,
            "sl_pct": float(r[5]) if r[5] is not None else None,
            "close_at_signal": float(r[6]) if r[6] is not None else None,
        })
    cur.close()
    conn.close()
    return out


def get_entries_on(as_of: str) -> list:
    """as_of 당일 진입 체결된 포지션 (어제 신호 → 오늘 진입). 오늘 실제 매수 대상 표시용."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT ticker, product_id, signal_date, shares, entry_price,
                  cost_basis, tp_price, sl_price, status
           FROM forward_positions
           WHERE entry_date = %s
           ORDER BY signal_date, rank_at_signal""", (as_of,))
    out = []
    for r in cur.fetchall():
        out.append({
            "ticker": r[0], "product_id": r[1],
            "signal_date": r[2].isoformat() if r[2] else None,
            "shares": r[3],
            "entry_price": float(r[4]) if r[4] is not None else None,
            "cost_basis": float(r[5]) if r[5] is not None else None,
            "tp_price": float(r[6]) if r[6] is not None else None,
            "sl_price": float(r[7]) if r[7] is not None else None,
            "status": r[8],
        })
    cur.close()
    conn.close()
    return out


def get_signal_history(limit: int = 60) -> list:
    """신호 이력 — 발생한 모든 신호(forward_signals) + 각 신호의 결과(진입/청산/손익).
    주문(order_log) 여부와 무관하게 신호 자체를 기록으로 남김."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT fs.signal_date, fs.rank, fs.ticker, fs.metric_value, fs.close_at_signal,
                  fp.status, fp.entry_date, fp.entry_price, fp.exit_date, fp.exit_price,
                  fp.exit_reason, fp.pnl_pct
           FROM forward_signals fs
           LEFT JOIN forward_positions fp
             ON fp.signal_date = fs.signal_date AND fp.ticker = fs.ticker
           ORDER BY fs.signal_date DESC, fs.rank
           LIMIT %s""", (limit,))
    out = []
    for r in cur.fetchall():
        out.append({
            "signal_date": r[0].isoformat() if r[0] else None,
            "rank": r[1], "ticker": r[2],
            "metric_value": float(r[3]) if r[3] is not None else None,
            "close_at_signal": float(r[4]) if r[4] is not None else None,
            "status": r[5],   # None(미집행)/pending/open/closed/skipped
            "entry_date": r[6].isoformat() if r[6] else None,
            "entry_price": float(r[7]) if r[7] is not None else None,
            "exit_date": r[8].isoformat() if r[8] else None,
            "exit_price": float(r[9]) if r[9] is not None else None,
            "exit_reason": r[10],
            "pnl_pct": float(r[11]) if r[11] is not None else None,
        })
    cur.close()
    conn.close()
    return out


def get_cycle_fills(as_of: str) -> dict:
    """자동매매용 당일 가상 체결 — 오늘 진입(BUY)·오늘 청산(SELL). shares/price 포함.
    실제 키움 주문을 가상 forward 포트폴리오에 맞춰 미러링하기 위한 소스."""
    conn = _conn()
    cur = conn.cursor()
    # 오늘 채워진 진입(당일 open 필/동일일 청산 포함 — entry_date 기준)
    cur.execute(
        """SELECT ticker, product_id, shares, entry_price
           FROM forward_positions WHERE entry_date=%s""", (as_of,))
    buys = [{"ticker": r[0], "product_id": r[1], "shares": r[2] or 0,
             "price": float(r[3]) if r[3] is not None else None}
            for r in cur.fetchall()]
    # 오늘 청산된 포지션
    cur.execute(
        """SELECT ticker, product_id, shares, exit_price
           FROM forward_positions WHERE exit_date=%s AND status='closed'""", (as_of,))
    sells = [{"ticker": r[0], "product_id": r[1], "shares": r[2] or 0,
              "price": float(r[3]) if r[3] is not None else None}
             for r in cur.fetchall()]
    cur.close()
    conn.close()
    return {"buys": buys, "sells": sells}


def get_orders_for_execution(market: str = "KRW", as_of: Optional[str] = None) -> dict:
    """수동 집행용 주문: BUY=pending 진입 대기, SELL=오늘 청산된 포지션.
    ⚠ 표시 전용 — 실주문 없음(display_adapter). 실제 제출은 자동매매 경로에서만."""
    adapter = display_adapter()
    conn = _conn()
    cur = conn.cursor()

    cur.execute(
        """SELECT signal_date, ticker, product_id, entry_timing, tp_pct, sl_pct
           FROM forward_positions WHERE status='pending' ORDER BY signal_date, rank_at_signal""")
    buys = [adapter.submit_entry({
        "ticker": r[1], "product_id": r[2], "signal_date": r[0].isoformat() if r[0] else None,
        "entry_timing": r[3], "tp_pct": float(r[4]) if r[4] is not None else None,
        "sl_pct": float(r[5]) if r[5] is not None else None})
        for r in cur.fetchall()]

    sells = []
    if as_of:
        d = datetime.strptime(as_of, "%Y-%m-%d").date()
        cur.execute(
            """SELECT ticker, product_id, exit_price, shares, exit_reason, pnl_krw, pnl_pct
               FROM forward_positions WHERE status='closed' AND exit_date=%s""", (d,))
        sells = [adapter.submit_exit({
            "ticker": r[0], "product_id": r[1], "exit_price": float(r[2]) if r[2] is not None else None,
            "shares": r[3], "reason": r[4],
            "pnl": float(r[5]) if r[5] is not None else None,
            "pnl_pct": float(r[6]) if r[6] is not None else None})
            for r in cur.fetchall()]

    cur.close()
    conn.close()
    # execution_mode 는 실제 설정 모드명(표시). 티켓 자체는 display 전용.
    return {"market": market, "execution_mode": get_adapter().name, "buys": buys, "sells": sells}
