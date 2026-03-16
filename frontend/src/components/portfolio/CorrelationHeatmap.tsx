"use client";

import type { CorrelationData } from "@/lib/types";

interface Props {
  data: CorrelationData;
}

function corrColor(v: number): string {
  // -1 (red) → 0 (neutral gray) → +1 (blue)
  if (v >= 0) {
    const t = Math.min(v, 1);
    const r = Math.round(42 + (1 - t) * 30);
    const g = Math.round(90 + (1 - t) * 30);
    const b = Math.round(180 + (1 - t) * -60);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = Math.min(Math.abs(v), 1);
    const r = Math.round(200 * t + 72 * (1 - t));
    const g = Math.round(60 * t + 120 * (1 - t));
    const b = Math.round(60 * t + 120 * (1 - t));
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function textColor(v: number): string {
  return Math.abs(v) > 0.6 ? "#fff" : "#c0c4d0";
}

export function CorrelationHeatmap({ data }: Props) {
  const { symbols, matrix } = data;
  if (symbols.length < 2) return null;

  const n = symbols.length;
  const cellSize = n > 8 ? 44 : 52;

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <h3
        className="text-sm font-semibold mb-3 uppercase tracking-wider"
        style={{ color: "var(--text-secondary)" }}
      >
        Correlation (Daily Returns, 1Y)
      </h3>
      <div className="overflow-x-auto">
        <table className="border-collapse" style={{ fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ width: 56 }} />
              {symbols.map((s) => (
                <th
                  key={s}
                  className="text-center font-medium px-1 pb-1"
                  style={{ color: "var(--text-secondary)", width: cellSize, minWidth: cellSize }}
                >
                  {s.replace("USD", "").replace("EUR", "E").length > 5 ? s.slice(0, 3) : s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map((row, i) => (
              <tr key={row}>
                <td
                  className="text-right font-medium pr-2 py-0"
                  style={{ color: "var(--text-secondary)", fontSize: 11 }}
                >
                  {row}
                </td>
                {symbols.map((col, j) => {
                  const v = matrix[i][j];
                  const isDiag = i === j;
                  return (
                    <td
                      key={col}
                      className="text-center font-mono"
                      style={{
                        background: isDiag ? "var(--bg-tertiary)" : corrColor(v),
                        color: isDiag ? "var(--text-secondary)" : textColor(v),
                        width: cellSize,
                        height: cellSize - 8,
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 3,
                        border: "2px solid var(--bg-secondary)",
                      }}
                    >
                      {isDiag ? "—" : v.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
