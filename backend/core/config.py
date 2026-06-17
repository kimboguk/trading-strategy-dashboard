# -*- coding: utf-8 -*-
"""Dashboard backend settings (US/KR 주식 ATH 전략 전용)."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


# ── 시장별 파라미터 프로파일 ──────────────────────────────────────
# 전략은 동형이되 비용/유동성 임계/가격조정 모드가 시장마다 다름.
# 백테스트 요청에서 미지정한 값은 여기서 채운다.
MARKET_PROFILES: dict = {
    "USD": {
        "label": "US (Alpaca)",
        "price_mode": "adjusted",        # 수정주가 정상 → 분할 가짜신호 방지
        "initial_capital": 100_000,      # USD
        "min_trading_value": 0,          # USD 거래대금 하한 (0=off, 추후 튜닝)
        "buy_commission": 0.0,           # Alpaca 무료수수료
        "sell_commission": 0.0,
        "sell_tax": 0.0,                 # 미국 매도세 없음
    },
    "KRW": {
        "label": "KR (한국투자/키움)",
        "price_mode": "raw",             # 공개 adj 오염 → 큐레이션 종목은 raw 사용
        "initial_capital": 100_000_000,  # KRW (1억)
        "min_trading_value": 1_000_000_000,  # 20일 평균 거래대금 ≥ 10억
        "buy_commission": 0.00015,
        "sell_commission": 0.00015,
        "sell_tax": 0.0020,
    },
}


class Settings:
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", 5432))
    DB_NAME: str = os.getenv("DB_NAME", "equity")
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")   # 빈값 = peer 인증

    # ATH 백테스트 엔진 repo (run_ath_volume_breakout.py / daily_signals.py)
    STRATEGY_ROOT: Path = Path(os.getenv(
        "STRATEGY_ROOT",
        r"D:\study\finance\trading\strategy-test"
    ))

    EXECUTION_MODE: str = os.getenv("EXECUTION_MODE", "manual")  # manual | alpaca | kis

    DEFAULT_MARKET: str = os.getenv("DEFAULT_MARKET", "KRW")
    MARKET_PROFILES: dict = MARKET_PROFILES

    CORS_ORIGINS: list = ["http://localhost:3000"]

    def profile(self, market: str) -> dict:
        return self.MARKET_PROFILES.get(market, self.MARKET_PROFILES[self.DEFAULT_MARKET])


settings = Settings()
