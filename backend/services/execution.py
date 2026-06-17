# -*- coding: utf-8 -*-
"""실행 어댑터 — 시장 인지형 추상화. 현재는 수동(ManualForward)만 결선.

운용 방식 = 신호 산출 + 수동 집행. forward 사이클이 '가상 브로커' 역할을 하고,
어댑터는 사용자가 실제 증권사에서 미러링할 주문 티켓을 반환한다.
실거래(Alpaca/KIS)는 후속 — 인터페이스만 정의.
"""

from typing import Protocol, List, Dict
from core.config import settings


class ExecutionAdapter(Protocol):
    name: str

    def submit_entry(self, order: dict) -> dict: ...
    def submit_exit(self, order: dict) -> dict: ...
    def get_fills(self) -> List[dict]: ...


class ManualForwardAdapter:
    """no-op 브로커 — 집행은 사용자가 수동. 주문을 티켓 형태로 되돌려줄 뿐."""
    name = "manual"

    def submit_entry(self, order: dict) -> dict:
        return {**order, "side": "BUY", "status": "manual_pending"}

    def submit_exit(self, order: dict) -> dict:
        return {**order, "side": "SELL", "status": "manual_pending"}

    def get_fills(self) -> List[dict]:
        return []


class AlpacaAdapter:
    """US 실거래 (후속). Alpaca REST/trading API.
    TODO: API key/secret, paper-vs-live base url, fractional shares, market/limit order.
    """
    name = "alpaca"

    def __init__(self, *_, **__):
        raise NotImplementedError("AlpacaAdapter는 후속 구현 — 현재 manual 모드만 지원")


class KISAdapter:
    """KR 실거래 (후속). 한국투자증권 Open API.
    TODO: OAuth token 발급, 해외/국내 주문 엔드포인트, 모의투자 도메인.
    """
    name = "kis"

    def __init__(self, *_, **__):
        raise NotImplementedError("KISAdapter는 후속 구현 — 현재 manual 모드만 지원")


_ADAPTERS = {"manual": ManualForwardAdapter, "alpaca": AlpacaAdapter, "kis": KISAdapter}


def get_adapter(mode: str | None = None) -> ExecutionAdapter:
    mode = mode or settings.EXECUTION_MODE
    cls = _ADAPTERS.get(mode, ManualForwardAdapter)
    return cls()
