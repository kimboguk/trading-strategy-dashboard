# -*- coding: utf-8 -*-
"""FastAPI application entry point."""

import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from bridge.ath_bridge import init_engine_path
from services.db import ensure_backtest_table, ensure_forward_tables
from routers import universe, backtest, signals


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_engine_path()
    ensure_backtest_table()
    ensure_forward_tables()
    yield


app = FastAPI(
    title="Trading Dashboard API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(universe.router)
app.include_router(backtest.router)
app.include_router(signals.router)
