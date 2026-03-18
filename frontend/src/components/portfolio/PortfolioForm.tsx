"use client";

import { useState, useEffect, useMemo } from "react";
import type { PortfolioRequest, SymbolInfo, StrategyInfo } from "@/lib/types";
import { getSymbols, getTimeframes, getSymbolDateRange, getStrategies } from "@/lib/api";

const TF_RANK: Record<string, number> = { D1: 7, H4: 6, H1: 5, M30: 4, M15: 3, M5: 2, M1: 1 };
const FILTER_TF_OPTIONS = ["D1", "H4", "H1", "M30", "M15"];
const MA_OPTIONS = [30, 60, 120, 240];
const STRATEGY_TAG: Record<string, string> = {
  trend_ribbon: "TR",
  golden_cross: "XMA",
};

interface Props {
  onSubmit: (params: PortfolioRequest) => void;
  loading: boolean;
}

// Per-strategy params state
interface StrategyParams {
  timeframe: string;
  maType: string;
  filterTfs: string[];
  // trend_ribbon specific
  ribbonPeriods: number[];
  alignmentMas: number[];
  // golden_cross specific
  fastPeriod: string;
  slowPeriod: string;
}

const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  timeframe: "M30",
  maType: "ema",
  filterTfs: [],
  ribbonPeriods: [30, 60, 120, 240],
  alignmentMas: [],
  fastPeriod: "60",
  slowPeriod: "240",
};

export function PortfolioForm({ onSubmit, loading }: Props) {
  const [symbols, setSymbols] = useState<Record<string, SymbolInfo>>({});
  const [timeframes, setTimeframes] = useState<string[]>([]);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);

  // Matrix state: symbol → list of strategy IDs
  const [allocations, setAllocations] = useState<Record<string, string[]>>({});
  const [capitalPerSlot, setCapitalPerSlot] = useState(10000);

  // Run name (optional)
  const [runName, setRunName] = useState("");

  // Global defaults (date range, TP/SL)
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [tpPips, setTpPips] = useState("");
  const [slPips, setSlPips] = useState("");

  // Per-strategy params
  const [stratParams, setStratParams] = useState<Record<string, StrategyParams>>({
    trend_ribbon: { ...DEFAULT_STRATEGY_PARAMS },
    golden_cross: { ...DEFAULT_STRATEGY_PARAMS, timeframe: "D1" },
  });

  useEffect(() => {
    getSymbols().then(setSymbols);
    getTimeframes().then(setTimeframes);
    getStrategies().then((s) => {
      setStrategies(s);
      // Initialize params for any new strategies
      setStratParams((prev) => {
        const next = { ...prev };
        for (const strat of s) {
          if (!next[strat.id]) next[strat.id] = { ...DEFAULT_STRATEGY_PARAMS };
        }
        return next;
      });
    });
  }, []);

  // Derived values
  const activeStrategies = useMemo(() => {
    const set = new Set<string>();
    Object.values(allocations).forEach((strats) => strats.forEach((s) => set.add(s)));
    return Array.from(set);
  }, [allocations]);

  const slotCount = useMemo(() => {
    return Object.values(allocations).reduce((sum, strats) => sum + strats.length, 0);
  }, [allocations]);

  const totalCapital = slotCount * capitalPerSlot;
  const selectedSymbols = useMemo(() => Object.keys(allocations), [allocations]);

  // Date range from selected symbols
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

  // Helper: update a field in a strategy's params
  const updateStratParam = (stratId: string, field: keyof StrategyParams, value: any) => {
    setStratParams((prev) => ({
      ...prev,
      [stratId]: { ...(prev[stratId] || DEFAULT_STRATEGY_PARAMS), [field]: value },
    }));
  };

  // Clean up filterTfs when timeframe changes
  const handleTfChange = (stratId: string, newTf: string) => {
    updateStratParam(stratId, "timeframe", newTf);
    setStratParams((prev) => {
      const sp = prev[stratId];
      if (!sp) return prev;
      return {
        ...prev,
        [stratId]: {
          ...sp,
          timeframe: newTf,
          filterTfs: sp.filterTfs.filter((tf) => (TF_RANK[tf] || 0) > (TF_RANK[newTf] || 0)),
        },
      };
    });
  };

  // Matrix toggle
  const toggleCell = (symbol: string, strategyId: string) => {
    setAllocations((prev) => {
      const strats = prev[symbol] || [];
      if (strats.includes(strategyId)) {
        const next = strats.filter((s) => s !== strategyId);
        if (next.length === 0) {
          const { [symbol]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [symbol]: next };
      }
      return { ...prev, [symbol]: [...strats, strategyId] };
    });
  };

  const toggleStrategyColumn = (strategyId: string) => {
    const allSymbols = Object.keys(symbols);
    const allHave = allSymbols.every((s) => (allocations[s] || []).includes(strategyId));
    setAllocations((prev) => {
      const next = { ...prev };
      for (const sym of allSymbols) {
        const strats = next[sym] || [];
        if (allHave) {
          const filtered = strats.filter((s) => s !== strategyId);
          if (filtered.length === 0) delete next[sym];
          else next[sym] = filtered;
        } else {
          if (!strats.includes(strategyId)) next[sym] = [...strats, strategyId];
        }
      }
      return next;
    });
  };

  const toggleCategoryColumn = (category: string, strategyId: string) => {
    const catSymbols = Object.keys(symbols).filter(
      (s) => (symbols[s].category || "forex") === category
    );
    const allHave = catSymbols.every((s) => (allocations[s] || []).includes(strategyId));
    setAllocations((prev) => {
      const next = { ...prev };
      for (const sym of catSymbols) {
        const strats = next[sym] || [];
        if (allHave) {
          const filtered = strats.filter((s) => s !== strategyId);
          if (filtered.length === 0) delete next[sym];
          else next[sym] = filtered;
        } else {
          if (!strats.includes(strategyId)) next[sym] = [...strats, strategyId];
        }
      }
      return next;
    });
  };

  const clearAll = () => setAllocations({});

  const toggleFilterTf = (stratId: string, tf: string) => {
    setStratParams((prev) => {
      const sp = prev[stratId] || DEFAULT_STRATEGY_PARAMS;
      const next = sp.filterTfs.includes(tf)
        ? sp.filterTfs.filter((t) => t !== tf)
        : [...sp.filterTfs, tf];
      return { ...prev, [stratId]: { ...sp, filterTfs: next } };
    });
  };

  const toggleRibbon = (period: number) => {
    setStratParams((prev) => {
      const sp = prev.trend_ribbon || DEFAULT_STRATEGY_PARAMS;
      const next = sp.ribbonPeriods.includes(period)
        ? sp.ribbonPeriods.length > 1 ? sp.ribbonPeriods.filter((p) => p !== period) : sp.ribbonPeriods
        : [...sp.ribbonPeriods, period];
      return { ...prev, trend_ribbon: { ...sp, ribbonPeriods: next } };
    });
  };

  const toggleAlignment = (period: number) => {
    setStratParams((prev) => {
      const sp = prev.trend_ribbon || DEFAULT_STRATEGY_PARAMS;
      const next = sp.alignmentMas.includes(period)
        ? sp.alignmentMas.filter((p) => p !== period)
        : [...sp.alignmentMas, period];
      return { ...prev, trend_ribbon: { ...sp, alignmentMas: next } };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const allocationList: { symbol: string; strategy: string }[] = [];
    for (const [sym, strats] of Object.entries(allocations)) {
      for (const strat of strats) {
        allocationList.push({ symbol: sym, strategy: strat });
      }
    }

    // Build strategy_defaults with TF, MA, and strategy-specific params
    const sd: Record<string, Record<string, any>> = {};
    for (const stratId of activeStrategies) {
      const sp = stratParams[stratId] || DEFAULT_STRATEGY_PARAMS;
      sd[stratId] = {
        timeframe: sp.timeframe,
        ma_type: sp.maType,
      };
      if (sp.filterTfs.length > 0) sd[stratId].filter_tfs = sp.filterTfs;

      if (stratId === "trend_ribbon") {
        if (sp.ribbonPeriods.length < 4) sd[stratId].ribbon_periods = sp.ribbonPeriods;
        if (sp.alignmentMas.length >= 2) sd[stratId].alignment_mas = sp.alignmentMas;
      }
      if (stratId === "golden_cross") {
        const fp = parseInt(sp.fastPeriod);
        const sp2 = parseInt(sp.slowPeriod);
        if (fp > 0) sd[stratId].fast_period = fp;
        if (sp2 > 0) sd[stratId].slow_period = sp2;
      }
    }

    const params: PortfolioRequest = {
      ...(runName.trim() && { run_name: runName.trim() }),
      allocations: allocationList,
      capital_per_slot: capitalPerSlot,
      defaults: {
        timeframe: "D1", // fallback only
        ma_type: "ema",
        ...(start && { start }),
        ...(end && { end }),
        ...(tpPips && { tp_pips: parseFloat(tpPips) }),
        ...(slPips && { sl_pips: parseFloat(slPips) }),
      },
      strategy_defaults: sd,
    };
    onSubmit(params);
  };

  const labelClass = "block text-xs font-medium mb-1";
  const inputClass = "w-full rounded px-3 py-1.5 text-sm border outline-none focus:ring-1 focus:ring-blue-500";
  const inputStyle = {
    background: "var(--bg-tertiary)",
    borderColor: "var(--border)",
    color: "var(--text-primary)",
  };

  // Render strategy-specific section
  const renderStrategySection = (stratId: string) => {
    const tag = STRATEGY_TAG[stratId] || stratId;
    const sp = stratParams[stratId] || DEFAULT_STRATEGY_PARAMS;
    const isTR = stratId === "trend_ribbon";
    const isXMA = stratId === "golden_cross";

    return (
      <div key={stratId} className="space-y-2 p-2 rounded" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
          {tag} Parameters
        </p>

        {/* TF + MA Type */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Timeframe</label>
            <select value={sp.timeframe} onChange={(e) => handleTfChange(stratId, e.target.value)}
              className={inputClass} style={inputStyle}>
              {timeframes.map((tf) => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>MA Type</label>
            <select value={sp.maType} onChange={(e) => updateStratParam(stratId, "maType", e.target.value)}
              className={inputClass} style={inputStyle}>
              <option value="ema">EMA</option>
              <option value="sma">SMA</option>
            </select>
          </div>
        </div>

        {/* Higher TF Filter */}
        {FILTER_TF_OPTIONS.some((tf) => (TF_RANK[tf] || 0) > (TF_RANK[sp.timeframe] || 0)) && (
          <div>
            <label className={labelClass}>Higher TF Filter</label>
            <div className="flex gap-2">
              {FILTER_TF_OPTIONS.filter((tf) => (TF_RANK[tf] || 0) > (TF_RANK[sp.timeframe] || 0)).map((tf) => (
                <button key={tf} type="button" onClick={() => toggleFilterTf(stratId, tf)}
                  className="px-2.5 py-1 rounded text-xs font-medium transition-colors border"
                  style={{
                    background: sp.filterTfs.includes(tf) ? "var(--accent)" : "var(--bg-secondary)",
                    borderColor: sp.filterTfs.includes(tf) ? "var(--accent)" : "var(--border)",
                    color: sp.filterTfs.includes(tf) ? "#fff" : "var(--text-secondary)",
                  }}>{tf}</button>
              ))}
            </div>
          </div>
        )}

        {/* TR-specific */}
        {isTR && (
          <>
            <div>
              <label className={labelClass}>Ribbon MAs</label>
              <div className="flex gap-2">
                {MA_OPTIONS.map((p) => (
                  <button key={p} type="button" onClick={() => toggleRibbon(p)}
                    className="px-2.5 py-1 rounded text-xs font-medium transition-colors border"
                    style={{
                      background: sp.ribbonPeriods.includes(p) ? "var(--accent)" : "var(--bg-secondary)",
                      borderColor: sp.ribbonPeriods.includes(p) ? "var(--accent)" : "var(--border)",
                      color: sp.ribbonPeriods.includes(p) ? "#fff" : "var(--text-secondary)",
                    }}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>MA Alignment</label>
              <div className="flex gap-2">
                {MA_OPTIONS.map((p) => (
                  <button key={p} type="button" onClick={() => toggleAlignment(p)}
                    className="px-2.5 py-1 rounded text-xs font-medium transition-colors border"
                    style={{
                      background: sp.alignmentMas.includes(p) ? "var(--accent)" : "var(--bg-secondary)",
                      borderColor: sp.alignmentMas.includes(p) ? "var(--accent)" : "var(--border)",
                      color: sp.alignmentMas.includes(p) ? "#fff" : "var(--text-secondary)",
                    }}>{p}</button>
                ))}
              </div>
              {sp.alignmentMas.length === 1 && (
                <p className="text-xs mt-1" style={{ color: "var(--yellow, #f59e0b)" }}>Select 2+ MAs</p>
              )}
            </div>
          </>
        )}

        {/* XMA-specific */}
        {isXMA && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Fast Period</label>
              <input type="number" value={sp.fastPeriod}
                onChange={(e) => updateStratParam(stratId, "fastPeriod", e.target.value)}
                min="1" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass}>Slow Period</label>
              <input type="number" value={sp.slowPeriod}
                onChange={(e) => updateStratParam(stratId, "slowPeriod", e.target.value)}
                min="1" className={inputClass} style={inputStyle} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
        Portfolio
      </h2>

      {/* Run Name (optional) */}
      <div>
        <label className={labelClass}>Run Name</label>
        <input type="text" value={runName} onChange={(e) => setRunName(e.target.value)}
          placeholder="(auto)" className={inputClass} style={inputStyle} />
      </div>

      {/* Capital per slot */}
      <div>
        <label className={labelClass}>Capital / Slot</label>
        <input type="number" value={capitalPerSlot}
          onChange={(e) => setCapitalPerSlot(Number(e.target.value) || 10000)}
          min={100} step="any" className={inputClass} style={inputStyle} />
      </div>

      {/* Strategy × Symbol Matrix */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium">Allocations</label>
          <button type="button" onClick={clearAll} className="text-xs px-1.5 py-0.5 rounded"
            style={{ color: "var(--text-secondary)" }}>Clear</button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th className="text-left py-1 pr-1" style={{ minWidth: "90px" }}></th>
                {strategies.map((s) => (
                  <th key={s.id} className="text-center py-1 px-1" style={{ minWidth: "40px" }}>
                    <button type="button" onClick={() => toggleStrategyColumn(s.id)}
                      className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                      {STRATEGY_TAG[s.id] || s.id}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["forex", "index", "crypto"] as const).flatMap((cat) => {
                const catSymbols = Object.keys(symbols).filter(
                  (s) => (symbols[s].category || "forex") === cat
                );
                if (catSymbols.length === 0) return [];
                return [
                  <tr key={`hdr-${cat}`}>
                    <td className="text-xs uppercase tracking-wider pt-2 pb-0.5 font-semibold"
                      style={{ color: "var(--text-secondary)" }}>{cat}</td>
                    {strategies.map((s) => (
                      <td key={s.id} className="text-center pt-2 pb-0.5">
                        <button type="button" onClick={() => toggleCategoryColumn(cat, s.id)}
                          className="text-xs hover:underline"
                          style={{ color: "var(--text-secondary)", fontSize: "9px" }}>all</button>
                      </td>
                    ))}
                  </tr>,
                  ...catSymbols.map((sym) => (
                    <tr key={sym}>
                      <td className="py-0.5 pr-1 text-xs font-medium">{sym}</td>
                      {strategies.map((s) => {
                        const active = (allocations[sym] || []).includes(s.id);
                        return (
                          <td key={s.id} className="text-center py-0.5">
                            <button type="button" onClick={() => toggleCell(sym, s.id)}
                              className="w-5 h-5 rounded border text-xs leading-none inline-flex items-center justify-center"
                              style={{
                                background: active ? "var(--accent)" : "var(--bg-tertiary)",
                                borderColor: active ? "var(--accent)" : "var(--border)",
                                color: active ? "#fff" : "transparent",
                              }}>
                              {active ? "✓" : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>

        {slotCount > 0 && (
          <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-secondary)" }}>
            {slotCount} slot{slotCount > 1 ? "s" : ""} · ${totalCapital.toLocaleString()}
          </p>
        )}
      </div>

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
              min={dateRange?.start} max={dateRange?.end} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass}>End</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              min={dateRange?.start} max={dateRange?.end} className={inputClass} style={inputStyle} />
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

      {/* Strategy-specific sections (TF, MA, filters, params) */}
      {activeStrategies.map((stratId) => renderStrategySection(stratId))}

      {/* Submit */}
      <button type="submit" disabled={loading || slotCount === 0}
        className="w-full py-2 rounded font-semibold text-sm transition-colors disabled:opacity-50"
        style={{ background: loading ? "var(--bg-tertiary)" : "var(--accent)", color: "#fff" }}>
        {loading ? "Running..." : `Run Portfolio (${slotCount} slot${slotCount !== 1 ? "s" : ""})`}
      </button>
    </form>
  );
}
