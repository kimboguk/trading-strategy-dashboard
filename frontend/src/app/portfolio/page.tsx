"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  fmtPF,
  pfColor,
  type PortfolioRequest,
  type BacktestStats,
} from "@/lib/types";
import {
  runPortfolio,
  pollPortfolioUntilComplete,
  getPortfolioResult,
  getSavedPortfolioResult,
} from "@/lib/api";
import type { PortfolioHistoryEntry } from "@/lib/api";
import { usePortfolioStore } from "@/lib/store";
import { PortfolioForm } from "@/components/portfolio/PortfolioForm";
import { PortfolioHistoryPanel } from "@/components/portfolio/PortfolioHistoryPanel";
import { YearlyBreakdown } from "@/components/backtest/YearlyBreakdown";
import { SymbolYearly } from "@/components/portfolio/SymbolYearly";
import { PortfolioTradesTable } from "@/components/portfolio/PortfolioTradesTable";
import { CorrelationHeatmap } from "@/components/portfolio/CorrelationHeatmap";

const EquityCurve = dynamic(
  () => import("@/components/charts/EquityCurve").then((m) => m.EquityCurve),
  { ssr: false }
);

export default function PortfolioPage() {
  const {
    taskId, loading, progressMsg, error, params: currentParams, result,
    setRunning, setProgress, setComplete, setError, setResult, viewHistory, cancel,
  } = usePortfolioStore();

  const abortRef = useRef<AbortController | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  // Resume polling or re-fetch result when navigating back
  useEffect(() => {
    if (!taskId) return;

    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        if (loading) {
          // Still running — resume polling
          await pollPortfolioUntilComplete(taskId, undefined, setProgress, 2000, ac.signal);
        }
        // Fetch (or re-fetch) result if not already in memory
        if (!result) {
          const res = await getPortfolioResult(taskId);
          setComplete(res, taskId);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        if (err.message?.includes("404")) {
          // Stale task from previous session — clear and refresh history
          cancel();
          setHistoryKey((k) => k + 1);
          return;
        }
        setError(err.message || "Portfolio backtest failed");
      }
    })();

    return () => { ac.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRun = async (params: PortfolioRequest) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const { task_id } = await runPortfolio(params);
      setRunning(task_id, params);

      await pollPortfolioUntilComplete(task_id, undefined, setProgress, 2000, ac.signal);
      const res = await getPortfolioResult(task_id);
      setComplete(res, task_id);

      // DB save happens automatically on backend — just refresh history panel
      setHistoryKey((k) => k + 1);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "Portfolio backtest failed");
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    cancel();
  };

  const handleHistorySelect = async (entry: PortfolioHistoryEntry) => {
    try {
      const res = await getSavedPortfolioResult(entry.id);
      viewHistory(res, entry.params);
    } catch {
      // Fallback: show lightweight data from history list
      viewHistory(
        {
          stats: entry.stats,
          trades: [],
          equity: [],
          yearly: entry.yearly,
          per_symbol: {},
        },
        entry.params,
      );
    }
  };

  const stats = result?.stats;
  const symbols = currentParams?.symbols || [];

  return (
    <div className="flex gap-6 h-full">
      {/* Left panel */}
      <div className="w-[280px] shrink-0 self-start sticky top-0 space-y-0">
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          <PortfolioForm onSubmit={handleRun} loading={loading} />
          {loading && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300 animate-pulse"
                  style={{ width: "100%", background: "var(--accent)", opacity: 0.6 }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {progressMsg || "Starting..."}
                </p>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-xs px-2 py-0.5 rounded border transition-colors hover:bg-red-500/20"
                  style={{ borderColor: "var(--border)", color: "var(--red)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="mt-3 text-xs rounded p-2" style={{ background: "rgba(239,68,68,0.1)", color: "var(--red)" }}>
              {error}
            </p>
          )}
        </div>
        <PortfolioHistoryPanel onSelect={handleHistorySelect} refreshKey={historyKey} />
      </div>

      {/* Right area: Results */}
      <div className="flex-1 space-y-4 min-w-0">
        {!stats && !loading && (
          <div
            className="flex items-center justify-center h-64 rounded-lg"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <p style={{ color: "var(--text-secondary)" }}>
              Select symbols, set parameters, and click Run Portfolio
            </p>
          </div>
        )}

        {stats && result && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold">
                Portfolio ({symbols.length} symbols)
              </h2>
              {currentParams && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                  {currentParams.timeframe} {currentParams.ma_type.toUpperCase()}
                </span>
              )}
              {symbols.map((s) => (
                <span key={s} className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.2)", color: "var(--accent)" }}>
                  {s}
                </span>
              ))}
              <span
                className="text-sm font-semibold ml-auto"
                style={{ color: stats.total_pnl_usd >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {stats.total_pnl_usd >= 0 ? "+" : ""}${stats.total_pnl_usd.toFixed(0)}
              </span>
              {(stats.started_at || stats.elapsed_sec != null) && (
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {stats.started_at}
                  {stats.elapsed_sec != null && ` (${stats.elapsed_sec}s)`}
                </span>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <SummaryCard label="Trades" value={`${stats.total_trades}`} sub={`L:${stats.long_trades} S:${stats.short_trades}`} />
              <SummaryCard label="Win Rate" value={`${stats.win_rate}%`} color={stats.win_rate >= 50 ? "var(--green)" : undefined} />
              <SummaryCard label="Profit Factor" value={fmtPF(stats.profit_factor)} color={pfColor(stats.profit_factor)} />
              <SummaryCard label="Max Drawdown" value={`${stats.max_drawdown_pct.toFixed(1)}%`} color="var(--red)" />
              <SummaryCard label="Expectancy" value={`$${stats.expectancy_pips.toFixed(1)}`} color={stats.expectancy_pips >= 0 ? "var(--green)" : "var(--red)"} />
              <SummaryCard label="Annual Return" value={`${stats.annual_return_pct >= 0 ? "+" : ""}${stats.annual_return_pct.toFixed(1)}%`} color={stats.annual_return_pct >= 0 ? "var(--green)" : "var(--red)"} />
            </div>

            {/* Equity Curve */}
            {result.equity.length > 0 && (
              <EquityCurve data={result.equity} height={250} />
            )}

            {/* Correlation Heatmap */}
            {result.correlation && result.correlation.symbols.length >= 2 && (
              <CorrelationHeatmap data={result.correlation} />
            )}

            {/* Stats + Combined Yearly side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PortfolioStatsTable stats={stats} />
              <YearlyBreakdown data={result.yearly} label="Portfolio" />
            </div>

            {/* Per-symbol yearly */}
            {Object.keys(result.per_symbol).length > 1 && (
              <SymbolYearly perSymbol={result.per_symbol} symbols={symbols} />
            )}

            {/* Trades */}
            {result.trades.length > 0 && (
              <PortfolioTradesTable trades={result.trades} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <p className="text-sm font-bold font-mono" style={{ color: color || "var(--text-primary)" }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{sub}</p>}
    </div>
  );
}

function PortfolioStatsTable({ stats }: { stats: BacktestStats }) {
  const pnlColor = stats.total_pnl_usd >= 0 ? "var(--green)" : "var(--red)";

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
      <StatRow label="Profit Factor" value={fmtPF(stats.profit_factor)} color={pfColor(stats.profit_factor)} />
      <StatRow label="Net P&L" value={`$${stats.total_pnl_usd.toLocaleString()}`} color={pnlColor} />
      <StatRow label="Expectancy" value={`$${stats.expectancy_pips.toFixed(1)}/trade`} />
      <StatRow label="Max Drawdown" value={`${stats.max_drawdown_pct.toFixed(1)}%`} color="var(--red)" />
      <StatRow label="Annual Return" value={`${stats.annual_return_pct >= 0 ? "+" : ""}${stats.annual_return_pct.toFixed(1)}%`} color={stats.annual_return_pct >= 0 ? "var(--green)" : "var(--red)"} />
      <StatRow label="Avg Holding" value={stats.avg_holding.split(".")[0]} />
      <StatRow label="Capital" value={`$${stats.initial_capital.toLocaleString()} → $${Math.round(stats.final_equity).toLocaleString()}`} color={pnlColor} />
    </div>
  );
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
