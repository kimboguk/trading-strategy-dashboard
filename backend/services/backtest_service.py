# -*- coding: utf-8 -*-
"""Backtest service: wraps run_backtest() and converts results to JSON-friendly dicts."""

import time
from datetime import datetime, timezone, timedelta
import pandas as pd
from bridge.engine_adapter import get_backtest_runner
from services.task_manager import update_task


def run_backtest_task(task_id: str, params: dict) -> dict:
    """Run backtest synchronously (called from thread pool)."""
    update_task(task_id, status="running", message="Starting...")
    KST = timezone(timedelta(hours=9))
    started_at = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    t0 = time.monotonic()

    run_backtest = get_backtest_runner()

    def _on_progress(msg):
        if isinstance(msg, int):
            update_task(task_id, message=f"Processing {msg}...")
        else:
            update_task(task_id, message=str(msg))

    result = run_backtest(
        symbol=params["symbol"],
        timeframe=params["timeframe"],
        ma_type=params.get("ma_type", "ema"),
        start=params.get("start"),
        end=params.get("end"),
        tp_pips=params.get("tp_pips"),
        sl_pips=params.get("sl_pips"),
        filter_tfs=params.get("filter_tfs"),
        alignment_mas=params.get("alignment_mas"),
        ribbon_periods=params.get("ribbon_periods"),
        verbose=False,
        progress_callback=_on_progress,
    )

    elapsed_sec = round(time.monotonic() - t0, 1)
    update_task(task_id, message="Building charts...")

    # Downsample equity curve for large datasets
    equity_df = result["equity"]
    if equity_df is not None and len(equity_df) > MAX_CHART_BARS:
        step = len(equity_df) // MAX_CHART_BARS
        # Keep first, last, and evenly spaced points
        idx = list(range(0, len(equity_df), step))
        if idx[-1] != len(equity_df) - 1:
            idx.append(len(equity_df) - 1)
        equity_df = equity_df.iloc[idx]

    # Convert to JSON-serializable format
    stats = result["stats"]
    stats["elapsed_sec"] = elapsed_sec
    stats["started_at"] = started_at
    converted = {
        "stats": stats,
        "trades": _df_to_records(result["trades"]),
        "equity": _df_to_records(equity_df),
        "grid": _grid_to_chart(result["grid"]),
        "yearly": _yearly_breakdown(result["trades"], result["stats"]),
    }

    # Note: caller (_run_with_error_handling) marks task complete AFTER DB save
    update_task(task_id, progress=100, message="Saving...", result=converted)
    return converted


def _df_to_records(df: pd.DataFrame) -> list[dict]:
    if df is None or len(df) == 0:
        return []
    records = df.copy()
    for col in records.columns:
        if pd.api.types.is_datetime64_any_dtype(records[col]):
            records[col] = records[col].astype(str)
    return records.to_dict(orient="records")


MAX_CHART_BARS = 10_000  # Downsample large datasets for browser performance


def _grid_to_chart(grid: pd.DataFrame) -> dict:
    """Convert grid DataFrame to TradingView chart format (vectorized)."""
    if grid is None or len(grid) == 0:
        return {"candles": [], "ma_lines": {}, "markers": []}

    # Remove duplicate timestamps (can happen with M1/M5 data)
    grid = grid[~grid.index.duplicated(keep="last")]

    # Downsample if too many bars (keep all signal bars + evenly spaced bars)
    if len(grid) > MAX_CHART_BARS:
        step = len(grid) // MAX_CHART_BARS
        sampled_idx = set(range(0, len(grid), step))
        # Always include bars with signals
        if "signal" in grid.columns:
            signal_idx = set(grid.index.get_indexer(grid[grid["signal"] != 0].index))
            sampled_idx |= signal_idx
        keep = sorted(sampled_idx)
        grid = grid.iloc[keep]

    timestamps = (grid.index.astype("int64") // 10**9).tolist()

    # Ensure unique timestamps after downsampling (safety check)
    seen = set()
    unique_idx = []
    for i, ts in enumerate(timestamps):
        if ts not in seen:
            seen.add(ts)
            unique_idx.append(i)
    if len(unique_idx) < len(timestamps):
        grid = grid.iloc[unique_idx]
        timestamps = [timestamps[i] for i in unique_idx]

    # Candles — vectorized
    candles = [
        {"time": ts, "open": o, "high": h, "low": lo, "close": c}
        for ts, o, h, lo, c in zip(
            timestamps,
            grid["open"].tolist(),
            grid["high"].tolist(),
            grid["low"].tolist(),
            grid["close"].tolist(),
        )
    ]

    # MA lines — vectorized, skip NaN
    ma_lines = {}
    for col in ["ma_30", "ma_60", "ma_120", "ma_240"]:
        if col in grid.columns:
            mask = grid[col].notna()
            ts_vals = [timestamps[i] for i in mask.values.nonzero()[0]]
            ma_vals = grid.loc[mask, col].tolist()
            ma_lines[col] = [
                {"time": t, "value": v} for t, v in zip(ts_vals, ma_vals)
            ]

    # Signal markers — vectorized, filter non-zero
    markers = []
    if "signal" in grid.columns:
        sig_series = grid["signal"]
        nonzero = sig_series != 0
        if nonzero.any():
            sig_ts = [timestamps[i] for i in nonzero.values.nonzero()[0]]
            sig_vals = sig_series[nonzero].tolist()
            for ts, sig in zip(sig_ts, sig_vals):
                sig = int(sig)
                if sig in (1, 2):
                    markers.append({
                        "time": ts, "position": "belowBar",
                        "color": "#26a69a", "shape": "arrowUp", "text": "L",
                    })
                elif sig in (-1, -2):
                    markers.append({
                        "time": ts, "position": "aboveBar",
                        "color": "#ef5350", "shape": "arrowDown", "text": "S",
                    })

    return {"candles": candles, "ma_lines": ma_lines, "markers": markers}


def _yearly_breakdown(trades_df: pd.DataFrame, stats: dict) -> list[dict]:
    """Compute yearly performance breakdown."""
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
        pf = gross_profit / gross_loss if gross_loss > 0 else 9999.99

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
