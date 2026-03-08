"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

interface RSIData {
  time: number;
  value: number;
}

interface Props {
  data: RSIData[];
}

export default function RSIChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e17" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1a2236" },
        horzLines: { color: "#1a2236" },
      },
      rightPriceScale: {
        borderColor: "#243049",
        autoScale: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#243049",
        timeVisible: true,
        visible: false,
      },
      height: 150,
    });

    const series = chart.addSeries(LineSeries, {
      color: "#a855f7",
      lineWidth: 2,
      priceLineVisible: false,
    });

    // Add overbought/oversold lines
    const overbought = chart.addSeries(LineSeries, {
      color: "#ef444480",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const oversold = chart.addSeries(LineSeries, {
      color: "#22c55e80",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Set static reference lines
    if (data.length > 0) {
      const times = data.map((d) => ({ time: d.time as Time, value: 70 }));
      const times2 = data.map((d) => ({ time: d.time as Time, value: 30 }));
      overbought.setData(times);
      oversold.setData(times2);
    }

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !data.length) return;

    seriesRef.current.setData(
      data.map((d) => ({ time: d.time as Time, value: d.value }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return (
    <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />
  );
}
