"use client";

import { useState, useEffect } from "react";
import type { BacktestRequest, SymbolInfo, StrategyInfo } from "@/lib/types";
import { getSymbols, getTimeframes, getSymbolDateRange, getStrategies } from "@/lib/api";

// Ordered from highest to lowest
const TF_RANK: Record<string, number> = { D1: 5, H4: 4, H1: 3, M30: 2, M15: 1 };
const FILTER_TF_OPTIONS = ["D1", "H4", "H1"];

interface Props {
  onSubmit: (params: BacktestRequest) => void;
  loading: boolean;
}

export function ParameterForm({ onSubmit, loading }: Props) {
  const [symbols, setSymbols] = useState<Record<string, SymbolInfo>>({});
  const [timeframes, setTimeframes] = useState<string[]>([]);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);

  const [strategy, setStrategy] = useState("trend_ribbon");
  const [symbol, setSymbol] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("D1");
  const [maType, setMaType] = useState("ema");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [tpPips, setTpPips] = useState("");
  const [slPips, setSlPips] = useState("");
  const [filterTfs, setFilterTfs] = useState<string[]>([]);

  useEffect(() => {
    getSymbols().then(setSymbols);
    getTimeframes().then(setTimeframes);
    getStrategies().then(setStrategies);
  }, []);

  // Fetch date range when symbol changes
  useEffect(() => {
    getSymbolDateRange(symbol).then((range) => {
      const s = range.start?.slice(0, 10) || "";
      const e = range.end?.slice(0, 10) || "";
      setDateRange({ start: s, end: e });
      setStart(s);
      setEnd(e);
    }).catch(() => {});
  }, [symbol]);

  // Clear invalid filters when timeframe changes
  useEffect(() => {
    setFilterTfs((prev) => prev.filter((tf) => (TF_RANK[tf] || 0) > (TF_RANK[timeframe] || 0)));
  }, [timeframe]);

  const toggleFilter = (tf: string) => {
    setFilterTfs((prev) =>
      prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: BacktestRequest = {
      strategy,
      symbol,
      timeframe,
      ma_type: maType,
    };
    if (start) params.start = start;
    if (end) params.end = end;
    if (tpPips) params.tp_pips = parseFloat(tpPips);
    if (slPips) params.sl_pips = parseFloat(slPips);
    if (filterTfs.length > 0) params.filter_tfs = filterTfs;
    onSubmit(params);
  };

  const labelClass = "block text-xs font-medium mb-1";
  const inputClass =
    "w-full rounded px-3 py-1.5 text-sm border outline-none focus:ring-1 focus:ring-blue-500";
  const inputStyle = {
    background: "var(--bg-tertiary)",
    borderColor: "var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
        Parameters
      </h2>

      {/* Strategy */}
      <div>
        <label className={labelClass}>Strategy</label>
        <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className={inputClass} style={inputStyle}>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Symbol */}
      <div>
        <label className={labelClass}>Symbol</label>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputClass} style={inputStyle}>
          {Object.keys(symbols).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Timeframe */}
      <div>
        <label className={labelClass}>Timeframe</label>
        <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className={inputClass} style={inputStyle}>
          {timeframes.map((tf) => (
            <option key={tf} value={tf}>{tf}</option>
          ))}
        </select>
      </div>

      {/* MA Type */}
      <div>
        <label className={labelClass}>MA Type</label>
        <select value={maType} onChange={(e) => setMaType(e.target.value)} className={inputClass} style={inputStyle}>
          <option value="ema">EMA</option>
          <option value="sma">SMA</option>
        </select>
      </div>

      {/* Date Range */}
      <div>
        {dateRange && (
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
            Data: {dateRange.start} ~ {dateRange.end}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Start</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              min={dateRange?.start} max={dateRange?.end}
              className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass}>End</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              min={dateRange?.start} max={dateRange?.end}
              className={inputClass} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* TP / SL */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>TP (pips)</label>
          <input type="number" value={tpPips} onChange={(e) => setTpPips(e.target.value)}
            placeholder="-" className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass}>SL (pips)</label>
          <input type="number" value={slPips} onChange={(e) => setSlPips(e.target.value)}
            placeholder="-" className={inputClass} style={inputStyle} />
        </div>
      </div>

      {/* Higher TF Filter - only show when lower TFs are selected */}
      {FILTER_TF_OPTIONS.some((tf) => (TF_RANK[tf] || 0) > (TF_RANK[timeframe] || 0)) && (
      <div>
        <label className={labelClass}>Higher TF Filter</label>
        <div className="flex gap-2">
          {FILTER_TF_OPTIONS.filter((tf) => (TF_RANK[tf] || 0) > (TF_RANK[timeframe] || 0)).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => toggleFilter(tf)}
              className="px-3 py-1 rounded text-xs font-medium transition-colors border"
              style={{
                background: filterTfs.includes(tf) ? "var(--accent)" : "var(--bg-tertiary)",
                borderColor: filterTfs.includes(tf) ? "var(--accent)" : "var(--border)",
                color: filterTfs.includes(tf) ? "#fff" : "var(--text-secondary)",
              }}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 rounded font-semibold text-sm transition-colors disabled:opacity-50"
        style={{
          background: loading ? "var(--bg-tertiary)" : "var(--accent)",
          color: "#fff",
        }}
      >
        {loading ? "Running..." : "Run Backtest"}
      </button>
    </form>
  );
}
