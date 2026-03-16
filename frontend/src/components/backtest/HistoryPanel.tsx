"use client";

import { useState, useEffect } from "react";
import { fmtPF, type BacktestRequest } from "@/lib/types";
import { getBacktestHistory, deleteSavedBacktest } from "@/lib/api";
import type { BacktestHistoryEntry } from "@/lib/api";

const STRATEGY_TAG: Record<string, string> = {
  trend_ribbon: "TR",
  golden_cross: "XMA",
};

function formatLabel(params: BacktestRequest): string {
  const tag = STRATEGY_TAG[params.strategy] || params.strategy;
  const parts = [tag, params.symbol, params.timeframe, params.ma_type.toUpperCase()];
  if (params.filter_tfs?.length) parts.push(`+${params.filter_tfs.join("+")}`);
  if (params.strategy === "trend_ribbon" || !params.strategy) {
    if (params.ribbon_periods && params.ribbon_periods.length < 4) {
      parts.push(`R${[...params.ribbon_periods].sort((a, b) => a - b).join("|")}`);
    }
    if (params.alignment_mas && params.alignment_mas.length >= 2) {
      parts.push(params.alignment_mas.sort((a, b) => a - b).join("|"));
    }
  }
  if (params.strategy === "golden_cross") {
    parts.push(`${params.fast_period || 60}/${params.slow_period || 240}`);
  }
  if (params.tp_pips) parts.push(`TP${params.tp_pips}`);
  if (params.sl_pips) parts.push(`SL${params.sl_pips}`);
  return parts.join(" ");
}

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
    <div
      className="rounded-lg mt-4"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex justify-between items-center px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          History ({history.length})
        </h3>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {expanded ? "▼" : "▶"}
        </span>
      </div>

      {expanded && (
        <div className="px-2 pb-2 space-y-1 max-h-[300px] overflow-y-auto">
          {loading && history.length === 0 && (
            <p className="text-xs px-2 py-1" style={{ color: "var(--text-secondary)" }}>Loading...</p>
          )}
          {history.map((entry) => (
            <div
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:bg-white/5 group"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  {formatLabel(entry.params)}
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: (entry.stats?.total_pnl_pips ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                    {(entry.stats?.total_pnl_pips ?? 0) >= 0 ? "+" : ""}{(entry.stats?.total_pnl_pips ?? 0).toFixed(0)}p
                  </span>
                  {" "}PF:{fmtPF(entry.stats?.profit_factor ?? 0)}
                  {" "}{entry.stats?.total_trades ?? 0}t
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(entry.id, e)}
                className="text-xs opacity-0 group-hover:opacity-60 hover:opacity-100 px-1"
                style={{ color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
