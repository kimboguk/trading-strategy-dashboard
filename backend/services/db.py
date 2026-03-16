# -*- coding: utf-8 -*-
"""PostgreSQL persistence for backtest and portfolio results."""

import json
import psycopg2
from core.config import settings


def _conn():
    return psycopg2.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        dbname=settings.DB_NAME,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
    )


# ── Backtest results ──

def ensure_backtest_table():
    """Create backtest_results table if not exists."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS backtest_results (
            id TEXT PRIMARY KEY,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            params JSONB NOT NULL,
            result JSONB NOT NULL
        )
    """)
    conn.commit()
    cur.close()
    conn.close()


def save_backtest_result(result_id: str, params: dict, result: dict):
    """Save backtest result to DB."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO backtest_results (id, params, result)
           VALUES (%s, %s, %s)
           ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result, params = EXCLUDED.params""",
        (result_id, json.dumps(params), json.dumps(result)),
    )
    conn.commit()
    cur.close()
    conn.close()


def get_backtest_result_by_id(result_id: str) -> dict | None:
    """Fetch a single backtest result by ID."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT result FROM backtest_results WHERE id = %s", (result_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    return row[0] if isinstance(row[0], dict) else json.loads(row[0])


def list_backtest_results(limit: int = 50) -> list[dict]:
    """List recent backtest results (lightweight: id, created_at, params, stats/yearly only)."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, created_at, params,
               result->'stats' AS stats,
               result->'yearly' AS yearly
        FROM backtest_results
        ORDER BY created_at DESC
        LIMIT %s
    """, (limit,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    results = []
    for row in rows:
        results.append({
            "id": row[0],
            "created_at": row[1].isoformat() if row[1] else "",
            "params": row[2] if isinstance(row[2], dict) else json.loads(row[2]),
            "stats": row[3] if isinstance(row[3], dict) else json.loads(row[3]) if row[3] else {},
            "yearly": row[4] if isinstance(row[4], list) else json.loads(row[4]) if row[4] else [],
        })
    return results


def delete_backtest_result(result_id: str):
    """Delete a backtest result."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM backtest_results WHERE id = %s", (result_id,))
    conn.commit()
    cur.close()
    conn.close()


# ── Portfolio results ──

def ensure_portfolio_table():
    """Create portfolio_results table if not exists."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_results (
            id TEXT PRIMARY KEY,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            params JSONB NOT NULL,
            result JSONB NOT NULL
        )
    """)
    conn.commit()
    cur.close()
    conn.close()


def save_portfolio_result(result_id: str, params: dict, result: dict):
    """Save portfolio result to DB."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO portfolio_results (id, params, result)
           VALUES (%s, %s, %s)
           ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result, params = EXCLUDED.params""",
        (result_id, json.dumps(params), json.dumps(result)),
    )
    conn.commit()
    cur.close()
    conn.close()


def get_portfolio_result_by_id(result_id: str) -> dict | None:
    """Fetch a single portfolio result by ID."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT result FROM portfolio_results WHERE id = %s", (result_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    return row[0] if isinstance(row[0], dict) else json.loads(row[0])


def list_portfolio_results(limit: int = 30) -> list[dict]:
    """List recent portfolio results (lightweight: id, created_at, params, stats/yearly only)."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, created_at, params,
               result->'stats' AS stats,
               result->'yearly' AS yearly
        FROM portfolio_results
        ORDER BY created_at DESC
        LIMIT %s
    """, (limit,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    results = []
    for row in rows:
        results.append({
            "id": row[0],
            "created_at": row[1].isoformat() if row[1] else "",
            "params": row[2] if isinstance(row[2], dict) else json.loads(row[2]),
            "stats": row[3] if isinstance(row[3], dict) else json.loads(row[3]) if row[3] else {},
            "yearly": row[4] if isinstance(row[4], list) else json.loads(row[4]) if row[4] else [],
        })
    return results


def delete_portfolio_result(result_id: str):
    """Delete a portfolio result."""
    conn = _conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM portfolio_results WHERE id = %s", (result_id,))
    conn.commit()
    cur.close()
    conn.close()
