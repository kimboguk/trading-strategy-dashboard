import type {
  Market,
  UniverseMeta,
  MarketInfo,
  BacktestRequest,
  BacktestStats,
  TradeRecord,
  YearlyRow,
  EquityPoint,
  PositionAgg,
  TaskStatus,
  SignalState,
  CycleResult,
  OrdersResult,
} from "./types";

const BASE = ""; // same origin via Next.js rewrite

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Universe ──

export async function getMarkets(): Promise<MarketInfo[]> {
  return fetchJSON("/api/universe/markets");
}

export async function getUniverseMeta(market: Market): Promise<UniverseMeta> {
  return fetchJSON(`/api/universe/meta?market=${market}`);
}

// ── Backtest ──

export async function runBacktest(
  req: BacktestRequest
): Promise<{ task_id: string; result_id: string }> {
  return fetchJSON("/api/backtest/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  return fetchJSON(`/api/backtest/${taskId}`);
}

export async function getBacktestStats(taskId: string): Promise<BacktestStats> {
  return fetchJSON(`/api/backtest/${taskId}/stats`);
}

export async function getBacktestTrades(taskId: string): Promise<TradeRecord[]> {
  return fetchJSON(`/api/backtest/${taskId}/trades`);
}

export async function getBacktestEquity(taskId: string): Promise<EquityPoint[]> {
  return fetchJSON(`/api/backtest/${taskId}/equity`);
}

export async function getBacktestYearly(taskId: string): Promise<YearlyRow[]> {
  return fetchJSON(`/api/backtest/${taskId}/yearly`);
}

export async function getBacktestPositions(taskId: string): Promise<PositionAgg[]> {
  return fetchJSON(`/api/backtest/${taskId}/positions`);
}

// ── Backtest History (DB-backed) ──

export interface BacktestHistoryEntry {
  id: string;
  created_at: string;
  params: BacktestRequest;
  stats: BacktestStats;
  yearly: YearlyRow[];
}

export interface BacktestFullResult {
  stats: BacktestStats;
  trades: TradeRecord[];
  equity: EquityPoint[];
  yearly: YearlyRow[];
  positions: PositionAgg[];
}

export async function getBacktestHistory(): Promise<BacktestHistoryEntry[]> {
  return fetchJSON("/api/backtest/history");
}

export async function getSavedBacktestResult(resultId: string): Promise<BacktestFullResult> {
  return fetchJSON(`/api/backtest/saved/${resultId}`);
}

export async function deleteSavedBacktest(resultId: string): Promise<void> {
  await fetchJSON(`/api/backtest/saved/${resultId}`, { method: "DELETE" });
}

// ── Signals / forward ops ──

export async function runSignalCycle(market: Market, as_of?: string): Promise<CycleResult> {
  return fetchJSON("/api/signals/run-cycle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ market, as_of: as_of ?? null }),
  });
}

export async function getSignalState(market: Market): Promise<SignalState> {
  return fetchJSON(`/api/signals/state?market=${market}`);
}

export async function getSignalOrders(market: Market, as_of?: string): Promise<OrdersResult> {
  const q = as_of ? `&as_of=${as_of}` : "";
  return fetchJSON(`/api/signals/orders?market=${market}${q}`);
}

export async function getForwardEquity(market: Market): Promise<EquityPoint[]> {
  return fetchJSON(`/api/signals/equity?market=${market}`);
}

// ── Live ──
import type { LiveConfig, LiveDashboard, OrderLogEntry } from "./types";

export async function getLiveConfig(): Promise<LiveConfig> {
  return fetchJSON("/api/live/config");
}

export async function getLiveDashboard(market: Market): Promise<LiveDashboard> {
  return fetchJSON(`/api/live/dashboard?market=${market}`);
}

export async function setAutoTrade(on: boolean, confirm?: string): Promise<LiveConfig> {
  return fetchJSON("/api/live/auto-trade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ on, confirm: confirm ?? null }),
  });
}

export async function getOrderLog(as_of?: string): Promise<OrderLogEntry[]> {
  const q = as_of ? `?as_of=${as_of}` : "";
  return fetchJSON(`/api/live/orders/log${q}`);
}

/** 데이터 동기화 + 오늘 사이클 실행 (비동기 task → 폴링). 완료 시 cycle result 반환. */
export async function syncAndRun(
  market: Market,
  as_of?: string,
  onProgress?: (p: number, msg?: string) => void,
  signal?: AbortSignal
): Promise<any> {
  const { task_id } = await fetchJSON<{ task_id: string }>("/api/live/sync-and-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ market, as_of: as_of ?? null }),
  });
  while (true) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    await new Promise((r) => setTimeout(r, 2000));
    const s = await fetchJSON<any>(`/api/live/task/${task_id}`);
    onProgress?.(s.progress, s.message);
    if (s.status === "complete") return s.result;
    if (s.status === "error") throw new Error(s.error || "sync/cycle failed");
  }
}

// ── Poll helper ──

export async function pollUntilComplete(
  taskId: string,
  onProgress?: (p: number) => void,
  onMessage?: (msg: string) => void,
  intervalMs = 2000,
  signal?: AbortSignal
): Promise<void> {
  while (true) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const status = await getTaskStatus(taskId);
    if (status.status === "complete") return;
    if (status.status === "error") throw new Error(status.error || "Backtest failed");
    onProgress?.(status.progress);
    if (status.message) onMessage?.(status.message);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
