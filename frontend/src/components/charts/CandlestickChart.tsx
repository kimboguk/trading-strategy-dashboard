"use client";

import { useRef, useEffect } from "react";
import {
  createChart,
  type IChartApi,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import type { ChartData } from "@/lib/types";

const MA_COLORS: Record<string, string> = {
  ma_30: "#2196F3",
  ma_60: "#FF9800",
  ma_120: "#4CAF50",
  ma_240: "#F44336",
};

const MA_LABELS: Record<string, string> = {
  ma_30: "EMA 30",
  ma_60: "EMA 60",
  ma_120: "EMA 120",
  ma_240: "EMA 240",
};

interface Props {
  data: ChartData | null;
  height?: number;
}

export function CandlestickChart({ data, height = 500 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy previous chart
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
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    // Add data
    if (data && data.candles.length > 0) {
      const candleSeries = chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderUpColor: "#26a69a",
        borderDownColor: "#ef5350",
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      });
      candleSeries.setData(data.candles as any);

      if (data.markers.length > 0) {
        candleSeries.setMarkers(
          data.markers
            .sort((a, b) => a.time - b.time)
            .map((m) => ({
              time: m.time as any,
              position: m.position as any,
              color: m.color,
              shape: m.shape as any,
              text: m.text,
            }))
        );
      }

      for (const [key, points] of Object.entries(data.ma_lines)) {
        if (points.length === 0) continue;
        const lineSeries = chart.addLineSeries({
          color: MA_COLORS[key] || "#888",
          lineWidth: 1,
          title: MA_LABELS[key] || key,
          priceLineVisible: false,
        });
        lineSeries.setData(points as any);
      }
    }

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
