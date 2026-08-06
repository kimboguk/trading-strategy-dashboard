# -*- coding: utf-8 -*-
"""Universe metadata — 시장별(USD/KRW) 종목/날짜범위/lookback 옵션."""

from fastapi import APIRouter, HTTPException

from core.config import settings
from services.db import _conn

router = APIRouter(prefix="/api/universe", tags=["universe"])

RANKINGS = ["bayes_stein", "sharpe", "expected_sharpe"]
ENTRY_TIMINGS = ["avg_close_open", "next_open", "next_close", "same_close"]
PRICE_MODES = ["raw", "adjusted"]


@router.get("/meta")
def get_meta(market: str = "KRW"):
    if market not in settings.MARKET_PROFILES:
        raise HTTPException(400, f"Unknown market: {market}")
    profile = settings.profile(market)

    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT count(*) FROM asset_quality aq
           JOIN products p ON p.product_id = aq.product_id
           WHERE p.currency = %s AND aq.is_selected = TRUE""",
        (market,),
    )
    n_selected = cur.fetchone()[0]

    cur.execute(
        """SELECT count(*) FROM products WHERE currency = %s""",
        (market,),
    )
    n_total = cur.fetchone()[0]

    # data_end = 가격 최신일
    cur.execute(
        """SELECT max(trade_date)::text
           FROM market_data md JOIN products p ON p.product_id = md.product_id
           WHERE p.currency = %s""",
        (market,),
    )
    data_end = cur.fetchone()[0]

    # data_start = **거래 가능한 유니버스(랭킹 데이터 breadth) 최초일**.
    # 원시 가격 최소일(min(trade_date))은 소수 종목이 훨씬 이전부터 존재해 부적절
    # (예: KR 1종목이 1996년부터 → 무거래 평탄구간이 백테스트 기간/지표를 왜곡).
    # bt_expected_returns 에 종목이 breadth 임계치 이상 존재하는 최초 snapshot 사용.
    cur.execute(
        """SELECT min(snapshot_date)::text FROM (
               SELECT b.snapshot_date
               FROM bt_expected_returns b
               JOIN products p ON p.product_id = b.product_id
               WHERE p.currency = %s AND b.lookback_days = 504
               GROUP BY b.snapshot_date
               HAVING count(DISTINCT b.product_id) >= 30
           ) t""",
        (market,),
    )
    data_start = cur.fetchone()[0]
    if not data_start:   # fallback: 랭킹 데이터 없으면 원시 가격 최소일
        cur.execute(
            """SELECT min(trade_date)::text
               FROM market_data md JOIN products p ON p.product_id = md.product_id
               WHERE p.currency = %s""",
            (market,),
        )
        data_start = cur.fetchone()[0]

    cur.execute(
        """SELECT DISTINCT lookback_days FROM bt_expected_returns
           ORDER BY lookback_days"""
    )
    lookbacks = [r[0] for r in cur.fetchall()]

    cur.close()
    conn.close()

    return {
        "market": market,
        "label": profile["label"],
        "n_selected": n_selected,
        "n_total": n_total,
        "data_start": data_start,
        "data_end": data_end,
        "lookbacks_available": lookbacks,
        "rankings": RANKINGS,
        "entry_timings": ENTRY_TIMINGS,
        "price_modes": PRICE_MODES,
        "defaults": {
            "price_mode": profile["price_mode"],
            "initial_capital": profile["initial_capital"],
            "min_trading_value": profile["min_trading_value"],
            "buy_commission": profile["buy_commission"],
            "sell_commission": profile["sell_commission"],
            "sell_tax": profile["sell_tax"],
        },
    }


@router.get("/markets")
def get_markets():
    return [{"market": k, "label": v["label"]}
            for k, v in settings.MARKET_PROFILES.items()]


@router.get("/tickers")
def get_tickers(market: str = "KRW", quality_filter: bool = True):
    conn = _conn()
    cur = conn.cursor()
    if quality_filter:
        cur.execute(
            """SELECT p.product_id, p.ticker, p.name, p.market
               FROM products p JOIN asset_quality aq ON aq.product_id = p.product_id
               WHERE p.currency = %s AND aq.is_selected = TRUE
               ORDER BY p.product_id""",
            (market,),
        )
    else:
        cur.execute(
            """SELECT product_id, ticker, name, market
               FROM products WHERE currency = %s ORDER BY product_id""",
            (market,),
        )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [{"product_id": r[0], "ticker": r[1], "name": r[2], "market": r[3]}
            for r in rows]
