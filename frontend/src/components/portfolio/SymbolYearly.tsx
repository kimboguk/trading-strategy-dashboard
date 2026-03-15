"use client";

import { useState } from "react";
import type { YearlyRow } from "@/lib/types";
import { YearlyBreakdown } from "@/components/backtest/YearlyBreakdown";

interface Props {
  perSymbol: Record<string, { yearly: YearlyRow[] }>;
  symbols: string[];
}

export function SymbolYearly({ perSymbol, symbols }: Props) {
  const [active, setActive] = useState(symbols[0] || "");

  if (symbols.length === 0) return null;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
          Per-Symbol Yearly
        </h3>
        <div className="flex gap-1 flex-wrap">
          {symbols.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActive(s)}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors border"
              style={{
                background: active === s ? "var(--accent)" : "var(--bg-tertiary)",
                borderColor: active === s ? "var(--accent)" : "var(--border)",
                color: active === s ? "#fff" : "var(--text-secondary)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {perSymbol[active] && (
        <YearlyBreakdown data={perSymbol[active].yearly} label={active} />
      )}
    </div>
  );
}
