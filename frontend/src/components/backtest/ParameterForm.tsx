"use client";

import { useEffect, useState } from "react";
import { useMarketStore } from "@/lib/store";
import { getUniverseMeta } from "@/lib/api";
import type { BacktestRequest, UniverseMeta } from "@/lib/types";

interface Props {
  onSubmit: (params: BacktestRequest) => void;
  loading: boolean;
}

const labelStyle = "text-xs block mb-1";
const inputStyle =
  "w-full text-sm px-2 py-1 rounded bg-transparent border outline-none";

export function ParameterForm({ onSubmit, loading }: Props) {
  const { market } = useMarketStore();
  const [meta, setMeta] = useState<UniverseMeta | null>(null);

  const [start, setStart] = useState("2018-01-01");
  const [end, setEnd] = useState("2022-12-31");
  const [athRatio, setAthRatio] = useState(1.02);
  const [volRatio, setVolRatio] = useState(2.0);
  const [topN, setTopN] = useState(3);
  const [tpPct, setTpPct] = useState(20);
  const [slPct, setSlPct] = useState(3);
  const [noSl, setNoSl] = useState(false);
  const [slotFraction, setSlotFraction] = useState(33);
  const [entryTiming, setEntryTiming] = useState("avg_close_open");
  const [ranking, setRanking] = useState("bayes_stein");
  const [lookback, setLookback] = useState(504);
  const [qualityFilter, setQualityFilter] = useState(true);
  const [priceMode, setPriceMode] = useState<string>("");

  useEffect(() => {
    getUniverseMeta(market)
      .then((m) => {
        setMeta(m);
        setPriceMode(m.defaults.price_mode);
        if (!m.lookbacks_available.includes(lookback) && m.lookbacks_available.length) {
          setLookback(m.lookbacks_available.includes(504) ? 504 : m.lookbacks_available[0]);
        }
        // 시장별 전 범위로 초기화 (data_start ~ data_end)
        if (m.data_start) setStart(m.data_start.slice(0, 10));
        if (m.data_end) setEnd(m.data_end.slice(0, 10));
      })
      .catch(() => setMeta(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      market,
      start: start || undefined,
      end: end || undefined,
      ath_ratio: athRatio,
      vol_ratio: volRatio,
      top_n: topN,
      tp_pct: tpPct / 100,
      sl_pct: slPct / 100,
      no_sl: noSl,
      slot_fraction: slotFraction / 100,
      entry_timing: entryTiming,
      ranking,
      lookback,
      quality_filter: qualityFilter,
      price_mode: priceMode || undefined,
    });
  };

  const lookbacks = meta?.lookbacks_available ?? [252, 504];

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div>
        <span className="text-sm font-semibold">{meta?.label ?? market}</span>
        {meta && (
          <span className="text-xs ml-2" style={{ color: "var(--text-secondary)" }}>
            {meta.n_selected.toLocaleString()} sel · {meta.data_start?.slice(0, 10)}~{meta.data_end?.slice(0, 10)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelStyle} style={{ color: "var(--text-secondary)" }}>Start</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className={inputStyle} style={{ borderColor: "var(--border)" }} />
        </div>
        <div>
          <label className={labelStyle} style={{ color: "var(--text-secondary)" }}>End</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className={inputStyle} style={{ borderColor: "var(--border)" }} />
        </div>
      </div>

      {meta?.data_start && (
        <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: "var(--text-secondary)" }}>
          <button type="button"
            onClick={() => { setStart(meta.data_start!.slice(0, 10)); if (meta.data_end) setEnd(meta.data_end.slice(0, 10)); }}
            className="px-2 py-0.5 rounded border hover:bg-white/5"
            style={{ borderColor: "var(--border)" }}>
            전체 기간
          </button>
          <span>가능: {meta.data_start.slice(0, 10)} ~ {meta.data_end?.slice(0, 10)}</span>
          {start !== meta.data_start.slice(0, 10) && (
            <span style={{ color: "#f59e0b" }}>⚠ 부분 기간 (전체 아님)</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Num label="ATH ratio" value={athRatio} onChange={setAthRatio} step={0.01} />
        <Num label="Vol ratio" value={volRatio} onChange={setVolRatio} step={0.1} />
        <Num label="Top N" value={topN} onChange={(v) => setTopN(Math.round(v))} step={1} />
        <Num label="Slot %" value={slotFraction} onChange={setSlotFraction} step={1} />
        <Num label="TP %" value={tpPct} onChange={setTpPct} step={1} />
        <Num label="SL %" value={slPct} onChange={setSlPct} step={1} disabled={noSl} />
      </div>

      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        <input type="checkbox" checked={noSl} onChange={(e) => setNoSl(e.target.checked)} />
        SL 비활성 (본전 회복 청산)
      </label>

      <div>
        <label className={labelStyle} style={{ color: "var(--text-secondary)" }}>Entry timing</label>
        <select value={entryTiming} onChange={(e) => setEntryTiming(e.target.value)}
          className={inputStyle} style={{ borderColor: "var(--border)" }}>
          {(meta?.entry_timings ?? ["avg_close_open", "next_open", "next_close", "same_close"]).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelStyle} style={{ color: "var(--text-secondary)" }}>Ranking</label>
          <select value={ranking} onChange={(e) => setRanking(e.target.value)}
            className={inputStyle} style={{ borderColor: "var(--border)" }}>
            {(meta?.rankings ?? ["bayes_stein", "sharpe", "expected_sharpe"]).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelStyle} style={{ color: "var(--text-secondary)" }}>Lookback</label>
          <select value={lookback} onChange={(e) => setLookback(Number(e.target.value))}
            className={inputStyle} style={{ borderColor: "var(--border)" }}>
            {lookbacks.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelStyle} style={{ color: "var(--text-secondary)" }}>Price mode</label>
        <select value={priceMode} onChange={(e) => setPriceMode(e.target.value)}
          className={inputStyle} style={{ borderColor: "var(--border)" }}>
          {(meta?.price_modes ?? ["raw", "adjusted"]).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        <input type="checkbox" checked={qualityFilter} onChange={(e) => setQualityFilter(e.target.checked)} />
        asset_quality 필터 (is_selected)
      </label>

      <button type="submit" disabled={loading}
        className="w-full text-sm font-semibold py-2 rounded transition-colors disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}>
        {loading ? "Running..." : "Run Backtest"}
      </button>
    </form>
  );
}

function Num({ label, value, onChange, step = 1, disabled = false }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; disabled?: boolean;
}) {
  return (
    <div>
      <label className={labelStyle} style={{ color: "var(--text-secondary)" }}>{label}</label>
      <input type="number" value={value} step={step} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full text-sm px-2 py-1 rounded bg-transparent border outline-none disabled:opacity-40"
        style={{ borderColor: "var(--border)" }} />
    </div>
  );
}
