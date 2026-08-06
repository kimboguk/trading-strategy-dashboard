# -*- coding: utf-8 -*-
"""개장 자동 진입 러너 — Windows 09:00 스케줄 작업이 실행.

auto_trade ON + 장중일 때만 arm된 pending 진입을 키움에 시장가 제출.
uvicorn 실행 여부와 무관하게 단독 동작(백엔드 패키지 직접 import).
결과는 stdout + order_log 에 기록.
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from services import live_service   # noqa: E402


def main():
    result = live_service.submit_open_entries(market="KRW")
    print(json.dumps(result, ensure_ascii=False, default=str))
    # 게이트로 막힌 경우(gated=True)도 정상 종료(0) — 스케줄러 실패 아님
    return 0


if __name__ == "__main__":
    sys.exit(main())
