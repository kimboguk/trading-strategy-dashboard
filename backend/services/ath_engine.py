# -*- coding: utf-8 -*-
"""ATH+volume breakout 횡단면 백테스트를 async-task 모델로 래핑.

- 시장 프로파일(USD/KRW)로 미지정 파라미터(비용/유동성/price_mode/자본) 보충
- 무거운 load_all_data 결과 + 신호를 캐시해 파라미터 스윕 시 재사용
"""

import time
from collections import OrderedDict
from datetime import datetime, date
from typing import Optional

from core.config import settings
from bridge.ath_bridge import get_engine
from services.task_manager import update_task

MAX_CHART_BARS = 6000

# ── 캐시 (RAM 바운드: loaded 2개) ─────────────────────────────────
_loaded_cache: "OrderedDict[tuple, dict]" = OrderedDict()
_LOADED_MAX = 2


def _parse_date(s: Optional[str]) -> Optional[date]:
    return datetime.strptime(s, "%Y-%m-%d").date() if s else None


def _resolve(params: dict) -> dict:
    """시장 프로파일로 미지정값 보충 (0.0 은 유효값이므로 None 체크)."""
    market = params.get("market", settings.DEFAULT_MARKET)
    p = settings.profile(market)

    def pick(name):
        v = params.get(name)
        return p[name] if v is None else v

    return {
        "market": market,
        "currency": market,
        "price_mode": params.get("price_mode") or p["price_mode"],
        "min_tv": pick("min_trading_value"),
        "initial_capital": pick("initial_capital"),
        "buy_commission": pick("buy_commission"),
        "sell_commission": pick("sell_commission"),
        "sell_tax": pick("sell_tax"),
        "ranking": params.get("ranking", "bayes_stein"),
        "lookback": params.get("lookback", 504),
        "quality_filter": params.get("quality_filter", True),
        "ath_ratio": params.get("ath_ratio", 1.02),
        "vol_ratio": params.get("vol_ratio", 2.0),
        "top_n": params.get("top_n", 3),
        "tp_pct": params.get("tp_pct", 0.20),
        "sl_pct": params.get("sl_pct", 0.03),
        "no_sl": params.get("no_sl", False),
        "slot_fraction": params.get("slot_fraction", 0.33),
        "entry_timing": params.get("entry_timing", "avg_close_open"),
        "start_d": _parse_date(params.get("start")),
        "end_d": _parse_date(params.get("end")),
    }


def _get_loaded(ath, r: dict) -> dict:
    key = (r["currency"], r["end_d"], r["ranking"], r["lookback"],
           r["quality_filter"], r["price_mode"])
    if key in _loaded_cache:
        _loaded_cache.move_to_end(key)
        return _loaded_cache[key]
    loaded = ath.load_all_data(
        end_d=r["end_d"], verbose=False,
        ranking_method=r["ranking"], lookback=r["lookback"],
        apply_quality_filter=r["quality_filter"],
        currency=r["currency"], price_mode=r["price_mode"],
    )
    loaded["_sig_cache"] = {}
    _loaded_cache[key] = loaded
    while len(_loaded_cache) > _LOADED_MAX:
        _loaded_cache.popitem(last=False)
    return loaded


def _get_signals(ath, loaded: dict, r: dict):
    sig_key = (r["ath_ratio"], r["vol_ratio"], r["min_tv"])
    cache = loaded.setdefault("_sig_cache", {})
    if sig_key not in cache:
        cache[sig_key] = ath.precompute_signals(
            loaded["ticker_data"], ath_ratio=r["ath_ratio"],
            vol_ratio=r["vol_ratio"], min_tv=r["min_tv"], verbose=False,
        )
    return cache[sig_key]


def _downsample(points: list, max_n: int = MAX_CHART_BARS) -> list:
    if len(points) <= max_n:
        return points
    step = len(points) // max_n + 1
    out = points[::step]
    if out[-1] is not points[-1]:
        out.append(points[-1])
    return out


def _build_payload(ath, sim, stats: dict, r: dict, started: float) -> dict:
    risk = ath.compute_risk_metrics(sim)
    yearly = ath.compute_yearly(sim)

    snaps = sim.snaps
    equity = [{
        "time": s.date.isoformat(),
        "equity": s.total_equity,
        "cash": s.cash,
        "positions_value": s.positions_value,
        "n_positions": s.n_positions,
    } for s in snaps]

    trades = [{
        "ticker": t.ticker,
        "entry_date": t.entry_date.isoformat(),
        "exit_date": t.exit_date.isoformat(),
        "entry_price": t.entry_price,
        "exit_price": t.exit_price,
        "shares": t.shares,
        "pnl": t.pnl,
        "pnl_pct": t.pnl_pct,
        "exit_reason": t.exit_reason,
        "holding_days": t.holding_days,
    } for t in sim.trades]

    # 종목별 집계
    agg: dict = {}
    for t in sim.trades:
        a = agg.setdefault(t.ticker, {"ticker": t.ticker, "n_trades": 0,
                                      "total_pnl": 0.0, "wins": 0})
        a["n_trades"] += 1
        a["total_pnl"] += t.pnl
        if t.pnl > 0:
            a["wins"] += 1
    positions = [{
        "ticker": a["ticker"], "n_trades": a["n_trades"],
        "total_pnl": a["total_pnl"],
        "win_rate": (a["wins"] / a["n_trades"] * 100) if a["n_trades"] else 0.0,
    } for a in sorted(agg.values(), key=lambda x: -x["total_pnl"])]

    full_stats = {
        **stats,
        **risk,
        "market": r["market"],
        "initial_capital": r["initial_capital"],
        "price_mode": r["price_mode"],
        "ranking": r["ranking"],
        "lookback": r["lookback"],
        "period_start": snaps[0].date.isoformat() if snaps else None,
        "period_end": snaps[-1].date.isoformat() if snaps else None,
        "n_trading_days": len(snaps),
        "elapsed_sec": round(time.time() - started, 2),
    }

    return {
        "stats": full_stats,
        "equity": _downsample(equity),
        "trades": trades,
        "yearly": yearly,
        "positions": positions,
    }


def run_ath_backtest_task(task_id: str, params: dict) -> dict:
    started = time.time()
    ath = get_engine()
    r = _resolve(params)

    update_task(task_id, status="running", progress=5,
                message=f"{r['market']} 유니버스/OHLCV 로딩...")
    loaded = _get_loaded(ath, r)

    update_task(task_id, progress=55, message="신호 계산...")
    signals = _get_signals(ath, loaded, r)

    update_task(task_id, progress=75, message="시뮬레이션...")
    sim, stats = ath.run_with_params(
        loaded,
        ath_ratio=r["ath_ratio"], vol_ratio=r["vol_ratio"], min_tv=r["min_tv"],
        top_n=r["top_n"], tp_pct=r["tp_pct"], sl_pct=r["sl_pct"], no_sl=r["no_sl"],
        slot_fraction=r["slot_fraction"], entry_timing=r["entry_timing"],
        initial_capital=r["initial_capital"],
        buy_commission=r["buy_commission"],
        sell_commission=r["sell_commission"], sell_tax=r["sell_tax"],
        start_d=r["start_d"], end_d=r["end_d"],
        cached_signals=signals,
    )

    update_task(task_id, progress=95, message="결과 집계...")
    payload = _build_payload(ath, sim, stats, r, started)
    update_task(task_id, progress=100, result=payload)
    return payload
