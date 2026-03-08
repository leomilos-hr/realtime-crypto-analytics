"use client";

import { useEffect, useState } from "react";
import { SYMBOL_LABELS, Symbol } from "@/lib/types";

interface PriceData {
  symbol: string;
  price: number;
  open: number;
  change?: number;
}

export default function LiveTicker() {
  const [prices, setPrices] = useState<PriceData[]>([]);

  useEffect(() => {
    const eventSource = new EventSource("/api/live");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setPrices(data);
      } catch {
        // Ignore parse errors
      }
    };

    return () => eventSource.close();
  }, []);

  return (
    <div className="flex gap-4 overflow-x-auto py-2 px-4" style={{ backgroundColor: "var(--bg-card)", borderBottom: "1px solid var(--border-color)" }}>
      {prices.map((p) => {
        const change = p.change !== undefined ? p.change : (p.open > 0 ? ((p.price - p.open) / p.open) * 100 : 0);
        const isUp = change >= 0;
        return (
          <div key={p.symbol} className="flex items-center gap-2 min-w-fit">
            <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              {SYMBOL_LABELS[p.symbol as Symbol] || p.symbol}
            </span>
            <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>
              ${p.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span
              className={`text-xs font-mono ${
                isUp ? "text-green-400" : "text-red-400"
              }`}
            >
              {isUp ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          </div>
        );
      })}
      {prices.length === 0 && (
        <span className="text-gray-500 text-sm">Connecting to live feed...</span>
      )}
    </div>
  );
}
