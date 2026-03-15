"use client";

import type { YearlyRow } from "@/lib/types";

interface Props {
  data: YearlyRow[];
}

export function YearlyBreakdown({ data }: Props) {
  const thClass = "px-3 py-1.5 text-left text-xs font-medium whitespace-nowrap";
  const tdClass = "px-3 py-1 text-xs font-mono whitespace-nowrap";

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Yearly Breakdown
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              <th className={thClass}>Year</th>
              <th className={thClass}>Trades</th>
              <th className={thClass}>Win%</th>
              <th className={thClass}>PF</th>
              <th className={thClass}>Net Pips</th>
              <th className={thClass}>Net USD</th>
              <th className={thClass}>Avg Pips</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className={tdClass}>{r.year}</td>
                <td className={tdClass}>{r.trades}</td>
                <td className={tdClass}>{r.win_rate}%</td>
                <td className={tdClass} style={{ color: r.profit_factor >= 1 ? "var(--green)" : "var(--red)" }}>
                  {r.profit_factor.toFixed(2)}
                </td>
                <td className={tdClass} style={{ color: r.net_pnl_pips >= 0 ? "var(--green)" : "var(--red)" }}>
                  {r.net_pnl_pips >= 0 ? "+" : ""}{r.net_pnl_pips.toFixed(1)}
                </td>
                <td className={tdClass} style={{ color: r.net_pnl_usd >= 0 ? "var(--green)" : "var(--red)" }}>
                  ${r.net_pnl_usd.toFixed(0)}
                </td>
                <td className={tdClass}>{r.avg_pnl_pips.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
