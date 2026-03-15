// ── API Types ──

export interface SymbolInfo {
  pip_size: number;
  spread_pips: number;
  commission_pips: number;
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
  profit_factor: number;
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
  profit_factor: number;
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
