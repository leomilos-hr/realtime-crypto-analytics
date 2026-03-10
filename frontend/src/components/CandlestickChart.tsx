"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
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
  chartStyle?: "candle" | "line";
}

export default function CandlestickChart({ data, smaData, chartStyle = "candle" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const sma7SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sma14SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const initialFitDone = useRef(false);
  const prevDataLen = useRef(0);
  const prevLastTime = useRef(0);

  // Create chart once, recreate only when chart style changes
  useEffect(() => {
    if (!containerRef.current) return;

    // Remove previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    mainSeriesRef.current = null;
    volumeSeriesRef.current = null;
    sma7SeriesRef.current = null;
    sma14SeriesRef.current = null;
    initialFitDone.current = false;
    prevDataLen.current = 0;
    prevLastTime.current = 0;

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
    chartRef.current = chart;

    // Main price series
    if (chartStyle === "line") {
      mainSeriesRef.current = chart.addSeries(AreaSeries, {
        lineColor: "#3b82f6",
        topColor: "rgba(59, 130, 246, 0.3)",
        bottomColor: "rgba(59, 130, 246, 0.02)",
        lineWidth: 2,
      });
    } else {
      mainSeriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        wickUpColor: "#22c55e",
      });
    }

    // Volume histogram
    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // SMA lines (only in candle mode)
    if (chartStyle === "candle") {
      sma7SeriesRef.current = chart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma14SeriesRef.current = chart.addSeries(LineSeries, {
        color: "#eab308",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
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
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
      sma7SeriesRef.current = null;
      sma14SeriesRef.current = null;
    };
  }, [chartStyle]);

  // Update data — use update() for last bar, setData() only on full reload
  useEffect(() => {
    if (!chartRef.current || !mainSeriesRef.current || !volumeSeriesRef.current || !data.length) return;

    const lastCandle = data[data.length - 1];
    const isNewDataSet = data.length !== prevDataLen.current ||
      (data.length > 0 && data[0].time !== prevLastTime.current);

    if (isNewDataSet) {
      // Full data load (symbol/interval changed, or new candles appeared at front)
      if (chartStyle === "line") {
        mainSeriesRef.current.setData(
          data.map((d) => ({ time: d.time as Time, value: d.close }))
        );
      } else {
        mainSeriesRef.current.setData(
          data.map((d) => ({
            time: d.time as Time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          }))
        );
      }

      volumeSeriesRef.current.setData(
        data.map((d) => ({
          time: d.time as Time,
          value: d.volume,
          color: d.close >= d.open ? "#22c55e40" : "#ef444440",
        }))
      );

      // SMA data
      if (smaData && smaData.length > 0 && chartStyle === "candle") {
        if (sma7SeriesRef.current) {
          sma7SeriesRef.current.setData(
            smaData.filter((d) => d.sma_7).map((d) => ({ time: d.time as Time, value: d.sma_7 }))
          );
        }
        if (sma14SeriesRef.current) {
          sma14SeriesRef.current.setData(
            smaData.filter((d) => d.sma_14).map((d) => ({ time: d.time as Time, value: d.sma_14 }))
          );
        }
      }

      // Only fitContent on first load
      if (!initialFitDone.current) {
        chartRef.current.timeScale().fitContent();
        initialFitDone.current = true;
      } else if (data.length > prevDataLen.current && prevDataLen.current > 0) {
        // New candle appeared — scroll to show it but don't reset zoom
        chartRef.current.timeScale().scrollToRealTime();
      }

      prevDataLen.current = data.length;
      prevLastTime.current = data.length > 0 ? data[0].time : 0;
    } else {
      // Incremental update — only update last bar (WebSocket tick)
      if (chartStyle === "line") {
        mainSeriesRef.current.update({
          time: lastCandle.time as Time,
          value: lastCandle.close,
        });
      } else {
        mainSeriesRef.current.update({
          time: lastCandle.time as Time,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
        });
      }

      volumeSeriesRef.current.update({
        time: lastCandle.time as Time,
        value: lastCandle.volume,
        color: lastCandle.close >= lastCandle.open ? "#22c55e40" : "#ef444440",
      });
    }
  }, [data, smaData, chartStyle]);

  return (
    <div ref={containerRef} className="w-full h-[500px] rounded-lg overflow-hidden" />
  );
}
