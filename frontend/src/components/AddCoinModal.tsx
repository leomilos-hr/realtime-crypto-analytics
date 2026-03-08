"use client";

import { useState } from "react";
import { CoinConfig, COIN_CATALOG, getCoinLogoUrl } from "@/lib/types";

interface AddCoinModalProps {
  activeCoins: CoinConfig[];
  onAdd: (coin: CoinConfig) => void;
  onClose: () => void;
}

export default function AddCoinModal({ activeCoins, onAdd, onClose }: AddCoinModalProps) {
  const [search, setSearch] = useState("");
  const [customPair, setCustomPair] = useState("");

  const activePairs = new Set(activeCoins.map((c) => c.pair));

  const filtered = COIN_CATALOG.filter(
    (c) =>
      !activePairs.has(c.pair) &&
      (c.ticker.toLowerCase().includes(search.toLowerCase()) ||
        c.name.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAddCustom = () => {
    const pair = customPair.toUpperCase().trim();
    if (!pair) return;
    const fullPair = pair.endsWith("USDT") ? pair : pair + "USDT";
    const ticker = fullPair.replace("USDT", "");
    if (activePairs.has(fullPair)) return;
    onAdd({ pair: fullPair, ticker, name: ticker });
    setCustomPair("");
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5" style={{ borderBottom: "1px solid var(--border-color)" }}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Add Cryptocurrency</h2>
            <button
              onClick={onClose}
              className="transition-colors text-2xl leading-none hover:opacity-70"
              style={{ color: "var(--text-muted)" }}
            >
              x
            </button>
          </div>
          <input
            type="text"
            placeholder="Search coins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg placeholder-gray-500 focus:outline-none focus:border-blue-500"
            style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
          />
        </div>

        {/* Coin list */}
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.map((coin) => (
            <button
              key={coin.pair}
              onClick={() => {
                onAdd(coin);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left hover:opacity-80"
              style={{ backgroundColor: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-input)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <img
                src={getCoinLogoUrl(coin.ticker)}
                alt={coin.ticker}
                className="w-8 h-8 rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="flex-1">
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{coin.ticker}</span>
                <span className="text-sm ml-2" style={{ color: "var(--text-muted)" }}>{coin.name}</span>
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{coin.pair}</span>
            </button>
          ))}
          {filtered.length === 0 && search && (
            <div className="text-center py-6" style={{ color: "var(--text-muted)" }}>
              No coins found for &quot;{search}&quot;
            </div>
          )}
        </div>

        {/* Custom pair input */}
        <div className="p-4" style={{ borderTop: "1px solid var(--border-color)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            Or enter any Binance trading pair:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. PEPE or TRUMPUSDT"
              value={customPair}
              onChange={(e) => setCustomPair(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
              className="flex-1 px-3 py-2 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
            />
            <button
              onClick={handleAddCustom}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
                         hover:bg-blue-500 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
