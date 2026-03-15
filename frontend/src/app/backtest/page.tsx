"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import type {
  BacktestRequest,
  BacktestStats,
  TradeRecord,
  YearlyRow,
  ChartData,
  EquityPoint,
} from "@/lib/types";
import {
  runBacktest,
  pollUntilComplete,
  getBacktestStats,
  getBacktestTrades,
  getBacktestChart,
  getBacktestEquity,
  getBacktestYearly,
} from "@/lib/api";
import { saveToHistory, generateId, formatLabel, type SavedBacktest } from "@/lib/history";
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
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const [stats, setStats] = useState<BacktestStats | null>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [equityData, setEquityData] = useState<EquityPoint[]>([]);
  const [yearlyData, setYearlyData] = useState<YearlyRow[]>([]);
  const [currentParams, setCurrentParams] = useState<BacktestRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleRun = async (params: BacktestRequest) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    setProgress(0);
    setProgressMsg("");
    setCurrentParams(params);

    try {
      const { task_id } = await runBacktest(params);
      await pollUntilComplete(task_id, setProgress, setProgressMsg, 2000, ac.signal);

      const [s, t, c, e, y] = await Promise.all([
        getBacktestStats(task_id),
        getBacktestTrades(task_id),
        getBacktestChart(task_id),
        getBacktestEquity(task_id),
        getBacktestYearly(task_id),
      ]);

      setStats(s);
      setTrades(t);
      setChartData(c);
      setEquityData(e);
      setYearlyData(y);

      // Save to history (including chart data for instant restore)
      saveToHistory({
        id: generateId(),
        timestamp: new Date().toISOString(),
        params,
        stats: s,
        yearly: y,
        taskId: task_id,
        chartData: c,
        equityData: e,
        trades: t,
      });
      setHistoryKey((k) => k + 1);
    } catch (err: any) {
      if (err.name === "AbortError") return; // cancelled — silently stop
      setError(err.message || "Backtest failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const handleHistorySelect = (entry: SavedBacktest) => {
    setStats(entry.stats);
    setYearlyData(entry.yearly);
    setCurrentParams(entry.params);
    setChartData(entry.chartData ?? null);
    setEquityData(entry.equityData ?? []);
    setTrades(entry.trades ?? []);
  };

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
                style={{ color: stats.total_pnl_pips >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {stats.total_pnl_pips >= 0 ? "+" : ""}{stats.total_pnl_pips.toFixed(1)} pips
                {" "}(${stats.total_pnl_usd.toFixed(0)})
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
              <SummaryCard label="Profit Factor" value={stats.profit_factor.toFixed(2)} color={stats.profit_factor >= 1.3 ? "var(--green)" : stats.profit_factor >= 1 ? "var(--text-primary)" : "var(--red)"} />
              <SummaryCard label="Max Drawdown" value={`${stats.max_drawdown_pct.toFixed(1)}%`} color="var(--red)" />
              <SummaryCard label="Expectancy" value={`${stats.expectancy_pips.toFixed(1)}p`} color={stats.expectancy_pips >= 0 ? "var(--green)" : "var(--red)"} />
              <SummaryCard label="Annual Return" value={`${stats.annual_return_pct >= 0 ? "+" : ""}${stats.annual_return_pct.toFixed(1)}%`} color={stats.annual_return_pct >= 0 ? "var(--green)" : "var(--red)"} />
            </div>

            {/* Candlestick Chart */}
            {chartData && chartData.candles.length > 0 && (
              <CandlestickChart data={chartData} height={450} />
            )}

            {/* Equity Curve */}
            {equityData.length > 0 && (
              <EquityCurve data={equityData} height={180} />
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
