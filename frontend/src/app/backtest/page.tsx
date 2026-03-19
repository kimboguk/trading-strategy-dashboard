"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  fmtPF,
  pfColor,
  type BacktestRequest,
  type BacktestStats,
} from "@/lib/types";
import {
  runBacktest,
  pollUntilComplete,
  getBacktestStats,
  getBacktestTrades,
  getBacktestChart,
  getBacktestEquity,
  getBacktestYearly,
  getSavedBacktestResult,
} from "@/lib/api";
import type { BacktestHistoryEntry } from "@/lib/api";
import { formatLabel } from "@/lib/history";
import { useBacktestStore, type BacktestResult } from "@/lib/store";
import { ParameterForm } from "@/components/backtest/ParameterForm";
import { StatsTable } from "@/components/backtest/StatsTable";
import { TradesTable } from "@/components/backtest/TradesTable";
import { YearlyBreakdown } from "@/components/backtest/YearlyBreakdown";
import { HistoryPanel } from "@/components/backtest/HistoryPanel";

const CandlestickChart = dynamic(
  () => import("@/components/charts/CandlestickChart").then((m) => m.CandlestickChart),
  { ssr: false }
);
const EquityCurve = dynamic(
  () => import("@/components/charts/EquityCurve").then((m) => m.EquityCurve),
  { ssr: false }
);

export default function BacktestPage() {
  const {
    taskId, loading, progressMsg, error, params: currentParams, result,
    setRunning, setProgress, setComplete, setError, setResult, cancel,
  } = useBacktestStore();

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
          await pollUntilComplete(taskId, undefined, setProgress, 2000, ac.signal);
        }
        if (!result) {
          const [s, t, c, e, y] = await Promise.all([
            getBacktestStats(taskId),
            getBacktestTrades(taskId),
            getBacktestChart(taskId),
            getBacktestEquity(taskId),
            getBacktestYearly(taskId),
          ]);
          setComplete({ stats: s, trades: t, chartData: c, equityData: e, yearlyData: y }, taskId);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        if (err.message?.includes("404")) {
          // Stale task from previous session — clear and refresh history
          cancel();
          setHistoryKey((k) => k + 1);
          return;
        }
        setError(err.message || "Backtest failed");
      }
    })();

    return () => { ac.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRun = async (params: BacktestRequest) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const { task_id } = await runBacktest(params);
      setRunning(task_id, params);

      await pollUntilComplete(task_id, undefined, setProgress, 2000, ac.signal);

      const [s, t, c, e, y] = await Promise.all([
        getBacktestStats(task_id),
        getBacktestTrades(task_id),
        getBacktestChart(task_id),
        getBacktestEquity(task_id),
        getBacktestYearly(task_id),
      ]);

      const backtestResult: BacktestResult = {
        stats: s, trades: t, chartData: c, equityData: e, yearlyData: y,
      };
      setComplete(backtestResult, task_id);

      // DB save happens automatically on backend — just refresh history panel
      setHistoryKey((k) => k + 1);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "Backtest failed");
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    cancel();
  };

  const handleHistorySelect = async (entry: BacktestHistoryEntry) => {
    try {
      const res = await getSavedBacktestResult(entry.id);
      setResult(
        {
          stats: res.stats,
          trades: res.trades,
          chartData: res.grid,
          equityData: res.equity,
          yearlyData: res.yearly,
        },
        entry.params,
      );
    } catch {
      // Fallback: show lightweight data from history list
      setResult(
        {
          stats: entry.stats,
          trades: [],
          chartData: null,
          equityData: [],
          yearlyData: entry.yearly,
        },
        entry.params,
      );
    }
  };

  const stats = result?.stats ?? null;
  const trades = result?.trades ?? [];
  const chartData = result?.chartData ?? null;
  const equityData = result?.equityData ?? [];
  const yearlyData = result?.yearlyData ?? [];

  const periodLabel = currentParams?.start && currentParams?.end
    ? `${currentParams.start} ~ ${currentParams.end}`
    : stats ? `${stats.data_period_days} days` : "";

  return (
    <div className="flex gap-6 h-full">
      {/* Left panel */}
      <div className="w-[280px] shrink-0 self-start sticky top-0 space-y-0">
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          <ParameterForm onSubmit={handleRun} loading={loading} />
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
        <HistoryPanel onSelect={handleHistorySelect} refreshKey={historyKey} />
      </div>

      {/* Right area: Results */}
      <div className="flex-1 space-y-4 min-w-0">
        {!stats && !loading && (
          <div
            className="flex items-center justify-center h-64 rounded-lg"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <p style={{ color: "var(--text-secondary)" }}>
              Set parameters and click Run Backtest
            </p>
          </div>
        )}

        {stats && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold">
                {stats.symbol} {stats.timeframe}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                {stats.ma_type.toUpperCase()}
              </span>
              {currentParams?.filter_tfs?.map((tf) => (
                <span key={tf} className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.2)", color: "var(--accent)" }}>
                  +{tf}
                </span>
              ))}
              {periodLabel && (
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {periodLabel}
                </span>
              )}
              <span
                className="text-sm font-semibold ml-auto"
                style={{ color: (stats.total_pnl_pips ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {(stats.total_pnl_pips ?? 0) >= 0 ? "+" : ""}{(stats.total_pnl_pips ?? 0).toFixed(1)} pips
                {" "}(${(stats.total_pnl_usd ?? 0).toFixed(0)})
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
              <SummaryCard label="Expectancy" value={`${stats.expectancy_pips.toFixed(1)}p`} color={stats.expectancy_pips >= 0 ? "var(--green)" : "var(--red)"} />
              <SummaryCard label="Annual Return" value={`${stats.annual_return_pct >= 0 ? "+" : ""}${stats.annual_return_pct.toFixed(1)}%`} color={stats.annual_return_pct >= 0 ? "var(--green)" : "var(--red)"} />
              <SummaryCard label="Sharpe Ratio" value={`${(stats.sharpe_ratio ?? 0).toFixed(2)}`} color={(stats.sharpe_ratio ?? 0) >= 1 ? "var(--green)" : undefined} />
              <SummaryCard label="Volatility" value={`${(stats.annual_volatility_pct ?? 0).toFixed(1)}%`} />
            </div>

            {/* Candlestick Chart */}
            {chartData && chartData.candles.length > 0 && (
              <CandlestickChart data={chartData} height={450} />
            )}

            {/* Equity Curve */}
            {equityData.length > 0 && (
              <EquityCurve data={equityData} height={180} label={currentParams ? `equity_daily_${formatLabel(currentParams)}` : undefined} />
            )}

            {/* Stats + Yearly side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StatsTable stats={stats} />
              <YearlyBreakdown data={yearlyData} label={currentParams ? formatLabel(currentParams) : undefined} />
            </div>

            {/* Trades */}
            {trades.length > 0 && (
              <TradesTable trades={trades} />
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
