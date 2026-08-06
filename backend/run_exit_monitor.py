# -*- coding: utf-8 -*-
"""장중 청산 감시 러너 — 장중 5분 주기 Windows 스케줄 작업이 실행.

보유종목 현재가가 TP/SL 도달 시 시장가 매도(auto_trade ON + 장중).
키움엔 독립 스톱주문이 없어 프로그램 로직으로 구현. uvicorn 무관(단독 동작).
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from services import live_service   # noqa: E402


def main():
    result = live_service.monitor_and_exit(market="KRW")
    print(json.dumps(result, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
