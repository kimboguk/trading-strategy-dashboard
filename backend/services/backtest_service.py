# -*- coding: utf-8 -*-
"""Backtest service: wraps run_backtest() and converts results to JSON-friendly dicts."""

import pandas as pd
from bridge.engine_adapter import get_backtest_runner
from services.task_manager import update_task


def run_backtest_task(task_id: str, params: dict) -> dict:
    """Run backtest synchronously (called from thread pool)."""
    update_task(task_id, status="running", progress=10)

    run_backtest = get_backtest_runner()

    result = run_backtest(
        symbol=params["symbol"],
        timeframe=params["timeframe"],
        ma_type=params.get("ma_type", "ema"),
        start=params.get("start"),
        end=params.get("end"),
        tp_pips=params.get("tp_pips"),
        sl_pips=params.get("sl_pips"),
        filter_tfs=params.get("filter_tfs"),
        verbose=False,
    )

    update_task(task_id, progress=80)

    # Convert to JSON-serializable format
    converted = {
        "stats": result["stats"],
        "trades": _df_to_records(result["trades"]),
        "equity": _df_to_records(result["equity"]),
        "grid": _grid_to_chart(result["grid"]),
        "yearly": _yearly_breakdown(result["trades"], result["stats"]),
    }

    update_task(task_id, status="complete", progress=100, result=converted)
    return converted


def _df_to_records(df: pd.DataFrame) -> list[dict]:
    if df is None or len(df) == 0:
        return []
    records = df.copy()
    for col in records.columns:
        if pd.api.types.is_datetime64_any_dtype(records[col]):
            records[col] = records[col].astype(str)
    return records.to_dict(orient="records")


def _grid_to_chart(grid: pd.DataFrame) -> dict:
    """Convert grid DataFrame to TradingView chart format."""
    if grid is None or len(grid) == 0:
        return {"candles": [], "ma_lines": {}, "markers": []}

    # Candles
    candles = []
    for t, row in grid.iterrows():
        candles.append({
            "time": int(t.timestamp()),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
        })

    # MA lines
    ma_lines = {}
    ma_colors = {"ma_30": "#2196F3", "ma_60": "#FF9800", "ma_120": "#4CAF50", "ma_240": "#F44336"}
    for col in ["ma_30", "ma_60", "ma_120", "ma_240"]:
        if col in grid.columns:
            line = []
            for t, row in grid.iterrows():
                v = row[col]
                if pd.notna(v):
                    line.append({"time": int(t.timestamp()), "value": float(v)})
            ma_lines[col] = line

    # Signal markers
    markers = []
    if "signal" in grid.columns:
        for t, row in grid.iterrows():
            sig = int(row["signal"])
            if sig == 0:
                continue
            ts = int(t.timestamp())
            if sig in (1, 2):
                markers.append({
                    "time": ts,
                    "position": "belowBar",
                    "color": "#26a69a",
                    "shape": "arrowUp",
                    "text": "L",
                })
            elif sig in (-1, -2):
                markers.append({
                    "time": ts,
                    "position": "aboveBar",
                    "color": "#ef5350",
                    "shape": "arrowDown",
                    "text": "S",
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
