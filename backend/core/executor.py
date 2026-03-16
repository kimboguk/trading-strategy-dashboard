# -*- coding: utf-8 -*-
"""Shared thread pool executor for background tasks."""

from concurrent.futures import ThreadPoolExecutor

# Single worker process + 4 threads.
# CPU-bound backtest work is GIL-limited, but this allows:
# - concurrent DB I/O (data loading)
# - up to 4 simultaneous backtest/portfolio tasks
executor = ThreadPoolExecutor(max_workers=4)
