import type { PortfolioRequest, BacktestStats, YearlyRow } from "./types";

export interface SavedPortfolio {
  id: string;
  timestamp: string;
  params: PortfolioRequest;
  stats: BacktestStats;
  yearly: YearlyRow[];
  taskId: string;
}

const STORAGE_KEY = "portfolio_history";
const MAX_HISTORY = 30;

export function loadPortfolioHistory(): SavedPortfolio[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePortfolioHistory(entry: SavedPortfolio): void {
  const history = loadPortfolioHistory();
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;

  try {
    const json = JSON.stringify(history);
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Quota exceeded — trim older entries and retry
    while (history.length > 1) {
      history.pop();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        return;
      } catch {
        continue;
      }
    }
  }
}

export function deletePortfolioHistory(id: string): void {
  const history = loadPortfolioHistory().filter((h) => h.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch { /* ignore */ }
}

export function clearPortfolioHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function formatPortfolioLabel(params: PortfolioRequest): string {
  const n = params.symbols.length;
  const parts = [`${n}sym`, params.timeframe, params.ma_type.toUpperCase()];
  if (params.filter_tfs?.length) parts.push(`+${params.filter_tfs.join("+")}`);
  if (params.tp_pips) parts.push(`TP${params.tp_pips}`);
  if (params.sl_pips) parts.push(`SL${params.sl_pips}`);
  return parts.join(" ");
}
