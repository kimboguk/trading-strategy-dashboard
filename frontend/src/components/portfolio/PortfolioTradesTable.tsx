"use client";

import { useState } from "react";
import type { PortfolioTradeRecord } from "@/lib/types";

interface Props {
  trades: PortfolioTradeRecord[];
}

type SortKey = keyof PortfolioTradeRecord;

export function PortfolioTradesTable({ trades }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("exit_time");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 20;

  const sorted = [...trades].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    if (typeof va === "number" && typeof vb === "number") {
      return sortAsc ? va - vb : vb - va;
    }
    return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });

  const totalPages = Math.ceil(sorted.length / perPage);
  const pageData = sorted.slice(page * perPage, (page + 1) * perPage);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const thClass = "px-2 py-1.5 text-left text-xs font-medium cursor-pointer hover:text-white whitespace-nowrap";
  const tdClass = "px-2 py-1 text-xs font-mono whitespace-nowrap";

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <div className="px-4 py-3 flex justify-between items-center">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Trades ({trades.length})
        </h3>
        {totalPages > 1 && (
          <div className="flex gap-2 text-xs">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="px-2 py-0.5 rounded disabled:opacity-30" style={{ background: "var(--bg-tertiary)" }}>Prev</button>
            <span style={{ color: "var(--text-secondary)" }}>{page + 1}/{totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="px-2 py-0.5 rounded disabled:opacity-30" style={{ background: "var(--bg-tertiary)" }}>Next</button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              <th className={thClass} onClick={() => toggleSort("exit_time")}>#</th>
              <th className={thClass} onClick={() => toggleSort("symbol")}>Symbol</th>
              <th className={thClass} onClick={() => toggleSort("entry_time")}>Entry</th>
              <th className={thClass} onClick={() => toggleSort("exit_time")}>Exit</th>
              <th className={thClass} onClick={() => toggleSort("direction")}>Dir</th>
              <th className={thClass} onClick={() => toggleSort("entry_price")}>Entry$</th>
              <th className={thClass} onClick={() => toggleSort("exit_price")}>Exit$</th>
              <th className={thClass} onClick={() => toggleSort("net_pnl_pips")}>Net Pips</th>
              <th className={thClass} onClick={() => toggleSort("pnl_usd")}>P&L $</th>
              <th className={thClass} onClick={() => toggleSort("exit_reason")}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((t, i) => (
              <tr
                key={i}
                className="border-t hover:bg-white/3"
                style={{ borderColor: "var(--border)" }}
              >
                <td className={tdClass} style={{ color: "var(--text-secondary)" }}>{page * perPage + i + 1}</td>
                <td className={tdClass} style={{ color: "var(--accent)" }}>{t.symbol}</td>
                <td className={tdClass}>{t.entry_time.slice(0, 16)}</td>
                <td className={tdClass}>{t.exit_time.slice(0, 16)}</td>
                <td className={tdClass} style={{ color: t.direction === "long" ? "var(--green)" : "var(--red)" }}>
                  {t.direction === "long" ? "L" : "S"}
                </td>
                <td className={tdClass}>{t.entry_price.toFixed(5)}</td>
                <td className={tdClass}>{t.exit_price.toFixed(5)}</td>
                <td className={tdClass} style={{ color: t.net_pnl_pips >= 0 ? "var(--green)" : "var(--red)" }}>
                  {t.net_pnl_pips >= 0 ? "+" : ""}{t.net_pnl_pips.toFixed(1)}
                </td>
                <td className={tdClass} style={{ color: t.pnl_usd >= 0 ? "var(--green)" : "var(--red)" }}>
                  {t.pnl_usd >= 0 ? "+" : ""}{t.pnl_usd.toFixed(2)}
                </td>
                <td className={tdClass} style={{ color: "var(--text-secondary)" }}>{t.exit_reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
