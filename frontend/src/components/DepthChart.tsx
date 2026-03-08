"use client";

import { useRef, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DepthChartProps {
  symbol: string;
}

export default function DepthChart({ symbol }: DepthChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data } = useSWR(
    `/api/depth?symbol=${symbol}&limit=100`,
    fetcher,
    { refreshInterval: 5000 }
  );

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 10, right: 10, bottom: 30, left: 10 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    const bids: [number, number][] = data.bids || [];
    const asks: [number, number][] = data.asks || [];
    if (bids.length === 0 && asks.length === 0) return;

    // Find ranges
    const allPrices = [...bids.map((b: [number, number]) => b[0]), ...asks.map((a: [number, number]) => a[0])];
    const allQty = [...bids.map((b: [number, number]) => b[1]), ...asks.map((a: [number, number]) => a[1])];
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const maxQty = Math.max(...allQty);
    const priceRange = maxPrice - minPrice || 1;

    const toX = (price: number) => pad.left + ((price - minPrice) / priceRange) * plotW;
    const toY = (qty: number) => pad.top + plotH - (qty / maxQty) * plotH;

    // Get CSS variable values
    const rootStyle = getComputedStyle(document.documentElement);
    const mutedColor = rootStyle.getPropertyValue("--text-muted").trim() || "#9ca3af";

    // Draw bids (green, filled area)
    if (bids.length > 0) {
      ctx.beginPath();
      // Bids go right to left (highest price to lowest)
      const sortedBids = [...bids].sort((a, b) => b[0] - a[0]);
      ctx.moveTo(toX(sortedBids[0][0]), toY(0));
      for (const [price, qty] of sortedBids) {
        ctx.lineTo(toX(price), toY(qty));
      }
      ctx.lineTo(toX(sortedBids[sortedBids.length - 1][0]), toY(0));
      ctx.closePath();
      ctx.fillStyle = "rgba(22, 199, 132, 0.15)";
      ctx.fill();
      ctx.strokeStyle = "#16c784";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(toX(sortedBids[0][0]), toY(sortedBids[0][1]));
      for (let i = 1; i < sortedBids.length; i++) {
        ctx.lineTo(toX(sortedBids[i][0]), toY(sortedBids[i][1]));
      }
      ctx.stroke();
    }

    // Draw asks (red, filled area)
    if (asks.length > 0) {
      const sortedAsks = [...asks].sort((a, b) => a[0] - b[0]);
      ctx.beginPath();
      ctx.moveTo(toX(sortedAsks[0][0]), toY(0));
      for (const [price, qty] of sortedAsks) {
        ctx.lineTo(toX(price), toY(qty));
      }
      ctx.lineTo(toX(sortedAsks[sortedAsks.length - 1][0]), toY(0));
      ctx.closePath();
      ctx.fillStyle = "rgba(234, 57, 67, 0.15)";
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = "#ea3943";
      ctx.lineWidth = 2;
      ctx.moveTo(toX(sortedAsks[0][0]), toY(sortedAsks[0][1]));
      for (let i = 1; i < sortedAsks.length; i++) {
        ctx.lineTo(toX(sortedAsks[i][0]), toY(sortedAsks[i][1]));
      }
      ctx.stroke();
    }

    // Mid price line
    if (bids.length > 0 && asks.length > 0) {
      const highestBid = Math.max(...bids.map((b: [number, number]) => b[0]));
      const lowestAsk = Math.min(...asks.map((a: [number, number]) => a[0]));
      const midPrice = (highestBid + lowestAsk) / 2;
      const midX = toX(midPrice);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(midX, pad.top);
      ctx.lineTo(midX, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Mid price label
      ctx.fillStyle = mutedColor;
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`$${midPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, midX, pad.top + plotH + 14);
    }

    // Axis labels
    ctx.fillStyle = mutedColor;
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`$${minPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, pad.left, pad.top + plotH + 14);
    ctx.textAlign = "right";
    ctx.fillText(`$${maxPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, w - pad.right, pad.top + plotH + 14);

    // Legend
    ctx.textAlign = "left";
    ctx.fillStyle = "#16c784";
    ctx.fillText("Bids", pad.left, pad.top + plotH + 26);
    ctx.fillStyle = "#ea3943";
    ctx.fillText("Asks", pad.left + 40, pad.top + plotH + 26);
  }, [data]);

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-color)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Order Book Depth
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Live · 5s refresh
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: "200px" }}
      />
    </div>
  );
}
