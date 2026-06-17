"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useMarketStore } from "@/lib/store";
import { runSignalCycle, getSignalState, getSignalOrders, getForwardEquity } from "@/lib/api";
import type { CycleResult, SignalState, OrdersResult, EquityPoint } from "@/lib/types";

const EquityCurve = dynamic(
  () => import("@/components/charts/EquityCurve").then((m) => m.EquityCurve),
  { ssr: false }
);

export default function SignalsPage() {
  const { market } = useMarketStore();
  const [asOf, setAsOf] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cycle, setCycle] = useState<CycleResult | null>(null);
  const [state, setState] = useState<SignalState | null>(null);
  const [orders, setOrders] = useState<OrdersResult | null>(null);
  const [equity, setEquity] = useState<EquityPoint[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([getSignalState(market), getForwardEquity(market)]);
      setState(s); setEquity(e);
      const o = await getSignalOrders(market, s.latest_signal_date ?? undefined);
      setOrders(o);
    } catch (err: any) { setError(err.message); }
  }, [market]);

  useEffect(() => { refresh(); }, [refresh]);

  const runCycle = async () => {
    setRunning(true); setError(null);
    try {
      const r = await runSignalCycle(market, asOf || undefined);
      setCycle(r);
      await refresh();
    } catch (err: any) {
      setError(err.message || "cycle failed");
    } finally { setRunning(false); }
  };

  const cap = cycle?.capital;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-bold">Daily Signals · {market}</h2>
        <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
          className="text-sm px-2 py-1 rounded bg-transparent border outline-none"
          style={{ borderColor: "var(--border)" }} placeholder="as-of" />
        <button onClick={runCycle} disabled={running}
          className="text-sm font-semibold px-4 py-1.5 rounded disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}>
          {running ? "Running..." : "Run Daily Cycle"}
        </button>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          (미지정 시 최신 거래일 기준 · 수동 집행용 신호 산출)
        </span>
      </div>

      {error && <p className="text-xs rounded p-2" style={{ background: "rgba(239,68,68,0.1)", color: "var(--red)" }}>{error}</p>}

      {cap && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card label="As of" value={cycle!.as_of} />
          <Card label="Equity" value={Math.round(cap.total_equity).toLocaleString()} />
          <Card label="Cash" value={Math.round(cap.cash).toLocaleString()} />
          <Card label="Open" value={`${cap.n_open_positions}`} />
          <Card label="Daily" value={`${cap.daily_return_pct >= 0 ? "+" : ""}${cap.daily_return_pct.toFixed(2)}%`} color={cap.daily_return_pct >= 0 ? "var(--green)" : "var(--red)"} />
          <Card label="Cumulative" value={`${cap.cum_return_pct >= 0 ? "+" : ""}${cap.cum_return_pct.toFixed(2)}%`} color={cap.cum_return_pct >= 0 ? "var(--green)" : "var(--red)"} />
          <Card label="Today" value={`+${cap.n_entries} / -${cap.n_exits}`} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Orders to execute */}
        <Panel title={`Orders to Execute (${orders?.execution_mode ?? "manual"})`}>
          <div className="space-y-2">
            <OrderList title="BUY (pending)" color="var(--green)" rows={(orders?.buys ?? []).map(b => `${b.ticker}  ${b.entry_timing ?? ""}`)} />
            <OrderList title="SELL (exits)" color="var(--red)" rows={(orders?.sells ?? []).map(s => `${s.ticker}  ${s.reason ?? ""}  ${s.pnl_pct != null ? (s.pnl_pct >= 0 ? "+" : "") + s.pnl_pct.toFixed(1) + "%" : ""}`)} />
          </div>
        </Panel>

        {/* Today's picks */}
        <Panel title={`Top Picks ${state?.latest_signal_date ? "· " + state.latest_signal_date : ""}`}>
          {(state?.latest_signals ?? []).length === 0 ? (
            <Empty text="신호 없음" />
          ) : (
            <table className="w-full text-xs font-mono">
              <thead><tr style={{ color: "var(--text-secondary)" }}>
                <th className="text-left py-1">#</th><th className="text-left">Ticker</th>
                <th className="text-right">Metric</th><th className="text-right">Close</th><th className="text-right">Vol×</th>
              </tr></thead>
              <tbody>
                {state!.latest_signals.map((p) => (
                  <tr key={p.ticker} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1">{p.rank}</td><td>{p.ticker}</td>
                    <td className="text-right">{p.metric_value?.toFixed(3) ?? "-"}</td>
                    <td className="text-right">{p.close?.toLocaleString() ?? "-"}</td>
                    <td className="text-right">{p.volume && p.prev_volume ? (p.volume / p.prev_volume).toFixed(1) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {equity.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-secondary)" }}>Forward Equity</h3>
          <EquityCurve data={equity} height={200} />
        </div>
      )}
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <p className="text-sm font-bold font-mono" style={{ color: color || "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>{title}</h3>
      {children}
    </div>
  );
}

function OrderList({ title, color, rows }: { title: string; color: string; rows: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1" style={{ color }}>{title} ({rows.length})</p>
      {rows.length === 0 ? <p className="text-xs" style={{ color: "var(--text-secondary)" }}>없음</p> : (
        <ul className="text-xs font-mono space-y-0.5">{rows.map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{text}</p>;
}
