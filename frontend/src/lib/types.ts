// ── Helpers ──

export function fmtPF(pf: number | string): string {
  if (typeof pf === "string") return pf;
  return pf.toFixed(2);
}

export function pfColor(pf: number | string): string {
  if (typeof pf === "string") return "var(--green)";
  return pf >= 1.3 ? "var(--green)" : pf >= 1 ? "var(--text-primary)" : "var(--red)";
}

export type Market = "USD" | "KRW";

// ── Universe meta ──

export interface UniverseMeta {
  market: Market;
  label: string;
  n_selected: number;
  n_total: number;
  data_start: string | null;
  data_end: string | null;
  lookbacks_available: number[];
  rankings: string[];
  entry_timings: string[];
  price_modes: string[];
  defaults: {
    price_mode: string;
    initial_capital: number;
    min_trading_value: number;
    buy_commission: number;
    sell_commission: number;
    sell_tax: number;
  };
}

export interface MarketInfo {
  market: Market;
  label: string;
}

// ── Backtest ──

export interface BacktestRequest {
  market: Market;
  start?: string;
  end?: string;
  ath_ratio: number;
  vol_ratio: number;
  min_trading_value?: number | null;
  top_n: number;
  tp_pct: number;
  sl_pct: number;
  no_sl: boolean;
  slot_fraction: number;
  entry_timing: string;
  ranking: string;
  lookback: number;
  quality_filter: boolean;
  price_mode?: string | null;
  initial_capital?: number | null;
}

export interface BacktestStats {
  trades: number;
  win_rate_pct: number;
  profit_factor: number | string;
  rrr: number | string;
  avg_win: number;
  avg_loss: number;
  total_pnl: number;
  final_equity: number;
  total_return_pct: number;
  ann_return_pct: number;
  mdd_pct: number;
  avg_holding_days: number;
  exit_reasons: Record<string, number>;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  ann_volatility_pct: number;
  market: Market;
  initial_capital: number;
  price_mode: string;
  ranking: string;
  lookback: number;
  period_start: string | null;
  period_end: string | null;
  n_trading_days: number;
  elapsed_sec?: number;
}

export interface TradeRecord {
  ticker: string;
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  shares: number;
  pnl: number;
  pnl_pct: number;
  exit_reason: string;
  holding_days: number;
}

export interface YearlyRow {
  year: number;
  trades: number;
  win_rate: number;
  profit_factor: number | string;
  rrr: number | string;
  net_pnl: number;
  eoy_equity: number;
  year_return_pct: number;
  year_mdd_pct: number;
}

export interface EquityPoint {
  time: string;
  equity: number;
  cash?: number;
  positions_value?: number;
  n_positions?: number;
}

export interface PositionAgg {
  ticker: string;
  n_trades: number;
  total_pnl: number;
  win_rate: number;
}

export interface TaskStatus {
  task_id: string;
  status: "pending" | "running" | "complete" | "error";
  progress: number;
  message?: string;
  error?: string;
}

// ── Signals / forward tracking ──

export interface SignalPick {
  rank: number;
  ticker: string;
  product_id?: number;
  metric_value: number | null;
  close: number | null;
  high: number | null;
  prev_ath: number | null;
  volume: number | null;
  prev_volume: number | null;
  // 수동매매 사이징 제안 (표시 전용)
  suggested_shares?: number;
  suggested_notional?: number;
  tp_price?: number;
  sl_price?: number;
}

export interface Sizing {
  equity: number;
  slot_fraction: number;
  slot_notional: number;
  tp_pct: number;
  sl_pct: number;
  top_n: number;
}

export interface ForwardPosition {
  ticker: string;
  product_id?: number;
  entry_date: string | null;
  entry_price: number | null;
  shares: number;
  cost_basis: number;
  tp_price: number | null;
  sl_price: number | null;
  last_close: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pct: number;
}

export interface PendingPosition {
  signal_date: string | null;
  rank: number;
  ticker: string;
  product_id?: number;
  entry_timing: string;
}

export interface ClosedPosition {
  ticker: string;
  entry_date: string | null;
  exit_date: string | null;
  entry_price: number | null;
  exit_price: number | null;
  shares: number;
  pnl: number | null;
  pnl_pct: number | null;
  exit_reason: string;
  holding_days: number;
}

export interface SignalState {
  market: Market;
  latest_signal_date: string | null;
  latest_signals: SignalPick[];
  open_positions: ForwardPosition[];
  pending: PendingPosition[];
  closed_recent: ClosedPosition[];
}

export interface CapitalSummary {
  cash: number;
  positions_value: number;
  total_equity: number;
  n_open_positions: number;
  daily_return_pct: number;
  cum_return_pct: number;
  n_entries: number;
  n_exits: number;
}

export interface CycleResult {
  market: Market;
  as_of: string;
  execution_mode: string;
  capital: CapitalSummary;
  entries: { ticker: string; entry_price: number; shares: number; cost: number }[];
  exits: { ticker: string; reason: string; exit_price: number; pnl: number; pnl_pct: number }[];
  picks: SignalPick[];
  meta: { ranking_method: string; lookback_days: number; total_candidates: number };
}

export interface OrderTicket {
  ticker: string;
  side: "BUY" | "SELL";
  status: string;
  [k: string]: any;
}

export interface OrdersResult {
  market: Market;
  execution_mode: string;
  buys: OrderTicket[];
  sells: OrderTicket[];
}

// ── 라이브 ──

export interface LiveConfig {
  execution_mode: string;
  kiwoom_env: "mock" | "real";
  broker_configured: boolean;
  account_masked: string;
  max_orders_per_cycle: number;
  max_notional_per_order: number;
  auto_trade: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface BrokerHolding {
  ticker: string;
  qty: number;
  avg_price: number;
  eval: number;
}
export interface BrokerAccount {
  cash: number;
  total_eval: number;
  holdings: BrokerHolding[];
}

export interface Freshness {
  market_data_max: string | null;
  rt_max: string | null;
  stale: boolean;
}

export interface AutoOrderSummary {
  by_status: Record<string, number>;
  submitted: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface EntryToday {
  ticker: string;
  product_id?: number;
  signal_date: string | null;
  shares: number;
  entry_price: number | null;
  cost_basis: number | null;
  tp_price: number | null;
  sl_price: number | null;
  status: string;
}

export interface SignalHistoryEntry {
  signal_date: string | null;
  rank: number;
  ticker: string;
  metric_value: number | null;
  close_at_signal: number | null;
  status: string | null;   // null=미집행(신호만) / pending / open / closed / skipped
  entry_date: string | null;
  entry_price: number | null;
  exit_date: string | null;
  exit_price: number | null;
  exit_reason: string | null;
  pnl_pct: number | null;
}

export interface LiveDashboard {
  market: Market;
  as_of: string | null;
  latest_signal_date: string | null;
  picks: SignalPick[];
  entries: OrderTicket[];
  exits: OrderTicket[];
  open_positions: ForwardPosition[];
  pending: PendingPosition[];
  closed_recent: ClosedPosition[];
  capital: CapitalPoint | null;
  equity_series: EquityPoint[];
  sizing: Sizing;
  picks_are_today: boolean;
  entries_today: EntryToday[];
  signal_history: SignalHistoryEntry[];
  live: LiveConfig;
  freshness: Freshness;
  broker: BrokerAccount | null;
  auto_orders: AutoOrderSummary;
}

export interface CapitalPoint {
  time: string;
  equity: number;
  cash: number;
  positions_value: number;
  n_positions: number;
  daily_return_pct?: number | null;
  cum_return_pct?: number | null;
}

export interface OrderLogEntry {
  id: number;
  created_at: string | null;
  cycle_as_of: string | null;
  market: string;
  side: string;
  ticker: string;
  qty: number | null;
  price: number | null;
  broker_env: string;
  adapter: string;
  intent: string;
  broker_order_id: string | null;
  status: string;
  error: string | null;
}
