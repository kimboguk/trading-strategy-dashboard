# -*- coding: utf-8 -*-
"""
Bridge layer: imports existing strategy modules by manipulating sys.path.

This lets us reuse trend_grid/backtest.py, strategy.py, config.py
and statarb/data_loader.py without copying or refactoring them.
"""

import sys
from pathlib import Path
from core.config import settings

_initialized = False


def init_strategy_paths():
    """Add strategy directories to sys.path (idempotent)."""
    global _initialized
    if _initialized:
        return

    trend_grid = str(settings.STRATEGY_ROOT / "trend_grid")
    statarb = str(settings.STRATEGY_ROOT / "statarb")

    # trend_grid first (its config.py, backtest.py take priority)
    # statarb second (data_loader.py)
    # Do NOT add ICT — it has conflicting module names
    for p in [statarb, trend_grid]:
        if p not in sys.path:
            sys.path.insert(0, p)

    _initialized = True


def get_backtest_runner():
    """Return the run_backtest function from trend_grid."""
    init_strategy_paths()
    from backtest import run_backtest
    return run_backtest


def get_symbols_config():
    """Return SYMBOLS dict from DB symbols table, merged with trend_grid config defaults."""
    import psycopg2
    from core.config import settings

    # Load from DB
    conn = psycopg2.connect(
        host=settings.DB_HOST, port=settings.DB_PORT,
        dbname=settings.DB_NAME, user=settings.DB_USER,
        password=settings.DB_PASSWORD,
    )
    cur = conn.cursor()
    cur.execute("SELECT name, pip_size, spread_pips, commission_pips FROM symbols ORDER BY id")
    rows = cur.fetchall()
    conn.close()

    # Also load config defaults for extra fields (quote_ccy, lot_size)
    init_strategy_paths()
    from config import SYMBOLS as config_symbols

    symbols = {}
    for name, pip_size, spread_pips, commission_pips in rows:
        entry = {
            "pip_size": float(pip_size),
            "spread_pips": float(spread_pips),
            "commission_pips": float(commission_pips),
        }
        # Merge extra fields from config if available
        if name in config_symbols:
            for k in ("quote_ccy", "lot_size"):
                if k in config_symbols[name]:
                    entry[k] = config_symbols[name][k]
        else:
            # Infer quote_ccy from symbol name
            entry["quote_ccy"] = "JPY" if name.endswith("JPY") or name.endswith("CHF") else "USD"
        symbols[name] = entry

    return symbols


def get_data_loader():
    """Return DataLoader class from statarb."""
    init_strategy_paths()
    from data_loader import DataLoader
    return DataLoader


def get_cache_clearer():
    """Return the clear_m1_cache function from trend_grid backtest."""
    init_strategy_paths()
    from backtest import clear_m1_cache
    return clear_m1_cache
