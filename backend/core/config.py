# -*- coding: utf-8 -*-
"""Dashboard backend settings."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


class Settings:
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", 5432))
    DB_NAME: str = os.getenv("DB_NAME", "ict_trading")
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")

    STRATEGY_ROOT: Path = Path(os.getenv(
        "STRATEGY_ROOT",
        r"C:\Users\eldorado\Documents\study\finance\trading\strategy"
    ))

    CORS_ORIGINS: list = ["http://localhost:3000"]


settings = Settings()
