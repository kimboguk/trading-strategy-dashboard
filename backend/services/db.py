# -*- coding: utf-8 -*-
"""PostgreSQL persistence for backtest and portfolio results."""

import json
import psycopg2
from core.config import settings


def _conn():
    params = {
        "host": settings.DB_HOST,
        "port": settings.DB_PORT,
        "dbname": settings.DB_NAME,
        "user": settings.DB_USER,
    }
    if settings.DB_PASSWORD:          # 빈값이면 생략 (peer/trust)
        params["password"] = settings.DB_PASSWORD
    return psycopg2.connect(**params)


def ensure_forward_tables():
    """forward_signals/forward_positions/forward_capital 생성 (strategy-test 스키마 재사용)."""
    schema_path = settings.STRATEGY_ROOT / "forward_test_schema.sql"
    sql = schema_path.read_text(encoding="utf-8")
    conn = _conn()
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()


# ── 라이브 (live_settings / order_log) ──────────────────────────

def ensure_live_tables():
    """live_settings/order_log 생성 (strategy-test/live_schema.sql)."""
    sql = (settings.STRATEGY_ROOT / "live_schema.sql").read_text(encoding="utf-8")
    conn = _conn(); cur = conn.cursor()
    cur.execute(sql); conn.commit(); cur.close(); conn.close()


def get_live_settings() -> dict:
    conn = _conn(); cur = conn.cursor()
    cur.execute("SELECT auto_trade, kiwoom_env, updated_at, updated_by FROM live_settings WHERE id=1")
    row = cur.fetchone(); cur.close(); conn.close()
    if not row:
        return {"auto_trade": False, "kiwoom_env": "mock", "updated_at": None, "updated_by": None}
    return {"auto_trade": bool(row[0]), "kiwoom_env": row[1],
            "updated_at": row[2].isoformat() if row[2] else None, "updated_by": row[3]}


def set_auto_trade(on: bool, by: str = None):
    conn = _conn(); cur = conn.cursor()
    cur.execute("UPDATE live_settings SET auto_trade=%s, updated_at=NOW(), updated_by=%s WHERE id=1",
                (on, by))
    conn.commit(); cur.close(); conn.close()


_ORDER_LOG_COLS = ["cycle_as_of", "market", "side", "ticker", "product_id", "qty", "price",
                   "order_type", "broker_env", "adapter", "intent", "broker_order_id",
                   "status", "raw_request", "raw_response", "error", "forward_position_id"]


def insert_order_log(row: dict) -> int:
    vals = []
    for c in _ORDER_LOG_COLS:
        v = row.get(c)
        if c in ("raw_request", "raw_response") and v is not None and not isinstance(v, str):
            v = json.dumps(v, default=str)
        vals.append(v)
    ph = ", ".join(["%s"] * len(_ORDER_LOG_COLS))
    conn = _conn(); cur = conn.cursor()
    cur.execute(f"INSERT INTO order_log ({', '.join(_ORDER_LOG_COLS)}) VALUES ({ph}) RETURNING id", vals)
    oid = cur.fetchone()[0]
    conn.commit(); cur.close(); conn.close()
    return oid


def auto_order_exists(as_of: str, side: str, ticker: str) -> bool:
    """해당 일자·방향·종목에 이미 auto 주문(제출/거부 포함)이 있는지. 중복 청산 방지용."""
    conn = _conn(); cur = conn.cursor()
    cur.execute(
        """SELECT 1 FROM order_log
           WHERE cycle_as_of=%s AND side=%s AND ticker=%s AND intent='auto' LIMIT 1""",
        (as_of, side, ticker))
    r = cur.fetchone(); cur.close(); conn.close()
    return r is not None


def reserve_order_log(row: dict) -> int | None:
    """자동매매 멱등 예약 — 동일 (cycle_as_of, side, ticker) intent='auto' 이미 있으면 None.
    유니크 부분인덱스(uq_order_log_auto)로 원자적 예약 → 제출 전에 슬롯 확보."""
    vals = []
    for c in _ORDER_LOG_COLS:
        v = row.get(c)
        if c in ("raw_request", "raw_response") and v is not None and not isinstance(v, str):
            v = json.dumps(v, default=str)
        vals.append(v)
    ph = ", ".join(["%s"] * len(_ORDER_LOG_COLS))
    conn = _conn(); cur = conn.cursor()
    cur.execute(
        f"""INSERT INTO order_log ({', '.join(_ORDER_LOG_COLS)}) VALUES ({ph})
            ON CONFLICT (cycle_as_of, side, ticker) WHERE intent = 'auto'
            DO NOTHING RETURNING id""",
        vals,
    )
    r = cur.fetchone()
    conn.commit(); cur.close(); conn.close()
    return r[0] if r else None


def update_order_log(oid: int, fields: dict):
    """예약된 order_log 행을 브로커 응답으로 갱신."""
    cols, vals = [], []
    for k, v in fields.items():
        if k in ("raw_request", "raw_response") and v is not None and not isinstance(v, str):
            v = json.dumps(v, default=str)
        cols.append(f"{k}=%s"); vals.append(v)
    if not cols:
        return
    vals.append(oid)
    conn = _conn(); cur = conn.cursor()
    cur.execute(f"UPDATE order_log SET {', '.join(cols)} WHERE id=%s", vals)
    conn.commit(); cur.close(); conn.close()


def order_log_summary(as_of: str = None) -> dict:
    """당일(as_of) 자동주문 상태 집계 — 대시보드 카운트용."""
    conn = _conn(); cur = conn.cursor()
    if as_of:
        cur.execute("""SELECT status, count(*) FROM order_log
                       WHERE cycle_as_of=%s GROUP BY status""", (as_of,))
    else:
        cur.execute("""SELECT status, count(*) FROM order_log
                       WHERE cycle_as_of=(SELECT max(cycle_as_of) FROM order_log)
                       GROUP BY status""")
    counts = {row[0]: row[1] for row in cur.fetchall()}
    cur.close(); conn.close()
    submitted = sum(v for k, v in counts.items() if k in ("submitted", "filled"))
    failed = sum(v for k, v in counts.items() if k in ("failed", "error", "rejected"))
    skipped = counts.get("skipped", 0)
    return {"by_status": counts, "submitted": submitted,
            "failed": failed, "skipped": skipped, "total": sum(counts.values())}


def list_order_log(limit: int = 100, as_of: str = None) -> list:
    conn = _conn(); cur = conn.cursor()
    if as_of:
        cur.execute("""SELECT id, created_at, cycle_as_of, market, side, ticker, product_id, qty,
                              price, order_type, broker_env, adapter, intent, broker_order_id, status, error
                       FROM order_log WHERE cycle_as_of=%s ORDER BY created_at DESC LIMIT %s""",
                    (as_of, limit))
    else:
        cur.execute("""SELECT id, created_at, cycle_as_of, market, side, ticker, product_id, qty,
                              price, order_type, broker_env, adapter, intent, broker_order_id, status, error
                       FROM order_log ORDER BY created_at DESC LIMIT %s""", (limit,))
    rows = cur.fetchall(); cur.close(); conn.close()
    keys = ["id", "created_at", "cycle_as_of", "market", "side", "ticker", "product_id", "qty",
            "price", "order_type", "broker_env", "adapter", "intent", "broker_order_id", "status", "error"]
    out = []
    for r in rows:
        d = dict(zip(keys, r))
        d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
        d["cycle_as_of"] = d["cycle_as_of"].isoformat() if d["cycle_as_of"] else None
        d["price"] = float(d["price"]) if d["price"] is not None else None
        out.append(d)
    return out


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
