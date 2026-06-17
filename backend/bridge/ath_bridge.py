# -*- coding: utf-8 -*-
"""ATH 백테스트 엔진(strategy-test) 직접 import 브리지.

기존 forex 동적 import 어댑터(engine_adapter.py)를 대체.
run_ath_volume_breakout.py / daily_signals.py 는 자기완결 모듈이라
STRATEGY_ROOT 를 sys.path 에 한 번만 넣고 그대로 import 한다.
"""

import sys
import importlib

from core.config import settings   # load_dotenv 가 먼저 실행되어 os.environ 세팅됨

_initialized = False


def init_engine_path():
    """STRATEGY_ROOT 를 sys.path 에 1회 삽입 (idempotent)."""
    global _initialized
    root = str(settings.STRATEGY_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)
    _initialized = True


def get_engine():
    """run_ath_volume_breakout 모듈 반환."""
    if not _initialized:
        init_engine_path()
    return importlib.import_module("run_ath_volume_breakout")


def get_daily_signals():
    """daily_signals 모듈 반환 (forward-test 사이클 함수)."""
    if not _initialized:
        init_engine_path()
    return importlib.import_module("daily_signals")
