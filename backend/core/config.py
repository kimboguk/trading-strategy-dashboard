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

    EXECUTION_MODE: str = os.getenv("EXECUTION_MODE", "manual")  # manual | alpaca | kis | kiwoom

    DEFAULT_MARKET: str = os.getenv("DEFAULT_MARKET", "KRW")
    MARKET_PROFILES: dict = MARKET_PROFILES

    CORS_ORIGINS: list = ["http://localhost:3000"]

    # ── 키움 REST (라이브) — 모의/실전 이중 키셋, KIWOOM_ENV로 활성 선택 ──
    KIWOOM_ENV: str = os.getenv("KIWOOM_ENV", "mock")            # mock | real
    KIWOOM_MOCK_APP_KEY: str = os.getenv("KIWOOM_MOCK_APP_KEY", "").strip()
    KIWOOM_MOCK_APP_SECRET: str = os.getenv("KIWOOM_MOCK_APP_SECRET", "").strip()
    KIWOOM_MOCK_ACCOUNT_NO: str = os.getenv("KIWOOM_MOCK_ACCOUNT_NO", "").strip()
    KIWOOM_REAL_APP_KEY: str = os.getenv("KIWOOM_REAL_APP_KEY", "").strip()
    KIWOOM_REAL_APP_SECRET: str = os.getenv("KIWOOM_REAL_APP_SECRET", "").strip()
    KIWOOM_REAL_ACCOUNT_NO: str = os.getenv("KIWOOM_REAL_ACCOUNT_NO", "").strip()
    KIWOOM_MOCK_BASE_URL: str = os.getenv("KIWOOM_MOCK_BASE_URL", "https://mockapi.kiwoom.com")
    KIWOOM_REAL_BASE_URL: str = os.getenv("KIWOOM_REAL_BASE_URL", "https://api.kiwoom.com")

    # 활성 환경(KIWOOM_ENV)에 해당하는 키/계좌
    @property
    def KIWOOM_APP_KEY(self) -> str:
        return self.KIWOOM_REAL_APP_KEY if self.KIWOOM_ENV == "real" else self.KIWOOM_MOCK_APP_KEY

    @property
    def KIWOOM_APP_SECRET(self) -> str:
        return self.KIWOOM_REAL_APP_SECRET if self.KIWOOM_ENV == "real" else self.KIWOOM_MOCK_APP_SECRET

    @property
    def KIWOOM_ACCOUNT_NO(self) -> str:
        return self.KIWOOM_REAL_ACCOUNT_NO if self.KIWOOM_ENV == "real" else self.KIWOOM_MOCK_ACCOUNT_NO

    # ── 자동매매 안전 캡 ────────────────────────────────────────
    MAX_ORDERS_PER_CYCLE: int = int(os.getenv("MAX_ORDERS_PER_CYCLE", 10))
    MAX_NOTIONAL_PER_ORDER: float = float(os.getenv("MAX_NOTIONAL_PER_ORDER", 5_000_000))  # KRW

    LIVE_SCHEMA_PATH = property(lambda self: self.STRATEGY_ROOT / "live_schema.sql")

    def profile(self, market: str) -> dict:
        return self.MARKET_PROFILES.get(market, self.MARKET_PROFILES[self.DEFAULT_MARKET])

    def kiwoom_base_url(self) -> str:
        return self.KIWOOM_REAL_BASE_URL if self.KIWOOM_ENV == "real" else self.KIWOOM_MOCK_BASE_URL

    def broker_configured(self) -> bool:
        """키움 실주문 가능 여부 (모드=kiwoom + 키/계좌 존재)."""
        return (self.EXECUTION_MODE == "kiwoom"
                and bool(self.KIWOOM_APP_KEY and self.KIWOOM_APP_SECRET and self.KIWOOM_ACCOUNT_NO))

    def mask_account(self) -> str:
        a = self.KIWOOM_ACCOUNT_NO
        return ("*" * max(0, len(a) - 4) + a[-4:]) if a else ""

    def live_config(self) -> dict:
        """UI용 비밀 제외 라이브 설정 뷰."""
        return {
            "execution_mode": self.EXECUTION_MODE,
            "kiwoom_env": self.KIWOOM_ENV,
            "broker_configured": self.broker_configured(),
            "account_masked": self.mask_account(),
            "max_orders_per_cycle": self.MAX_ORDERS_PER_CYCLE,
            "max_notional_per_order": self.MAX_NOTIONAL_PER_ORDER,
        }


settings = Settings()
