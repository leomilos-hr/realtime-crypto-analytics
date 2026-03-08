"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  data: OHLCData[];
  smaData?: { time: number; sma_7: number; sma_14: number }[];
}

export default function CandlestickChart({ data, smaData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const sma7Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const sma14Ref = useRef<ISeriesApi<"Line"> | null>(null);

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
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: "#243049" },
      timeScale: {
        borderColor: "#243049",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const sma7Series = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const sma14Series = chart.addSeries(LineSeries, {
      color: "#eab308",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    sma7Ref.current = sma7Series;
    sma14Ref.current = sma14Series;

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleRef.current || !volumeRef.current || !data.length) return;

    candleRef.current.setData(
      data.map((d) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    );

    volumeRef.current.setData(
      data.map((d) => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? "#22c55e40" : "#ef444440",
      }))
    );

    chartRef.current?.timeScale().fitContent();
  }, [data]);

  useEffect(() => {
    if (!sma7Ref.current || !sma14Ref.current) return;

    if (smaData && smaData.length > 0) {
      sma7Ref.current.setData(
        smaData
          .filter((d) => d.sma_7)
          .map((d) => ({ time: d.time as Time, value: d.sma_7 }))
      );
      sma14Ref.current.setData(
        smaData
          .filter((d) => d.sma_14)
          .map((d) => ({ time: d.time as Time, value: d.sma_14 }))
      );
    } else {
      sma7Ref.current.setData([]);
      sma14Ref.current.setData([]);
    }
  }, [smaData]);

  return (
    <div ref={containerRef} className="w-full h-[500px] rounded-lg overflow-hidden" />
  );
}
