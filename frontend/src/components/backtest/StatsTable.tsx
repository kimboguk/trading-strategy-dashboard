"use client";

import { fmtPF, pfColor, type BacktestStats } from "@/lib/types";

interface Props {
  stats: BacktestStats;
}

function money(v: number, market: string): string {
  if (market === "KRW") return `₩${Math.round(v).toLocaleString()}`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between py-1 border-b" style={{ borderColor: "var(--border)" }}>
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="text-sm font-mono font-medium" style={{ color: color || "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

export function StatsTable({ stats }: Props) {
  const m = stats.market;
  const pnlColor = stats.total_pnl >= 0 ? "var(--green)" : "var(--red)";
  const exitStr = Object.entries(stats.exit_reasons || {})
    .map(([k, v]) => `${k}:${v}`)
    .join("  ");

  return (
    <div className="rounded-lg p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
        Performance
      </h3>
      <StatRow label="Trades" value={`${stats.trades}`} />
      <StatRow label="Win Rate" value={`${stats.win_rate_pct.toFixed(1)}%`} />
      <StatRow label="Profit Factor" value={fmtPF(stats.profit_factor)} color={pfColor(stats.profit_factor)} />
      <StatRow label="RRR" value={fmtPF(stats.rrr)} />
      <StatRow label="Net P&L" value={`${stats.total_pnl >= 0 ? "+" : ""}${money(stats.total_pnl, m)}`} color={pnlColor} />
      <StatRow label="Total Return" value={`${stats.total_return_pct >= 0 ? "+" : ""}${stats.total_return_pct.toFixed(1)}%`} color={pnlColor} />
      <StatRow label="Annual Return" value={`${stats.ann_return_pct >= 0 ? "+" : ""}${stats.ann_return_pct.toFixed(1)}%`} color={stats.ann_return_pct >= 0 ? "var(--green)" : "var(--red)"} />
      <StatRow label="Max Drawdown" value={`${stats.mdd_pct.toFixed(1)}%`} color="var(--red)" />
      <StatRow label="Sharpe" value={stats.sharpe_ratio.toFixed(2)} color={stats.sharpe_ratio >= 1 ? "var(--green)" : undefined} />
      <StatRow label="Sortino" value={stats.sortino_ratio.toFixed(2)} />
      <StatRow label="Calmar" value={stats.calmar_ratio.toFixed(2)} color={stats.calmar_ratio >= 2 ? "var(--green)" : undefined} />
      <StatRow label="Volatility" value={`${stats.ann_volatility_pct.toFixed(1)}%`} />
      <StatRow label="Avg Holding" value={`${stats.avg_holding_days.toFixed(0)}d`} />
      <StatRow label="Capital" value={`${money(stats.initial_capital, m)} → ${money(stats.final_equity, m)}`} color={pnlColor} />
      {exitStr && <StatRow label="Exits" value={exitStr} />}
    </div>
  );
}
