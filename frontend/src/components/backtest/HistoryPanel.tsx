"use client";

import { useState, useEffect } from "react";
import type { SavedBacktest } from "@/lib/history";
import { loadHistory, deleteFromHistory, clearHistory, formatLabel } from "@/lib/history";

interface Props {
  onSelect: (entry: SavedBacktest) => void;
  refreshKey: number;  // increment to reload
}

export function HistoryPanel({ onSelect, refreshKey }: Props) {
  const [history, setHistory] = useState<SavedBacktest[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setHistory(loadHistory());
  }, [refreshKey]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteFromHistory(id);
    setHistory(loadHistory());
  };

  const handleClear = () => {
    clearHistory();
    setHistory([]);
  };

  if (history.length === 0) return null;

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
                  <span style={{ color: entry.stats.total_pnl_pips >= 0 ? "var(--green)" : "var(--red)" }}>
                    {entry.stats.total_pnl_pips >= 0 ? "+" : ""}{entry.stats.total_pnl_pips.toFixed(0)}p
                  </span>
                  {" "}PF:{entry.stats.profit_factor.toFixed(2)}
                  {" "}{entry.stats.total_trades}t
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
          <button
            onClick={handleClear}
            className="w-full text-xs py-1 rounded mt-1"
            style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}
