"use client";

import { useEffect, useState, useCallback } from "react";
import { useMarketStore } from "@/lib/store";
import { getSignalState } from "@/lib/api";
import type { SignalState } from "@/lib/types";

export default function PositionsPage() {
  const { market } = useMarketStore();
  const [state, setState] = useState<SignalState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setState(await getSignalState(market)); }
    catch (err: any) { setError(err.message); }
  }, [market]);

  useEffect(() => { refresh(); }, [refresh]);

  const open = state?.open_positions ?? [];
  const pending = state?.pending ?? [];
  const closed = state?.closed_recent ?? [];
  const th = "px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap";
  const td = "px-2 py-1 text-xs font-mono whitespace-nowrap";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold">Positions · {market}</h2>
        <button onClick={refresh} className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>Refresh</button>
      </div>

      {error && <p className="text-xs rounded p-2" style={{ background: "rgba(239,68,68,0.1)", color: "var(--red)" }}>{error}</p>}

      <Section title={`Open (${open.length})`}>
        {open.length === 0 ? <Empty /> : (
          <table className="w-full">
            <thead><tr style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              <th className={th}>Ticker</th><th className={th}>Entry</th><th className={th}>Entry $</th>
              <th className={th}>Shares</th><th className={th}>Last</th><th className={th}>TP</th><th className={th}>SL</th>
              <th className={th}>Unrealized</th><th className={th}>%</th>
            </tr></thead>
            <tbody>
              {open.map((p, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className={td}>{p.ticker}</td>
                  <td className={td}>{p.entry_date}</td>
                  <td className={td}>{p.entry_price?.toLocaleString() ?? "-"}</td>
                  <td className={td}>{p.shares.toLocaleString()}</td>
                  <td className={td}>{p.last_close.toLocaleString()}</td>
                  <td className={td}>{p.tp_price?.toLocaleString() ?? "-"}</td>
                  <td className={td}>{p.sl_price?.toLocaleString() ?? "-"}</td>
                  <td className={td} style={{ color: p.unrealized_pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                    {p.unrealized_pnl >= 0 ? "+" : ""}{Math.round(p.unrealized_pnl).toLocaleString()}
                  </td>
                  <td className={td} style={{ color: p.unrealized_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                    {p.unrealized_pct >= 0 ? "+" : ""}{p.unrealized_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Pending (${pending.length})`}>
        {pending.length === 0 ? <Empty /> : (
          <table className="w-full">
            <thead><tr style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              <th className={th}>Signal date</th><th className={th}>Rank</th><th className={th}>Ticker</th><th className={th}>Entry timing</th>
            </tr></thead>
            <tbody>
              {pending.map((p, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className={td}>{p.signal_date}</td><td className={td}>{p.rank}</td>
                  <td className={td}>{p.ticker}</td><td className={td}>{p.entry_timing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Closed (recent ${closed.length})`}>
        {closed.length === 0 ? <Empty /> : (
          <table className="w-full">
            <thead><tr style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              <th className={th}>Ticker</th><th className={th}>Entry</th><th className={th}>Exit</th>
              <th className={th}>P&L</th><th className={th}>%</th><th className={th}>Days</th><th className={th}>Reason</th>
            </tr></thead>
            <tbody>
              {closed.map((p, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className={td}>{p.ticker}</td><td className={td}>{p.entry_date}</td><td className={td}>{p.exit_date}</td>
                  <td className={td} style={{ color: (p.pnl ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                    {(p.pnl ?? 0) >= 0 ? "+" : ""}{Math.round(p.pnl ?? 0).toLocaleString()}
                  </td>
                  <td className={td} style={{ color: (p.pnl_pct ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                    {(p.pnl_pct ?? 0) >= 0 ? "+" : ""}{(p.pnl_pct ?? 0).toFixed(1)}%
                  </td>
                  <td className={td}>{p.holding_days}</td>
                  <td className={td} style={{ color: "var(--text-secondary)" }}>{p.exit_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <h3 className="text-sm font-semibold uppercase tracking-wider px-4 py-3" style={{ color: "var(--text-secondary)" }}>{title}</h3>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Empty() {
  return <p className="text-xs px-4 pb-3" style={{ color: "var(--text-secondary)" }}>없음</p>;
}
