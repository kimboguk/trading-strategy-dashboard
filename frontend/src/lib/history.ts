import type { BacktestRequest, BacktestStats, YearlyRow, ChartData, EquityPoint, TradeRecord } from "./types";

export interface SavedBacktest {
  id: string;
  timestamp: string;
  params: BacktestRequest;
  stats: BacktestStats;
  yearly: YearlyRow[];
  taskId: string;
  chartData?: ChartData | null;
  equityData?: EquityPoint[];
  trades?: TradeRecord[];
}

const STORAGE_KEY = "backtest_history";
const MAX_HISTORY = 50;

export function loadHistory(): SavedBacktest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(entry: SavedBacktest): void {
  const history = loadHistory();
  // Prepend new entry, limit size
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    // localStorage quota exceeded — drop chart/equity/trades from oldest entries
    for (let i = history.length - 1; i >= 1; i--) {
      delete history[i].chartData;
      delete history[i].equityData;
      delete history[i].trades;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        return;
      } catch {}
    }
  }
}

export function deleteFromHistory(id: string): void {
  const history = loadHistory().filter((h) => h.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function formatLabel(params: BacktestRequest): string {
  const parts = [params.symbol, params.timeframe, params.ma_type.toUpperCase()];
  if (params.filter_tfs?.length) parts.push(`+${params.filter_tfs.join("+")}`);
  if (params.tp_pips) parts.push(`TP${params.tp_pips}`);
  if (params.sl_pips) parts.push(`SL${params.sl_pips}`);
  return parts.join(" ");
}
