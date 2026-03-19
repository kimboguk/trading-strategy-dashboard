"use client";

import { useRef, useEffect, useMemo } from "react";
import {
  createChart,
  type IChartApi,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import type { EquityPoint } from "@/lib/types";

/** Resample equity points to daily (last value per date, closed-trade basis). */
function toDailyEquity(data: EquityPoint[]): { date: string; equity: number }[] {
  const byDate = new Map<string, number>();
  for (const d of data) {
    const date = new Date(d.time).toISOString().slice(0, 10); // YYYY-MM-DD
    byDate.set(date, d.equity); // last value per day wins
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, equity]) => ({ date, equity: Math.round(equity * 100) / 100 }));
}

interface Props {
  data: EquityPoint[];
  height?: number;
  label?: string;
}

export function EquityCurve({ data, height = 250, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const dailyEquity = useMemo(() => toDailyEquity(data), [data]);

  const downloadDailyCsv = () => {
    const header = "Date,Equity";
    const rows = dailyEquity.map((d) => `${d.date},${d.equity.toFixed(2)}`);
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(label || "equity_daily").replace(/[^a-zA-Z0-9_\-|+. ]/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#1a1d29" },
        textColor: "#8b8fa3",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#2d304422" },
        horzLines: { color: "#2d304422" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#2d3044" },
      timeScale: {
        borderColor: "#2d3044",
        timeVisible: true,
      },
    });
    chartRef.current = chart;

    const lineSeries = chart.addLineSeries({
      color: "#22c55e",
      lineWidth: 2,
      title: "Equity",
      priceLineVisible: false,
    });

    // Deduplicate and sort by time (required by lightweight-charts)
    const seen = new Set<number>();
    const chartData = data
      .map((d) => ({
        time: Math.floor(new Date(d.time).getTime() / 1000) as any,
        value: d.equity,
      }))
      .filter((d) => {
        if (seen.has(d.time)) return false;
        seen.add(d.time);
        return true;
      })
      .sort((a, b) => a.time - b.time);

    if (chartData.length === 0) return;
    lineSeries.setData(chartData);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      chart.applyOptions({ width });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height]);

  return (
    <div>
      <div className="flex justify-end mb-1">
        <button
          onClick={downloadDailyCsv}
          className="text-xs px-2 py-0.5 rounded"
          style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          title="Download daily equity as CSV"
        >
          CSV
        </button>
      </div>
      <div
        ref={containerRef}
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      />
    </div>
  );
}
