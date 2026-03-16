import type {
  SymbolInfo,
  StrategyInfo,
  BacktestRequest,
  BacktestStats,
  TradeRecord,
  YearlyRow,
  ChartData,
  TaskStatus,
  EquityPoint,
  PortfolioRequest,
  PortfolioResult,
} from "./types";

const BASE = "";  // same origin via Next.js rewrite

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Metadata ──

export async function getSymbols(): Promise<Record<string, SymbolInfo>> {
  return fetchJSON("/api/symbols");
}

export async function getTimeframes(): Promise<string[]> {
  return fetchJSON("/api/timeframes");
}

export async function getStrategies(): Promise<StrategyInfo[]> {
  return fetchJSON("/api/strategies");
}

export async function getSymbolDateRange(symbol: string): Promise<{ start: string; end: string }> {
  return fetchJSON(`/api/symbols/${symbol}/date-range`);
}

// ── Backtest ──

export async function runBacktest(req: BacktestRequest): Promise<{ task_id: string; result_id: string }> {
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

export async function getBacktestChart(taskId: string): Promise<ChartData> {
  return fetchJSON(`/api/backtest/${taskId}/chart`);
}

export async function getBacktestEquity(taskId: string): Promise<EquityPoint[]> {
  return fetchJSON(`/api/backtest/${taskId}/equity`);
}

export async function getBacktestYearly(taskId: string): Promise<YearlyRow[]> {
  return fetchJSON(`/api/backtest/${taskId}/yearly`);
}

// ── Backtest History (DB-backed) ──

export interface BacktestHistoryEntry {
  id: string;
  created_at: string;
  params: import("./types").BacktestRequest;
  stats: import("./types").BacktestStats;
  yearly: import("./types").YearlyRow[];
}

export interface BacktestFullResult {
  stats: import("./types").BacktestStats;
  trades: import("./types").TradeRecord[];
  grid: import("./types").ChartData;
  equity: import("./types").EquityPoint[];
  yearly: import("./types").YearlyRow[];
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

// ── Portfolio ──

export async function runPortfolio(req: PortfolioRequest): Promise<{ task_id: string }> {
  return fetchJSON("/api/portfolio/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

export async function getPortfolioStatus(taskId: string): Promise<TaskStatus> {
  return fetchJSON(`/api/portfolio/${taskId}`);
}

export async function getPortfolioResult(taskId: string): Promise<PortfolioResult> {
  return fetchJSON(`/api/portfolio/${taskId}/result`);
}

// ── Portfolio History (DB-backed) ──

export interface PortfolioHistoryEntry {
  id: string;
  created_at: string;
  params: import("./types").PortfolioRequest;
  stats: import("./types").BacktestStats;
  yearly: import("./types").YearlyRow[];
}

export async function getPortfolioHistory(): Promise<PortfolioHistoryEntry[]> {
  return fetchJSON("/api/portfolio/history");
}

export async function getSavedPortfolioResult(resultId: string): Promise<PortfolioResult> {
  return fetchJSON(`/api/portfolio/saved/${resultId}`);
}

export async function deleteSavedPortfolio(resultId: string): Promise<void> {
  await fetchJSON(`/api/portfolio/saved/${resultId}`, { method: "DELETE" });
}

// ── Poll helper ──

export async function pollUntilComplete(
  taskId: string,
  onProgress?: (p: number) => void,
  onMessage?: (msg: string) => void,
  intervalMs = 2000,
  signal?: AbortSignal,
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

export async function pollPortfolioUntilComplete(
  taskId: string,
  onProgress?: (p: number) => void,
  onMessage?: (msg: string) => void,
  intervalMs = 2000,
  signal?: AbortSignal,
): Promise<void> {
  while (true) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const status = await getPortfolioStatus(taskId);
    if (status.status === "complete") return;
    if (status.status === "error") throw new Error(status.error || "Portfolio backtest failed");
    onProgress?.(status.progress);
    if (status.message) onMessage?.(status.message);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
