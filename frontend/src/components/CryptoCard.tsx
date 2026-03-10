"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { CoinConfig, getCoinLogoUrl } from "@/lib/types";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function Sparkline({ data, isUp }: { data: number[]; isUp: boolean }) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 120;
    const h = 32;
    const pad = 1;
    return data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = pad + (1 - (v - min) / range) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data]);

  if (!path) return null;

  return (
    <svg
      viewBox="0 0 120 32"
      preserveAspectRatio="none"
      className="absolute bottom-0 left-0 w-full opacity-30 pointer-events-none"
      style={{ height: "40%" }}
    >
      <defs>
        <linearGradient id={`spark-${isUp ? "up" : "down"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isUp ? "#16c784" : "#ea3943"} stopOpacity="0.4" />
          <stop offset="100%" stopColor={isUp ? "#16c784" : "#ea3943"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L120,32 L0,32 Z`}
        fill={`url(#spark-${isUp ? "up" : "down"})`}
      />
      <path
        d={path}
        fill="none"
        stroke={isUp ? "#16c784" : "#ea3943"}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function formatCompact(n: number, sym = "$"): string {
  if (n >= 1e9) return `${sym}${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${sym}${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${sym}${(n / 1e3).toFixed(1)}K`;
  return `${sym}${n.toFixed(2)}`;
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
  currencySymbol?: string;
  compact?: boolean;
}

export default function CryptoCard({
  coin, price, change, index, onClick, onRemove, removable,
  onDragStart, onDragOver, onDragEnd, isDragOver, isDragging,
  currencySymbol = "$", compact = false,
}: CryptoCardProps) {
  const isUp = (change ?? 0) >= 0;
  const hasData = change !== undefined;
  const [imgError, setImgError] = useState(false);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [flipped, setFlipped] = useState(false);
  const prevPrice = useRef<number | undefined>(undefined);

  const { data: stats } = useSWR(
    flipped ? `/api/coin-stats?symbol=${coin.pair}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: sparklineData } = useSWR<number[]>(
    `/api/sparkline?symbol=${coin.pair}`,
    fetcher,
    { refreshInterval: 600000 }
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
    : "var(--card-tile)";

  const backBg = hasData
    ? isUp ? "var(--card-green)" : "var(--card-red)"
    : "var(--card-tile)";

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
        isDragOver ? "ring-2 ring-blue-500/60 rounded-2xl" : ""
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
            className={`relative overflow-hidden rounded-2xl flex flex-col items-center justify-center w-full h-full
                        transition-all duration-300 cursor-grab active:cursor-grabbing group
                        hover:scale-[1.02] hover:brightness-110 ${compact ? "p-2" : "p-4"}`}
            style={{
              backgroundColor: cardBg,
              border: "1px solid var(--card-tile-border)",
            }}
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
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center
                           text-gray-400 hover:text-white hover:bg-red-600/80 transition-all z-20 text-xs
                           opacity-0 group-hover:opacity-100"
                style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
              >
                x
              </div>
            )}

            {/* Drag handle */}
            <div className="absolute top-2 left-2 text-gray-600 z-20 opacity-0 group-hover:opacity-60 transition-opacity">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="8" cy="6" r="2" /><circle cx="16" cy="6" r="2" />
                <circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" />
                <circle cx="8" cy="18" r="2" /><circle cx="16" cy="18" r="2" />
              </svg>
            </div>

            {/* Flip button */}
            <div
              onClick={handleFlip}
              className="absolute bottom-2 right-2 w-6 h-6 rounded-full flex items-center justify-center
                         text-gray-400 hover:text-white hover:bg-blue-600/80 transition-all z-20
                         opacity-0 group-hover:opacity-100"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
              title="Flip for stats"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </div>

            {/* Coin logo */}
            <div className={`flex items-center justify-center ${
              compact
                ? "w-10 h-10 sm:w-12 sm:h-12 mb-1"
                : "w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 mb-3"
            }`}
                 style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))" }}>
              {!imgError ? (
                <img
                  src={getCoinLogoUrl(coin.ticker)}
                  alt={coin.ticker}
                  className="w-full h-full object-contain"
                  onError={() => setImgError(true)}
                  draggable={false}
                />
              ) : (
                <div className={`rounded-full flex items-center justify-center ${
                  compact ? "w-10 h-10" : "w-14 h-14 sm:w-16 sm:h-16"
                }`}
                     style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
                  <span className={`font-bold ${compact ? "text-sm" : "text-lg sm:text-xl"}`} style={{ color: "var(--text-primary)" }}>
                    {coin.ticker}
                  </span>
                </div>
              )}
            </div>

            {/* Coin name */}
            {!compact && (
              <div className="text-[10px] sm:text-xs tracking-widest uppercase font-medium"
                   style={{ color: "var(--text-muted)" }}>
                {coin.name}
              </div>
            )}

            {/* Ticker */}
            <div className={`font-bold ${compact ? "text-sm" : "text-base sm:text-lg"}`} style={{ color: "var(--text-primary)" }}>
              {coin.ticker}
            </div>

            {/* Price */}
            {price !== undefined && (
              <div className={`text-center z-[1] ${compact ? "mt-0.5" : "mt-2"}`}>
                <div className={`font-mono font-semibold transition-colors duration-300 ${
                  compact ? "text-sm" : "text-lg sm:text-xl md:text-2xl"
                } ${
                  flash === "up" ? "text-green-300" : flash === "down" ? "text-red-300" : ""
                }`}
                style={!flash ? { color: "var(--text-primary)" } : {}}>
                  {currencySymbol}{price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {change !== undefined && (
                  <div className={`inline-flex items-center gap-1 rounded-full font-mono font-bold ${
                    compact
                      ? "text-xs px-1.5 py-0 mt-0.5"
                      : "text-sm sm:text-base px-2.5 py-0.5 mt-1.5"
                  } ${
                    isUp ? "text-green-400" : "text-red-400"
                  }`}
                  style={{
                    backgroundColor: isUp ? "rgba(22, 199, 132, 0.15)" : "rgba(234, 57, 67, 0.15)",
                  }}>
                    <svg width={compact ? "10" : "12"} height={compact ? "10" : "12"} viewBox="0 0 12 12" fill="currentColor">
                      {isUp
                        ? <path d="M6 2L10.5 8.5H1.5L6 2Z"/>
                        : <path d="M6 10L1.5 3.5H10.5L6 10Z"/>
                      }
                    </svg>
                    <span>{isUp ? "+" : ""}{change.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Sparkline — 7-day trend */}
            {sparklineData && sparklineData.length > 1 && (
              <Sparkline data={sparklineData} isUp={isUp} />
            )}
          </button>
        </div>

        {/* === BACK (Stats) === */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            backgroundColor: backBg,
            border: "1px solid var(--card-tile-border)",
          }}
        >
          <div className="w-full h-full flex flex-col p-4 relative">
            {/* Flip back */}
            <div
              onClick={handleFlip}
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center
                         text-gray-400 hover:text-white hover:bg-blue-600/80 transition-all z-20 cursor-pointer"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </div>

            {/* View chart */}
            <div
              onClick={(e) => { e.stopPropagation(); onClick(coin.pair); }}
              className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center
                         text-gray-400 hover:text-white hover:bg-blue-600/80 transition-all z-20 cursor-pointer"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>

            {/* Header */}
            <div className="text-center mb-3 mt-2">
              <div className="font-bold text-base" style={{ color: "var(--text-primary)" }}>
                {coin.ticker}
              </div>
              <div className="text-[10px] tracking-wider uppercase" style={{ color: "var(--text-muted)" }}>
                24h Statistics
              </div>
            </div>

            {/* Stats */}
            {stats ? (
              <div className="flex-1 flex flex-col justify-center gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>High</span>
                  <span className="text-[10px] sm:text-xs font-mono text-green-400">
                    ${stats.high24h?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>Low</span>
                  <span className="text-[10px] sm:text-xs font-mono text-red-400">
                    ${stats.low24h?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>Volume</span>
                  <span className="text-[10px] sm:text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                    {formatCompact(stats.quoteVolume || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>VWAP</span>
                  <span className="text-[10px] sm:text-xs font-mono text-blue-400">
                    ${stats.weightedAvgPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] sm:text-xs" style={{ color: "var(--text-muted)" }}>Trades</span>
                  <span className="text-[10px] sm:text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                    {stats.trades?.toLocaleString()}
                  </span>
                </div>
                {/* Price range bar */}
                <div className="mt-1">
                  <div className="relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="absolute inset-y-0 rounded-full"
                      style={{
                        background: "linear-gradient(to right, #ea3943, #f5d100, #16c784)",
                        left: "0%", right: "0%",
                      }}
                    />
                    {stats.high24h > stats.low24h && price && (
                      <div
                        className="absolute top-[-2px] w-2.5 h-2.5 rounded-full border-2 border-white bg-gray-900"
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
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Loading...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
