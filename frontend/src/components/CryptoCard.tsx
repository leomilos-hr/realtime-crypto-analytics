"use client";

import { useState, useEffect, useRef } from "react";
import { CoinConfig, getCoinLogoUrl } from "@/lib/types";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

interface CryptoCardProps {
  coin: CoinConfig;
  price?: number;
  change?: number;
  index: number;
  onClick: (pair: string) => void;
  onRemove?: (pair: string) => void;
  removable?: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  isDragging: boolean;
}

export default function CryptoCard({
  coin, price, change, index, onClick, onRemove, removable,
  onDragStart, onDragOver, onDragEnd, isDragOver, isDragging,
}: CryptoCardProps) {
  const isUp = (change ?? 0) >= 0;
  const hasData = change !== undefined;
  const [imgError, setImgError] = useState(false);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [flipped, setFlipped] = useState(false);
  const prevPrice = useRef<number | undefined>(undefined);

  // Fetch stats only when flipped
  const { data: stats } = useSWR(
    flipped ? `/api/coin-stats?symbol=${coin.pair}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  useEffect(() => {
    if (price === undefined || prevPrice.current === undefined) {
      prevPrice.current = price;
      return;
    }
    if (price !== prevPrice.current) {
      setFlash(price > prevPrice.current ? "up" : "down");
      prevPrice.current = price;
      const timer = setTimeout(() => setFlash(null), 700);
      return () => clearTimeout(timer);
    }
  }, [price]);

  const handleFlip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFlipped((f) => !f);
  };

  const cardBg = hasData
    ? isUp ? "var(--card-green)" : "var(--card-red)"
    : "var(--card-neutral)";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(index);
      }}
      onDragEnd={onDragEnd}
      className={`transition-all duration-150 ${isDragging ? "opacity-40 scale-95" : ""} ${
        isDragOver ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-[#0d0f1a] rounded-2xl" : ""
      }`}
      style={{ perspective: "1000px" }}
    >
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* === FRONT === */}
        <div
          className="relative w-full h-full rounded-2xl"
          style={{ backfaceVisibility: "hidden" }}
        >
          <button
            onClick={() => onClick(coin.pair)}
            className="relative overflow-hidden rounded-2xl flex flex-col items-center justify-center w-full h-full
                        transition-all duration-200 hover:scale-[1.02] hover:brightness-110 cursor-grab active:cursor-grabbing"
            style={{ backgroundColor: cardBg }}
          >
            {/* Flash overlay */}
            {flash && (
              <div
                className={`absolute inset-0 z-10 pointer-events-none ${
                  flash === "up" ? "bg-green-400" : "bg-red-400"
                }`}
                style={{ animation: "flash-fade 0.7s ease-out forwards" }}
              />
            )}

            {/* Remove button */}
            {removable && onRemove && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(coin.pair);
                }}
                className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center
                           text-gray-400 hover:text-white hover:bg-red-600/80 transition-colors z-20 text-sm font-medium"
              >
                x
              </div>
            )}

            {/* Drag handle */}
            <div className="absolute top-2.5 left-2.5 text-gray-600 z-20">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="8" cy="6" r="2" /><circle cx="16" cy="6" r="2" />
                <circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" />
                <circle cx="8" cy="18" r="2" /><circle cx="16" cy="18" r="2" />
              </svg>
            </div>

            {/* Flip button */}
            <div
              onClick={handleFlip}
              className="absolute bottom-2.5 right-2.5 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center
                         text-gray-400 hover:text-white hover:bg-blue-600/80 transition-colors z-20"
              title="Flip for stats"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </div>

            {/* Coin logo */}
            <div className="w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 flex items-center justify-center mb-3">
              {!imgError ? (
                <img
                  src={getCoinLogoUrl(coin.ticker)}
                  alt={coin.ticker}
                  className="w-full h-full object-contain drop-shadow-lg"
                  onError={() => setImgError(true)}
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-white/10 flex items-center justify-center">
                  <span className="text-white font-bold text-2xl md:text-3xl">
                    {coin.ticker}
                  </span>
                </div>
              )}
            </div>

            {/* Ticker + Name */}
            <div className="text-xs tracking-wide uppercase mb-0.5" style={{ color: "var(--text-muted)" }}>
              {coin.name}
            </div>
            <div className="font-bold text-base md:text-lg" style={{ color: "var(--text-primary)" }}>
              {coin.ticker}
            </div>

            {/* Price + Change */}
            {price !== undefined && (
              <div className="mt-1.5 text-center">
                <div className={`font-mono text-xs md:text-sm transition-colors duration-300 ${
                  flash === "up" ? "text-green-300" : flash === "down" ? "text-red-300" : ""
                }`}
                style={!flash ? { color: "var(--text-secondary)" } : {}}>
                  ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {change !== undefined && (
                  <div
                    className={`text-xs font-mono font-semibold ${
                      isUp ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {isUp ? "+" : ""}
                    {change.toFixed(2)}%
                  </div>
                )}
              </div>
            )}
          </button>
        </div>

        {/* === BACK (Stats) === */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            backgroundColor: cardBg,
          }}
        >
          <div className="w-full h-full flex flex-col p-4 relative">
            {/* Flip back button */}
            <div
              onClick={handleFlip}
              className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center
                         text-gray-400 hover:text-white hover:bg-blue-600/80 transition-colors z-20 cursor-pointer"
              title="Flip back"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </div>

            {/* View chart button */}
            <div
              onClick={(e) => { e.stopPropagation(); onClick(coin.pair); }}
              className="absolute top-2.5 left-2.5 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center
                         text-gray-400 hover:text-white hover:bg-blue-600/80 transition-colors z-20 cursor-pointer"
              title="View chart"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>

            {/* Header */}
            <div className="text-center mb-3 mt-2">
              <div className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
                {coin.ticker}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                24h Statistics
              </div>
            </div>

            {/* Stats grid */}
            {stats ? (
              <div className="flex-1 flex flex-col justify-center gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>24h High</span>
                  <span className="text-xs font-mono text-green-400">
                    ${stats.high24h?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>24h Low</span>
                  <span className="text-xs font-mono text-red-400">
                    ${stats.low24h?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Volume</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                    {stats.volume?.toLocaleString(undefined, { maximumFractionDigits: 0 })} {coin.ticker}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Vol (USDT)</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                    {formatCompact(stats.quoteVolume || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>VWAP</span>
                  <span className="text-xs font-mono text-blue-400">
                    ${stats.weightedAvgPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Trades</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                    {stats.trades?.toLocaleString()}
                  </span>
                </div>

                {/* Price range bar */}
                <div className="mt-1">
                  <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                    <span>Low</span>
                    <span>High</span>
                  </div>
                  <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-input)" }}>
                    <div
                      className="absolute inset-y-0 rounded-full"
                      style={{
                        background: "linear-gradient(to right, #ea3943, #f5d100, #16c784)",
                        left: "0%",
                        right: "0%",
                      }}
                    />
                    {stats.high24h > stats.low24h && price && (
                      <div
                        className="absolute top-[-2px] w-3 h-3 rounded-full border-2 border-white bg-gray-900"
                        style={{
                          left: `${Math.min(100, Math.max(0, ((price - stats.low24h) / (stats.high24h - stats.low24h)) * 100))}%`,
                          transform: "translateX(-50%)",
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Loading stats...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
