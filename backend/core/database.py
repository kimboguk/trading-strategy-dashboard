# -*- coding: utf-8 -*-
"""Database connection pool."""

import psycopg2
from psycopg2 import pool
from core.config import settings

_pool: pool.SimpleConnectionPool | None = None


def get_pool() -> pool.SimpleConnectionPool:
    global _pool
    if _pool is None:
        params = {
            "host": settings.DB_HOST,
            "port": settings.DB_PORT,
            "dbname": settings.DB_NAME,
            "user": settings.DB_USER,
        }
        if settings.DB_PASSWORD:
            params["password"] = settings.DB_PASSWORD
        _pool = pool.SimpleConnectionPool(1, 5, **params)
    return _pool


def get_conn():
    return get_pool().getconn()


def put_conn(conn):
    get_pool().putconn(conn)
