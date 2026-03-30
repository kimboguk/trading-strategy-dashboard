"use client";

import { useState, useEffect } from "react";
import type { BacktestRequest, SymbolInfo, StrategyInfo } from "@/lib/types";
import { getSymbols, getTimeframes, getSymbolDateRange, getStrategies } from "@/lib/api";

// Ordered from highest to lowest
const TF_RANK: Record<string, number> = { D1: 7, H4: 6, H1: 5, M30: 4, M15: 3, M5: 2, M1: 1 };
const FILTER_TF_OPTIONS = ["D1", "H4", "H1", "M30", "M15"];
const MA_OPTIONS = [30, 60, 120, 240];

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
  const [alignmentMas, setAlignmentMas] = useState<number[]>([]);
  const [ribbonPeriods, setRibbonPeriods] = useState<number[]>([30, 60, 120, 240]);
  const [fastPeriod, setFastPeriod] = useState("60");
  const [slowPeriod, setSlowPeriod] = useState("240");
  const [compound, setCompound] = useState(false);
  const [useKalman, setUseKalman] = useState(false);

  const isTrendRibbon = strategy === "trend_ribbon";
  const isGoldenCross = strategy === "golden_cross";

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
    if (compound) params.compound = true;
    if (useKalman) params.use_kalman = true;
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
          {(["forex", "index", "crypto"] as const).map((cat) => {
            const catSymbols = Object.keys(symbols).filter((s) => (symbols[s].category || "forex") === cat);
            if (catSymbols.length === 0) return null;
            return (
              <optgroup key={cat} label={cat.toUpperCase()}>
                {catSymbols.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </optgroup>
            );
          })}
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
          <option value="wma">WMA</option>
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
        {(() => {
          const cat = symbols[symbol]?.category || "forex";
          const unit = cat === "index" ? "ticks" : cat === "crypto" ? "$" : "pips";
          return (<>
            <div>
              <label className={labelClass}>TP ({unit})</label>
              <input type="number" value={tpPips} onChange={(e) => setTpPips(e.target.value)}
                placeholder="-" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass}>SL ({unit})</label>
              <input type="number" value={slPips} onChange={(e) => setSlPips(e.target.value)}
                placeholder="-" className={inputClass} style={inputStyle} />
            </div>
          </>);
        })()}
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

      {/* Compound mode */}
      <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
        <input type="checkbox" checked={compound} onChange={(e) => setCompound(e.target.checked)} />
        Compound (position sizing proportional to equity)
      </label>

      {/* Kalman filter */}
      <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
        <input type="checkbox" checked={useKalman} onChange={(e) => setUseKalman(e.target.checked)} />
        Kalman Filter (noise reduction, Q/R=0.1)
      </label>

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
