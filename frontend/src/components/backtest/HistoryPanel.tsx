"use client";

import { useState, useEffect } from "react";
import { fmtPF } from "@/lib/types";
import { formatLabel } from "@/lib/history";
import { getBacktestHistory, deleteSavedBacktest } from "@/lib/api";
import type { BacktestHistoryEntry } from "@/lib/api";

interface Props {
  onSelect: (entry: BacktestHistoryEntry) => void;
  refreshKey?: number;
}

export function HistoryPanel({ onSelect, refreshKey = 0 }: Props) {
  const [history, setHistory] = useState<BacktestHistoryEntry[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBacktestHistory()
      .then((data) => { if (!cancelled) setHistory(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSavedBacktest(id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } catch { /* ignore */ }
  };

  if (history.length === 0 && !loading) return null;

  return (
    <div className="rounded-lg mt-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <div className="flex justify-between items-center px-3 py-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          History ({history.length})
        </h3>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{expanded ? "▼" : "▶"}</span>
      </div>

      {expanded && (
        <div className="px-2 pb-2 space-y-1 max-h-[300px] overflow-y-auto">
          {loading && history.length === 0 && (
            <p className="text-xs px-2 py-1" style={{ color: "var(--text-secondary)" }}>Loading...</p>
          )}
          {history.map((entry) => {
            const ret = entry.stats?.total_return_pct ?? 0;
            return (
              <div key={entry.id} onClick={() => onSelect(entry)}
                className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:bg-white/5 group">
                <div className="min-w-0">
                  <p className="font-medium leading-tight break-words" style={{ fontSize: "10px" }}>
                    {entry.params ? formatLabel(entry.params) : entry.id}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span style={{ color: ret >= 0 ? "var(--green)" : "var(--red)" }}>
                      {ret >= 0 ? "+" : ""}{ret.toFixed(0)}%
                    </span>
                    {" "}PF:{fmtPF(entry.stats?.profit_factor ?? 0)}
                    {" "}{entry.stats?.trades ?? 0}t
                  </p>
                </div>
                <button onClick={(e) => handleDelete(entry.id, e)}
                  className="text-xs opacity-0 group-hover:opacity-60 hover:opacity-100 px-1"
                  style={{ color: "var(--text-secondary)" }}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
