"use client";

import { fmtPF, pfColor, type YearlyRow } from "@/lib/types";

interface Props {
  data: YearlyRow[];
  label?: string;
}

export function YearlyBreakdown({ data, label }: Props) {
  const downloadCsv = () => {
    const header = "Year,Trades,Win%,PF,RRR,NetPnL,EoYEquity,YrRet%,YrMDD%";
    const rows = data.map((r) =>
      [r.year, r.trades, r.win_rate.toFixed(1), fmtPF(r.profit_factor), fmtPF(r.rrr),
       r.net_pnl.toFixed(0), r.eoy_equity.toFixed(0), r.year_return_pct.toFixed(2), r.year_mdd_pct.toFixed(2)].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(label || "yearly").replace(/[^a-zA-Z0-9_\-|+. ]/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const thClass = "px-3 py-1.5 text-left text-xs font-medium whitespace-nowrap";
  const tdClass = "px-3 py-1 text-xs font-mono whitespace-nowrap";

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <div className="px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Yearly Breakdown
        </h3>
        {data.length > 0 && (
          <button type="button" onClick={downloadCsv}
            className="text-xs px-2 py-0.5 rounded border transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>CSV</button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              <th className={thClass}>Year</th>
              <th className={thClass}>Trades</th>
              <th className={thClass}>Win%</th>
              <th className={thClass}>PF</th>
              <th className={thClass}>Yr Ret%</th>
              <th className={thClass}>Yr MDD%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className={tdClass}>{r.year}</td>
                <td className={tdClass}>{r.trades}</td>
                <td className={tdClass}>{r.win_rate.toFixed(0)}%</td>
                <td className={tdClass} style={{ color: pfColor(r.profit_factor) }}>{fmtPF(r.profit_factor)}</td>
                <td className={tdClass} style={{ color: r.year_return_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                  {r.year_return_pct >= 0 ? "+" : ""}{r.year_return_pct.toFixed(1)}%
                </td>
                <td className={tdClass} style={{ color: "var(--red)" }}>{r.year_mdd_pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
