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

export async function runBacktest(req: BacktestRequest): Promise<{ task_id: string }> {
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

// ── Poll helper ──

export async function pollUntilComplete(
  taskId: string,
  onProgress?: (p: number) => void,
  intervalMs = 2000,
): Promise<void> {
  while (true) {
    const status = await getTaskStatus(taskId);
    if (status.status === "complete") return;
    if (status.status === "error") throw new Error(status.error || "Backtest failed");
    onProgress?.(status.progress);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
