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
from services.execution import get_adapter

# forward_* 가 단일시장이라 현재 운용 가능한 시장
_FORWARD_MARKET = "KRW"


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


def get_orders_for_execution(market: str = "KRW", as_of: Optional[str] = None) -> dict:
    """수동 집행용 주문: BUY=pending 진입 대기, SELL=오늘 청산된 포지션."""
    adapter = get_adapter()
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
    return {"market": market, "execution_mode": adapter.name, "buys": buys, "sells": sells}
