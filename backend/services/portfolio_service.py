# -*- coding: utf-8 -*-
"""Portfolio service: runs backtest per slot (symbol×strategy), aggregates results."""

import time
from collections import Counter

import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta

from bridge.engine_adapter import get_backtest_runner, get_cache_clearer
from services.task_manager import update_task
from services.backtest_service import _df_to_records, _yearly_breakdown, MAX_CHART_BARS


# ── Strategy tag mapping ──────────────────────────────────────

STRATEGY_TAG = {
    "trend_ribbon": "TR",
    "golden_cross": "XMA",
}


def _slot_key(symbol: str, strategy: str, need_disambig: bool) -> str:
    """Generate per_symbol key. Add strategy tag only when symbol has multiple strategies."""
    if need_disambig:
        tag = STRATEGY_TAG.get(strategy, strategy[:3].upper())
        return f"{symbol}({tag})"
    return symbol


# ── Parameter normalization ───────────────────────────────────

def _normalize_params(params: dict):
    """Convert legacy or new format into (slots, capital_per_slot, defaults, strategy_defaults)."""
    if params.get("allocations"):
        # New format
        slots = params["allocations"]
        capital = params.get("capital_per_slot", 10_000)
        defaults = params.get("defaults") or {}
        strat_defaults = params.get("strategy_defaults") or {}
        # Fallback to top-level legacy fields if defaults are sparse
        defaults.setdefault("timeframe", params.get("timeframe", "D1"))
        defaults.setdefault("ma_type", params.get("ma_type", "ema"))
        if params.get("start"):
            defaults.setdefault("start", params["start"])
        if params.get("end"):
            defaults.setdefault("end", params["end"])
        return slots, capital, defaults, strat_defaults
    else:
        # Legacy format: single strategy × all symbols
        strategy = params.get("strategy", "trend_ribbon")
        symbols = params.get("symbols", [])
        slots = [{"symbol": s, "strategy": strategy} for s in symbols]
        capital = params.get("capital_per_slot", 10_000)
        defaults = {
            "timeframe": params.get("timeframe", "D1"),
            "ma_type": params.get("ma_type", "ema"),
            "start": params.get("start"),
            "end": params.get("end"),
            "tp_pips": params.get("tp_pips"),
            "sl_pips": params.get("sl_pips"),
            "filter_tfs": params.get("filter_tfs"),
        }
        strat_defaults = {
            strategy: {
                "ribbon_periods": params.get("ribbon_periods"),
                "alignment_mas": params.get("alignment_mas"),
                "fast_period": params.get("fast_period"),
                "slow_period": params.get("slow_period"),
            }
        }
        return slots, capital, defaults, strat_defaults


def _build_slot_params(slot: dict, defaults: dict, strategy_defaults: dict) -> dict:
    """Merge: defaults -> strategy_defaults[slot.strategy] -> slot.overrides."""
    strategy = slot["strategy"]
    merged = {}
    # Layer 1: global defaults
    for k, v in defaults.items():
        if v is not None:
            merged[k] = v
    # Layer 2: strategy defaults
    sd = strategy_defaults.get(strategy) or {}
    for k, v in sd.items():
        if v is not None:
            merged[k] = v
    # Layer 3: per-slot overrides
    overrides = slot.get("overrides") or {}
    for k, v in overrides.items():
        if v is not None:
            merged[k] = v
    return merged


# ── Main portfolio task ───────────────────────────────────────

def run_portfolio_task(task_id: str, params: dict) -> dict:
    """Run portfolio backtest (called from thread pool)."""
    update_task(task_id, status="running", message="Starting portfolio...")
    KST = timezone(timedelta(hours=9))
    started_at = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    t0 = time.monotonic()

    # Normalize params (legacy compat)
    slots, capital_per_slot, defaults, strategy_defaults = _normalize_params(params)
    compound = params.get("compound", False)
    n = len(slots)

    # Determine which symbols need disambiguation
    symbol_count = Counter(s["symbol"] if isinstance(s, dict) else s.symbol for s in slots)

    # Collect per-slot results
    all_trades = []
    all_equities = []
    all_close_prices = []  # for correlation (underlying asset returns)
    per_symbol = {}

    for i, slot in enumerate(slots):
        symbol = slot["symbol"] if isinstance(slot, dict) else slot.symbol
        strategy = slot["strategy"] if isinstance(slot, dict) else slot.strategy
        need_disambig = symbol_count[symbol] > 1
        key = _slot_key(symbol, strategy, need_disambig)

        update_task(task_id, message=f"{key} ({i+1}/{n})...")

        run_backtest = get_backtest_runner(strategy)
        slot_params = _build_slot_params(
            slot if isinstance(slot, dict) else slot.model_dump(),
            defaults, strategy_defaults,
        )

        result = run_backtest(
            symbol=symbol,
            timeframe=slot_params.get("timeframe", "D1"),
            ma_type=slot_params.get("ma_type", "ema"),
            start=slot_params.get("start"),
            end=slot_params.get("end"),
            tp_pips=slot_params.get("tp_pips"),
            sl_pips=slot_params.get("sl_pips"),
            filter_tfs=slot_params.get("filter_tfs"),
            alignment_mas=slot_params.get("alignment_mas"),
            ribbon_periods=slot_params.get("ribbon_periods"),
            fast_period=slot_params.get("fast_period"),
            slow_period=slot_params.get("slow_period"),
            verbose=False,
            _keep_cache=True,
            compound=compound,
            leverage=params.get("leverage", 1),
            kelly_fraction=params.get("kelly_fraction", 0.0),
            use_kalman=params.get("use_kalman", False),
            kalman_qr_ratio=params.get("kalman_qr_ratio", 0.1),
            htf_exit=params.get("htf_exit", False),
        )

        trades_df = result["trades"]
        equity_df = result["equity"]
        stats = result["stats"]
        grid = result.get("grid")

        # Per-slot yearly & stats
        yearly = _yearly_breakdown(trades_df, stats)
        per_symbol[key] = {"stats": stats, "yearly": yearly}

        # Tag trades with slot key
        if trades_df is not None and len(trades_df) > 0:
            tdf = trades_df.copy()
            tdf["symbol"] = key
            all_trades.append(tdf)

        # Collect equity (resample to daily to avoid huge merges)
        if equity_df is not None and len(equity_df) > 0:
            eq = equity_df[["time", "equity"]].copy()
            eq = eq.set_index("time")
            eq.columns = [key]
            if len(eq) > 5000:
                eq = eq.resample("1D").last().dropna()
            all_equities.append(eq)

        # Collect close prices for correlation (raw symbol, not key — dedup later)
        if grid is not None and len(grid) > 0:
            cp = grid[["close"]].copy()
            cp.columns = [symbol]
            if len(cp) > 5000:
                cp = cp.resample("1D").last().dropna()
            all_close_prices.append(cp)

    update_task(task_id, message="Aggregating results...")

    # --- Merge trades ---
    if all_trades:
        merged_trades = pd.concat(all_trades, ignore_index=True)
        merged_trades.sort_values("exit_time", inplace=True)
    else:
        merged_trades = pd.DataFrame()

    # --- Merge equity curves ---
    initial_capital = capital_per_slot
    total_initial = initial_capital * n

    if all_equities:
        combined_eq = pd.concat(all_equities, axis=1)
        combined_eq = combined_eq.ffill()
        for col in combined_eq.columns:
            combined_eq[col] = combined_eq[col].fillna(initial_capital)
        combined_eq["portfolio"] = combined_eq.sum(axis=1)

        # Downsample if too large
        eq_series = combined_eq[["portfolio"]].copy()
        eq_series.columns = ["equity"]
        if len(eq_series) > MAX_CHART_BARS:
            step = len(eq_series) // MAX_CHART_BARS
            idx = list(range(0, len(eq_series), step))
            if idx[-1] != len(eq_series) - 1:
                idx.append(len(eq_series) - 1)
            eq_series = eq_series.iloc[idx]

        equity_records = _df_to_records(eq_series.reset_index().rename(columns={"index": "time"}))
        final_equity = combined_eq["portfolio"].iloc[-1]

        # Max drawdown from combined equity
        peak = combined_eq["portfolio"].cummax()
        dd = (combined_eq["portfolio"] - peak) / peak * 100
        max_dd_pct = abs(dd.min())
    else:
        equity_records = []
        final_equity = total_initial
        max_dd_pct = 0.0

    # --- Combined stats ---
    elapsed_sec = round(time.monotonic() - t0, 1)
    eq_data_days = 0
    if all_equities:
        eq_start = combined_eq.index[0]
        eq_end = combined_eq.index[-1]
        eq_data_days = (eq_end - eq_start).days
    combined_stats = _compute_combined_stats(
        merged_trades, per_symbol, total_initial, final_equity, max_dd_pct,
        data_days_override=eq_data_days,
        compound=compound,
    )
    combined_stats["elapsed_sec"] = elapsed_sec
    combined_stats["started_at"] = started_at

    # --- Combined yearly ---
    combined_yearly = _combined_yearly_breakdown(merged_trades)

    # --- Correlation matrix (daily returns of underlying prices) ---
    correlation = _compute_correlation(all_close_prices if all_close_prices else all_equities)

    converted = {
        "stats": combined_stats,
        "trades": _df_to_records(merged_trades) if len(merged_trades) > 0 else [],
        "equity": equity_records,
        "yearly": combined_yearly,
        "per_symbol": per_symbol,
        "correlation": correlation,
    }

    # Free M1 cache memory after portfolio run
    try:
        clear_cache = get_cache_clearer()
        clear_cache()
    except Exception:
        pass

    update_task(task_id, progress=100, message="Saving...", result=converted)
    return converted


# ── Statistics ────────────────────────────────────────────────

def _compute_combined_stats(
    trades_df: pd.DataFrame,
    per_symbol: dict,
    total_initial: float,
    final_equity: float,
    max_dd_pct: float,
    data_days_override: int = 0,
    compound: bool = False,
) -> dict:
    """Compute aggregated portfolio stats."""
    total_trades = 0
    long_trades = 0
    short_trades = 0

    for sym, data in per_symbol.items():
        s = data["stats"]
        total_trades += s["total_trades"]
        long_trades += s["long_trades"]
        short_trades += s["short_trades"]

    if trades_df is not None and len(trades_df) > 0:
        winners = trades_df[trades_df["pnl_usd"] > 0]
        losers = trades_df[trades_df["pnl_usd"] <= 0]
        win_rate = round(len(winners) / len(trades_df) * 100, 1) if len(trades_df) > 0 else 0
        gross_profit = winners["pnl_usd"].sum() if len(winners) > 0 else 0
        gross_loss = abs(losers["pnl_usd"].sum()) if len(losers) > 0 else 0
        pf = round(gross_profit / gross_loss, 2) if gross_loss > 0 else float("inf")
        total_pnl_usd = round(trades_df["pnl_usd"].sum(), 2)
        expectancy_usd = round(total_pnl_usd / len(trades_df), 2) if len(trades_df) > 0 else 0
        total_cost_pips = round(trades_df["cost_pips"].sum(), 1) if "cost_pips" in trades_df.columns else 0

        try:
            entry_times = pd.to_datetime(trades_df["entry_time"])
            exit_times = pd.to_datetime(trades_df["exit_time"])
            avg_hold = (exit_times - entry_times).mean()
            avg_holding = str(avg_hold).split(".")[0] if pd.notna(avg_hold) else ""
        except Exception:
            avg_holding = ""

    else:
        win_rate = 0
        pf = 0
        total_pnl_usd = 0
        expectancy_usd = 0
        total_cost_pips = 0
        avg_holding = ""

    data_days = data_days_override if data_days_override > 0 else 0
    years = data_days / 365.25 if data_days > 0 else 1
    if compound and total_initial > 0 and years > 0:
        annual_return = round(((final_equity / total_initial) ** (1 / years) - 1) * 100, 1)
    else:
        annual_return = round((final_equity / total_initial - 1) / years * 100, 1) if total_initial > 0 and years > 0 else 0

    # Annualised Sharpe Ratio & Volatility (daily portfolio returns)
    sharpe_ratio = 0.0
    annual_volatility = 0.0
    if trades_df is not None and len(trades_df) > 0:
        try:
            # Build daily equity from trade PnL
            tdf = trades_df.copy()
            tdf["exit_date"] = pd.to_datetime(tdf["exit_time"]).dt.date
            daily_pnl = tdf.groupby("exit_date")["pnl_usd"].sum()
            daily_equity = total_initial + daily_pnl.cumsum()
            daily_returns = daily_equity.pct_change().dropna()
            if len(daily_returns) > 1 and daily_returns.std() > 0:
                sharpe_ratio = round(daily_returns.mean() / daily_returns.std() * np.sqrt(252), 2)
                annual_volatility = round(daily_returns.std() * np.sqrt(252) * 100, 2)
        except Exception:
            pass

    return {
        "symbol": "Portfolio",
        "timeframe": "",
        "ma_type": "",
        "data_period_days": data_days,
        "total_trades": total_trades,
        "long_trades": long_trades,
        "short_trades": short_trades,
        "win_rate": win_rate,
        "profit_factor": pf,
        "total_pnl_pips": 0,
        "total_cost_pips": total_cost_pips,
        "total_pnl_usd": total_pnl_usd,
        "avg_win_usd": round(gross_profit / len(winners), 2) if trades_df is not None and len(trades_df) > 0 and len(winners) > 0 else 0,
        "avg_loss_usd": round(-gross_loss / len(losers), 2) if trades_df is not None and len(trades_df) > 0 and len(losers) > 0 else 0,
        "expectancy_pips": expectancy_usd,
        "max_drawdown_pct": round(max_dd_pct, 1),
        "annual_return_pct": annual_return,
        "sharpe_ratio": sharpe_ratio,
        "annual_volatility_pct": annual_volatility,
        "avg_holding": avg_holding,
        "initial_capital": total_initial,
        "final_equity": round(final_equity, 2),
    }


def _compute_correlation(all_price_series: list[pd.DataFrame]) -> dict:
    """Compute pairwise correlation of daily returns (last 252 days).
    Deduplicates columns by symbol name for same-symbol multi-strategy slots.
    """
    if len(all_price_series) < 2:
        return {"symbols": [], "matrix": []}

    combined = pd.concat(all_price_series, axis=1).ffill().bfill()
    # Deduplicate columns (same symbol in multiple strategies)
    combined = combined.loc[:, ~combined.columns.duplicated()]
    if combined.shape[1] < 2:
        return {"symbols": [], "matrix": []}

    combined = combined.tail(252)
    returns = combined.pct_change().dropna()

    if len(returns) < 10:
        return {"symbols": [], "matrix": []}

    corr = returns.corr()
    symbols = list(corr.columns)
    matrix = [[round(corr.loc[r, c], 3) for c in symbols] for r in symbols]

    return {"symbols": symbols, "matrix": matrix}


def _combined_yearly_breakdown(trades_df: pd.DataFrame) -> list[dict]:
    """Yearly breakdown across all symbols combined."""
    if trades_df is None or len(trades_df) == 0:
        return []

    df = trades_df.copy()
    df["year"] = pd.to_datetime(df["exit_time"]).dt.year

    rows = []
    for year, grp in df.groupby("year"):
        n = len(grp)
        winners = grp[grp["pnl_usd"] > 0]
        losers = grp[grp["pnl_usd"] <= 0]
        gross_profit = winners["pnl_usd"].sum() if len(winners) > 0 else 0
        gross_loss = abs(losers["pnl_usd"].sum()) if len(losers) > 0 else 0
        pf = gross_profit / gross_loss if gross_loss > 0 else float("inf")

        rows.append({
            "year": int(year),
            "trades": n,
            "win_rate": round(len(winners) / n * 100, 1) if n > 0 else 0,
            "profit_factor": round(pf, 2),
            "net_pnl_pips": round(grp["net_pnl_pips"].sum(), 1),
            "net_pnl_usd": round(grp["pnl_usd"].sum(), 2),
            "avg_pnl_pips": round(grp["net_pnl_pips"].mean(), 1),
        })

    return rows
