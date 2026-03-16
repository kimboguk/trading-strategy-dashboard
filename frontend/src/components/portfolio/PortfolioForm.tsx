"use client";

import { useState, useEffect } from "react";
import type { PortfolioRequest, SymbolInfo, StrategyInfo } from "@/lib/types";
import { getSymbols, getTimeframes, getSymbolDateRange, getStrategies } from "@/lib/api";

const TF_RANK: Record<string, number> = { D1: 7, H4: 6, H1: 5, M30: 4, M15: 3, M5: 2, M1: 1 };
const FILTER_TF_OPTIONS = ["D1", "H4", "H1", "M30", "M15"];
const MA_OPTIONS = [30, 60, 120, 240];

interface Props {
  onSubmit: (params: PortfolioRequest) => void;
  loading: boolean;
}

export function PortfolioForm({ onSubmit, loading }: Props) {
  const [symbols, setSymbols] = useState<Record<string, SymbolInfo>>({});
  const [timeframes, setTimeframes] = useState<string[]>([]);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);

  const [strategy, setStrategy] = useState("trend_ribbon");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState("M30");
  const [maType, setMaType] = useState("ema");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [tpPips, setTpPips] = useState("");
  const [slPips, setSlPips] = useState("");
  const [filterTfs, setFilterTfs] = useState<string[]>([]);
  const [alignmentMas, setAlignmentMas] = useState<number[]>([]);
  const [ribbonPeriods, setRibbonPeriods] = useState<number[]>([30, 60, 120, 240]);
  const [fastPeriod, setFastPeriod] = useState("60");
  const [slowPeriod, setSlowPeriod] = useState("240");

  const isTrendRibbon = strategy === "trend_ribbon";
  const isGoldenCross = strategy === "golden_cross";

  useEffect(() => {
    getSymbols().then((s) => {
      setSymbols(s);
      setSelectedSymbols(Object.keys(s));
    });
    getTimeframes().then(setTimeframes);
    getStrategies().then(setStrategies);
  }, []);

  useEffect(() => {
    if (selectedSymbols.length === 0) return;
    Promise.all(selectedSymbols.map((s) => getSymbolDateRange(s)))
      .then((ranges) => {
        const starts = ranges.map((r) => r.start?.slice(0, 10) || "");
        const ends = ranges.map((r) => r.end?.slice(0, 10) || "");
        const commonStart = starts.filter(Boolean).sort().pop() || "";
        const commonEnd = ends.filter(Boolean).sort().shift() || "";
        setDateRange({ start: commonStart, end: commonEnd });
        setStart(commonStart);
        setEnd(commonEnd);
      })
      .catch(() => {});
  }, [selectedSymbols]);

  useEffect(() => {
    setFilterTfs((prev) => prev.filter((tf) => (TF_RANK[tf] || 0) > (TF_RANK[timeframe] || 0)));
  }, [timeframe]);

  const toggleSymbol = (s: string) => {
    setSelectedSymbols((prev) => {
      if (prev.includes(s) && prev.length <= 1) return prev;
      return prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
    });
  };

  const selectAllSymbols = () => setSelectedSymbols(Object.keys(symbols));

  const toggleFilter = (tf: string) => {
    setFilterTfs((prev) =>
      prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]
    );
  };

  const toggleAlignment = (period: number) => {
    setAlignmentMas((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period]
    );
  };

  const toggleRibbon = (period: number) => {
    setRibbonPeriods((prev) => {
      if (prev.includes(period) && prev.length <= 1) return prev;
      return prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: PortfolioRequest = {
      strategy,
      symbols: selectedSymbols,
      timeframe,
      ma_type: maType,
    };
    if (start) params.start = start;
    if (end) params.end = end;
    if (tpPips) params.tp_pips = parseFloat(tpPips);
    if (slPips) params.sl_pips = parseFloat(slPips);
    if (filterTfs.length > 0) params.filter_tfs = filterTfs;
    if (isTrendRibbon) {
      if (alignmentMas.length >= 2) params.alignment_mas = alignmentMas;
      if (ribbonPeriods.length < 4) params.ribbon_periods = ribbonPeriods;
    }
    if (isGoldenCross) {
      const fp = parseInt(fastPeriod);
      const sp = parseInt(slowPeriod);
      if (fp > 0) params.fast_period = fp;
      if (sp > 0) params.slow_period = sp;
    }
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
        Portfolio
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

      {/* Symbols multi-select */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium">Symbols</label>
          <button
            type="button"
            onClick={selectAllSymbols}
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ color: "var(--accent)" }}
          >
            All
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(symbols).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSymbol(s)}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors border"
              style={{
                background: selectedSymbols.includes(s) ? "var(--accent)" : "var(--bg-tertiary)",
                borderColor: selectedSymbols.includes(s) ? "var(--accent)" : "var(--border)",
                color: selectedSymbols.includes(s) ? "#fff" : "var(--text-secondary)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
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

      {/* Golden Cross: Fast/Slow Period */}
      {isGoldenCross && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Fast Period</label>
            <input type="number" value={fastPeriod} onChange={(e) => setFastPeriod(e.target.value)}
              min="1" className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass}>Slow Period</label>
            <input type="number" value={slowPeriod} onChange={(e) => setSlowPeriod(e.target.value)}
              min="1" className={inputClass} style={inputStyle} />
          </div>
        </div>
      )}

      {/* Ribbon MAs (trend_ribbon only) */}
      {isTrendRibbon && (
        <div>
          <label className={labelClass}>Ribbon MAs</label>
          <div className="flex gap-2">
            {MA_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => toggleRibbon(p)}
                className="px-2.5 py-1 rounded text-xs font-medium transition-colors border"
                style={{
                  background: ribbonPeriods.includes(p) ? "var(--accent)" : "var(--bg-tertiary)",
                  borderColor: ribbonPeriods.includes(p) ? "var(--accent)" : "var(--border)",
                  color: ribbonPeriods.includes(p) ? "#fff" : "var(--text-secondary)",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date Range */}
      <div>
        {dateRange && (
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
            Common: {dateRange.start} ~ {dateRange.end}
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

      {/* Higher TF Filter */}
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

      {/* MA Alignment Filter (trend_ribbon only) */}
      {isTrendRibbon && (
        <div>
          <label className={labelClass}>MA Alignment Filter</label>
          <div className="flex gap-2">
            {MA_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => toggleAlignment(p)}
                className="px-2.5 py-1 rounded text-xs font-medium transition-colors border"
                style={{
                  background: alignmentMas.includes(p) ? "var(--accent)" : "var(--bg-tertiary)",
                  borderColor: alignmentMas.includes(p) ? "var(--accent)" : "var(--border)",
                  color: alignmentMas.includes(p) ? "#fff" : "var(--text-secondary)",
                }}
              >
                {p}
              </button>
            ))}
          </div>
          {alignmentMas.length === 1 && (
            <p className="text-xs mt-1" style={{ color: "var(--yellow, #f59e0b)" }}>Select 2+ MAs</p>
          )}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || selectedSymbols.length === 0}
        className="w-full py-2 rounded font-semibold text-sm transition-colors disabled:opacity-50"
        style={{
          background: loading ? "var(--bg-tertiary)" : "var(--accent)",
          color: "#fff",
        }}
      >
        {loading ? "Running..." : `Run Portfolio (${selectedSymbols.length} symbols)`}
      </button>
    </form>
  );
}
