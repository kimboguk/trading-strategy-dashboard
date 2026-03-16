"use client";

import { useRef, useEffect } from "react";
import {
  createChart,
  type IChartApi,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import type { EquityPoint } from "@/lib/types";

interface Props {
  data: EquityPoint[];
  height?: number;
}

export function EquityCurve({ data, height = 250 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

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
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)" }}
    />
  );
}
