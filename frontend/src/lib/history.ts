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

const MAX_STORAGE_BYTES = 4 * 1024 * 1024; // 4MB safety margin under 5MB limit

export function saveToHistory(entry: SavedBacktest): void {
  const history = loadHistory();
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;

  // Try saving, progressively strip large data if quota exceeded
  if (_trySave(history)) return;

  // Step 1: strip chart/equity/trades from older entries
  for (let i = history.length - 1; i >= 1; i--) {
    delete history[i].chartData;
    delete history[i].equityData;
    delete history[i].trades;
  }
  if (_trySave(history)) return;

  // Step 2: strip trades from current entry (largest after chart)
  delete history[0].trades;
  if (_trySave(history)) return;

  // Step 3: strip chart from current entry
  delete history[0].chartData;
  if (_trySave(history)) return;

  // Step 4: strip equity from current entry
  delete history[0].equityData;
  _trySave(history);
}

function _trySave(history: SavedBacktest[]): boolean {
  try {
    const json = JSON.stringify(history);
    if (json.length > MAX_STORAGE_BYTES) return false;
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch {
    return false;
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
  if (params.ribbon_periods && params.ribbon_periods.length < 4) {
    parts.push(`R${[...params.ribbon_periods].sort((a, b) => a - b).join("|")}`);
  } else {
    parts.push("RT");
  }
  if (params.alignment_mas && params.alignment_mas.length >= 2) {
    parts.push(params.alignment_mas.sort((a, b) => a - b).join("|"));
  }
  if (params.tp_pips) parts.push(`TP${params.tp_pips}`);
  if (params.sl_pips) parts.push(`SL${params.sl_pips}`);
  return parts.join(" ");
}
