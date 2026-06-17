"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { fmtPF, pfColor, type BacktestRequest } from "@/lib/types";
import {
  runBacktest,
  pollUntilComplete,
  getBacktestStats,
  getBacktestTrades,
  getBacktestEquity,
  getBacktestYearly,
  getBacktestPositions,
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

  useEffect(() => {
    if (!taskId) return;
    const ac = new AbortController();
    abortRef.current = ac;
    (async () => {
      try {
        if (loading) await pollUntilComplete(taskId, undefined, setProgress, 2000, ac.signal);
        if (!result) {
          const [s, t, e, y, p] = await Promise.all([
            getBacktestStats(taskId), getBacktestTrades(taskId),
            getBacktestEquity(taskId), getBacktestYearly(taskId), getBacktestPositions(taskId),
          ]);
          setComplete({ stats: s, trades: t, equityData: e, yearlyData: y, positions: p }, taskId);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        if (err.message?.includes("404")) { cancel(); setHistoryKey((k) => k + 1); return; }
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
      const [s, t, e, y, p] = await Promise.all([
        getBacktestStats(task_id), getBacktestTrades(task_id),
        getBacktestEquity(task_id), getBacktestYearly(task_id), getBacktestPositions(task_id),
      ]);
      setComplete({ stats: s, trades: t, equityData: e, yearlyData: y, positions: p }, task_id);
      setHistoryKey((k) => k + 1);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "Backtest failed");
    }
  };

  const handleCancel = () => { abortRef.current?.abort(); cancel(); };

  const handleHistorySelect = async (entry: BacktestHistoryEntry) => {
    try {
      const res = await getSavedBacktestResult(entry.id);
      setResult({ stats: res.stats, trades: res.trades, equityData: res.equity, yearlyData: res.yearly, positions: res.positions }, entry.params);
    } catch {
      setResult({ stats: entry.stats, trades: [], equityData: [], yearlyData: entry.yearly, positions: [] }, entry.params);
    }
  };

  const stats = result?.stats ?? null;
  const trades = result?.trades ?? [];
  const equityData = result?.equityData ?? [];
  const yearlyData = result?.yearlyData ?? [];

  return (
    <div className="flex gap-6 h-full">
      <div className="w-[300px] shrink-0 self-start sticky top-0">
        <div className="rounded-lg p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <ParameterForm onSubmit={handleRun} loading={loading} />
          {loading && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                <div className="h-full rounded-full animate-pulse" style={{ width: "100%", background: "var(--accent)", opacity: 0.6 }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{progressMsg || "Starting..."}</p>
                <button type="button" onClick={handleCancel}
                  className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--red)" }}>Cancel</button>
              </div>
            </div>
          )}
          {error && (
            <p className="mt-3 text-xs rounded p-2" style={{ background: "rgba(239,68,68,0.1)", color: "var(--red)" }}>{error}</p>
          )}
        </div>
        <HistoryPanel onSelect={handleHistorySelect} refreshKey={historyKey} />
      </div>

      <div className="flex-1 space-y-4 min-w-0">
        {!stats && !loading && (
          <div className="flex items-center justify-center h-64 rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
            <p style={{ color: "var(--text-secondary)" }}>파라미터 설정 후 Run Backtest</p>
          </div>
        )}

        {stats && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold">{stats.market}</h2>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                {stats.ranking} · lb{stats.lookback} · {stats.price_mode}
              </span>
              {stats.period_start && (
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{stats.period_start} ~ {stats.period_end}</span>
              )}
              <span className="text-sm font-semibold ml-auto" style={{ color: stats.total_return_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                {stats.total_return_pct >= 0 ? "+" : ""}{stats.total_return_pct.toFixed(1)}%
              </span>
              {stats.elapsed_sec != null && (
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>({stats.elapsed_sec}s)</span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <SummaryCard label="Trades" value={`${stats.trades}`} />
              <SummaryCard label="Win Rate" value={`${stats.win_rate_pct.toFixed(1)}%`} color={stats.win_rate_pct >= 50 ? "var(--green)" : undefined} />
              <SummaryCard label="Profit Factor" value={fmtPF(stats.profit_factor)} color={pfColor(stats.profit_factor)} />
              <SummaryCard label="Annual" value={`${stats.ann_return_pct >= 0 ? "+" : ""}${stats.ann_return_pct.toFixed(1)}%`} color={stats.ann_return_pct >= 0 ? "var(--green)" : "var(--red)"} />
              <SummaryCard label="Max DD" value={`${stats.mdd_pct.toFixed(1)}%`} color="var(--red)" />
              <SummaryCard label="Sharpe" value={stats.sharpe_ratio.toFixed(2)} color={stats.sharpe_ratio >= 1 ? "var(--green)" : undefined} />
              <SummaryCard label="Calmar" value={stats.calmar_ratio.toFixed(2)} color={stats.calmar_ratio >= 2 ? "var(--green)" : undefined} />
              <SummaryCard label="Volatility" value={`${stats.ann_volatility_pct.toFixed(1)}%`} />
            </div>

            {equityData.length > 0 && (
              <EquityCurve data={equityData} height={200} label={currentParams ? `equity_${formatLabel(currentParams)}` : undefined} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StatsTable stats={stats} />
              <YearlyBreakdown data={yearlyData} label={currentParams ? formatLabel(currentParams) : undefined} />
            </div>

            {trades.length > 0 && <TradesTable trades={trades} />}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <p className="text-sm font-bold font-mono" style={{ color: color || "var(--text-primary)" }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{sub}</p>}
    </div>
  );
}
