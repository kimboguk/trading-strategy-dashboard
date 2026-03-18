// ── Helpers ──

export function fmtPF(pf: number | string): string {
  if (typeof pf === "string") return pf;
  return pf.toFixed(2);
}

export function pfColor(pf: number | string): string {
  if (typeof pf === "string") return "var(--green)";
  return pf >= 1.3 ? "var(--green)" : pf >= 1 ? "var(--text-primary)" : "var(--red)";
}

// ── API Types ──

export interface SymbolInfo {
  category: "forex" | "index" | "crypto";
  pip_size: number;
  spread_pips: number;
  commission_pips: number;
  quote_ccy: string;
}

export interface StrategyInfo {
  id: string;
  name: string;
  description: string;
  ma_types: string[];
}

export interface BacktestRequest {
  strategy: string;
  symbol: string;
  timeframe: string;
  ma_type: string;
  start?: string;
  end?: string;
  tp_pips?: number;
  sl_pips?: number;
  filter_tfs?: string[];
  alignment_mas?: number[];
  ribbon_periods?: number[];
  fast_period?: number;
  slow_period?: number;
}

export interface BacktestStats {
  symbol: string;
  timeframe: string;
  ma_type: string;
  data_period_days: number;
  total_trades: number;
  long_trades: number;
  short_trades: number;
  win_rate: number;
  profit_factor: number | string;
  total_pnl_pips: number;
  total_cost_pips: number;
  total_pnl_usd: number;
  avg_win_usd: number;
  avg_loss_usd: number;
  expectancy_pips: number;
  max_drawdown_pct: number;
  annual_return_pct: number;
  avg_holding: string;
  initial_capital: number;
  final_equity: number;
  elapsed_sec?: number;
  started_at?: string;
}

export interface TradeRecord {
  entry_time: string;
  exit_time: string;
  direction: string;
  entry_price: number;
  exit_price: number;
  pnl_pips: number;
  cost_pips: number;
  net_pnl_pips: number;
  pnl_usd: number;
  equity_after: number;
  exit_reason: string;
}

export interface YearlyRow {
  year: number;
  trades: number;
  win_rate: number;
  profit_factor: number | string;
  net_pnl_pips: number;
  net_pnl_usd: number;
  avg_pnl_pips: number;
}

export interface OHLCVBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LinePoint {
  time: number;
  value: number;
}

export interface SignalMarker {
  time: number;
  position: string;
  color: string;
  shape: string;
  text: string;
}

export interface ChartData {
  candles: OHLCVBar[];
  ma_lines: Record<string, LinePoint[]>;
  markers: SignalMarker[];
}

export interface TaskStatus {
  task_id: string;
  status: "pending" | "running" | "complete" | "error";
  progress: number;
  message?: string;
  error?: string;
}

export interface EquityPoint {
  time: string;
  equity: number;
}

// ── Portfolio Types ──

export interface PortfolioRequest {
  strategy: string;
  symbols: string[];
  timeframe: string;
  ma_type: string;
  start?: string;
  end?: string;
  tp_pips?: number;
  sl_pips?: number;
  filter_tfs?: string[];
  alignment_mas?: number[];
  ribbon_periods?: number[];
  fast_period?: number;
  slow_period?: number;
}

export interface PortfolioTradeRecord extends TradeRecord {
  symbol: string;
}

export interface PerSymbolResult {
  stats: BacktestStats;
  yearly: YearlyRow[];
}

export interface CorrelationData {
  symbols: string[];
  matrix: number[][];
}

export interface PortfolioResult {
  stats: BacktestStats;
  trades: PortfolioTradeRecord[];
  equity: EquityPoint[];
  yearly: YearlyRow[];
  per_symbol: Record<string, PerSymbolResult>;
  correlation?: CorrelationData;
}
