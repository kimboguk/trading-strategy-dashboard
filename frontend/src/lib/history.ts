import type { BacktestRequest } from "./types";

/** 백테스트 파라미터 → 짧은 라벨 (CSV 파일명/히스토리 표시용). */
export function formatLabel(p: BacktestRequest): string {
  const parts = [
    p.market,
    `top${p.top_n}`,
    `tp${Math.round(p.tp_pct * 100)}`,
    p.no_sl ? "noSL" : `sl${Math.round(p.sl_pct * 100)}`,
    p.ranking,
    `lb${p.lookback}`,
  ];
  if (p.start || p.end) parts.push(`${p.start ?? ""}_${p.end ?? ""}`);
  return parts.join("|");
}
