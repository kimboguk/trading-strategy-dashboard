"use client";

import { useEffect, useState } from "react";
import { useEnvStore } from "@/lib/store";
import { getOrderLog } from "@/lib/api";
import type { OrderLogEntry } from "@/lib/types";

export default function OrderLogPage() {
  const { setEnv } = useEnvStore();
  const [rows, setRows] = useState<OrderLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setEnv("live"); }, [setEnv]);
  useEffect(() => {
    getOrderLog().then(setRows).catch((e) => setError(e.message));
  }, []);

  const th = "px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap";
  const td = "px-2 py-1 text-xs font-mono whitespace-nowrap";
  const statusColor = (s: string) =>
    s === "filled" || s === "submitted" ? "var(--green)"
      : s === "rejected" || s === "failed" || s === "error" ? "var(--red)"
      : "var(--text-secondary)";

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Order Log</h2>
      {error && <p className="text-xs rounded p-2" style={{ background: "rgba(239,68,68,0.1)", color: "var(--red)" }}>{error}</p>}
      <div className="rounded-lg overflow-hidden" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        {rows.length === 0 ? (
          <p className="text-xs px-4 py-6" style={{ color: "var(--text-secondary)" }}>
            브로커 주문 이력 없음 — 자동매매(Phase 3) 또는 수동 집행 시 기록됩니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                <th className={th}>Time</th><th className={th}>As-of</th><th className={th}>Side</th><th className={th}>Ticker</th>
                <th className={th}>Qty</th><th className={th}>Price</th><th className={th}>Env</th><th className={th}>Intent</th><th className={th}>OrderID</th><th className={th}>Status</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={td}>{r.created_at?.slice(0, 19).replace("T", " ")}</td>
                    <td className={td}>{r.cycle_as_of}</td>
                    <td className={td} style={{ color: r.side === "BUY" ? "var(--green)" : "var(--red)" }}>{r.side}</td>
                    <td className={td}>{r.ticker}</td>
                    <td className={td}>{r.qty?.toLocaleString() ?? "-"}</td>
                    <td className={td}>{r.price?.toLocaleString() ?? "-"}</td>
                    <td className={td}>{r.broker_env}</td>
                    <td className={td}>{r.intent}</td>
                    <td className={td}>{r.broker_order_id ?? "-"}</td>
                    <td className={td} style={{ color: statusColor(r.status) }} title={r.error ?? undefined}>{r.status}{r.error ? " ⚠" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
