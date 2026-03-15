"use client";

import type { BacktestStats } from "@/lib/types";

interface Props {
  stats: BacktestStats;
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
  const pnlColor = stats.total_pnl_pips >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
        Performance
      </h3>
      <StatRow label="Trades" value={`${stats.total_trades} (L:${stats.long_trades} / S:${stats.short_trades})`} />
      <StatRow label="Win Rate" value={`${stats.win_rate}%`} />
      <StatRow label="Profit Factor" value={stats.profit_factor.toFixed(2)} color={stats.profit_factor >= 1.3 ? "var(--green)" : stats.profit_factor >= 1 ? "var(--text-primary)" : "var(--red)"} />
      <StatRow label="Net P&L" value={`${stats.total_pnl_pips >= 0 ? "+" : ""}${stats.total_pnl_pips.toFixed(1)} pips ($${stats.total_pnl_usd.toFixed(0)})`} color={pnlColor} />
      <StatRow label="Expectancy" value={`${stats.expectancy_pips.toFixed(1)} pips/trade`} />
      <StatRow label="Max Drawdown" value={`${stats.max_drawdown_pct.toFixed(1)}%`} color="var(--red)" />
      <StatRow label="Annual Return" value={`${stats.annual_return_pct >= 0 ? "+" : ""}${stats.annual_return_pct.toFixed(1)}%`} color={stats.annual_return_pct >= 0 ? "var(--green)" : "var(--red)"} />
      <StatRow label="Total Cost" value={`${stats.total_cost_pips.toFixed(1)} pips`} />
      <StatRow label="Avg Holding" value={stats.avg_holding.split(".")[0]} />
      <StatRow label="Capital" value={`$${stats.initial_capital.toLocaleString()} → $${stats.final_equity.toLocaleString()}`} color={pnlColor} />
    </div>
  );
}
