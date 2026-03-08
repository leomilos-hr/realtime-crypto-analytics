"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import useSWR from "swr";
import CandlestickChart from "@/components/CandlestickChart";
import RSIChart from "@/components/RSIChart";
import IntervalSelector from "@/components/IntervalSelector";
import LiveTicker from "@/components/LiveTicker";
import AlertsFeed from "@/components/AlertsFeed";
import CryptoCard from "@/components/CryptoCard";
import AddCoinModal from "@/components/AddCoinModal";
import NewsFeed from "@/components/NewsFeed";
import FearGreedGauge from "@/components/FearGreedGauge";
import DepthChart from "@/components/DepthChart";
import {
  Interval,
  CoinConfig,
  DEFAULT_COINS,
  SYMBOL_LABELS,
  SYMBOL_TICKERS,
  Symbol,
} from "@/lib/types";
import { useTheme } from "@/lib/theme";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const RANGE_MAP: Record<Interval, string> = {
  "1m": "-24h",
  "5m": "-7d",
  "15m": "-30d",
  "30m": "-90d",
  "1h": "-365d",
};

const STORAGE_KEY = "crypto-dashboard-coins";

function loadCoins(): CoinConfig[] {
  if (typeof window === "undefined") return DEFAULT_COINS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_COINS;
}

function saveCoins(coins: CoinConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(coins));
  } catch {}
}

interface PriceData {
  symbol: string;
  price: number;
  open: number;
  change?: number;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const [coins, setCoins] = useState<CoinConfig[]>(DEFAULT_COINS);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>("1h");
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Load coins from localStorage on mount
  useEffect(() => {
    setCoins(loadCoins());
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // SSE for live prices
  useEffect(() => {
    if (status !== "authenticated") return;
    const eventSource = new EventSource("/api/live");
    eventSource.onmessage = (event) => {
      try {
        setPrices(JSON.parse(event.data));
      } catch {}
    };
    return () => eventSource.close();
  }, [status]);

  const range = RANGE_MAP[interval];

  const { data: ohlcData } = useSWR(
    selectedPair && status === "authenticated"
      ? `/api/ohlc?symbol=${selectedPair}&interval=${interval}&from=${range}`
      : null,
    fetcher,
    { refreshInterval: interval === "1m" ? 5000 : 30000 }
  );

  const { data: rsiData } = useSWR(
    selectedPair && status === "authenticated"
      ? `/api/rsi?symbol=${selectedPair}&range=${range}`
      : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: smaData } = useSWR(
    selectedPair && status === "authenticated"
      ? `/api/sma?symbol=${selectedPair}&range=${range}`
      : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const handleAddCoin = (coin: CoinConfig) => {
    const updated = [...coins, coin];
    setCoins(updated);
    saveCoins(updated);
  };

  const handleRemoveCoin = (pair: string) => {
    const updated = coins.filter((c) => c.pair !== pair);
    if (updated.length === 0) return;
    setCoins(updated);
    saveCoins(updated);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const updated = [...coins];
      const [dragged] = updated.splice(dragIndex, 1);
      updated.splice(dragOverIndex, 0, dragged);
      setCoins(updated);
      saveCoins(updated);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400">Loading...</span>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  const getPriceInfo = (pair: string) => {
    const p = prices.find((x) => x.symbol === pair);
    if (!p) return {};
    // Use pre-calculated 24h change from Binance, fallback to manual calc
    const change = p.change !== undefined ? p.change : (p.open > 0 ? ((p.price - p.open) / p.open) * 100 : 0);
    return { price: p.price, change };
  };

  const selectedCoin = coins.find((c) => c.pair === selectedPair);
  const selectedLabel = selectedCoin?.name || SYMBOL_LABELS[selectedPair as Symbol] || selectedPair;
  const selectedTicker = selectedCoin?.ticker || SYMBOL_TICKERS[selectedPair as Symbol] || selectedPair;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-3 flex justify-between items-center"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)" }}>
        <div className="flex items-center gap-4">
          {selectedPair ? (
            <button
              onClick={() => setSelectedPair(null)}
              className="transition-colors mr-2"
              style={{ color: "var(--text-muted)" }}
              title="Back to overview"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : null}
          <h1
            className="text-lg font-bold cursor-pointer"
            style={{ color: "var(--text-primary)" }}
            onClick={() => setSelectedPair(null)}
          >
            Crypto Analytics
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg transition-colors hover:opacity-80"
            style={{ backgroundColor: "var(--bg-input)", color: "var(--text-muted)" }}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>{session?.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm transition-colors hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Card Grid View */}
      {!selectedPair && (
        <main className="flex-1 flex flex-col p-3 sm:p-4 lg:p-5"
              style={{ background: "var(--bg-main)" }}>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-fr">
              {coins.map((coin, i) => (
                <CryptoCard
                  key={coin.pair}
                  coin={coin}
                  index={i}
                  onClick={(pair) => setSelectedPair(pair)}
                  onRemove={handleRemoveCoin}
                  removable={coins.length > 1}
                  onDragStart={setDragIndex}
                  onDragOver={setDragOverIndex}
                  onDragEnd={handleDragEnd}
                  isDragging={dragIndex === i}
                  isDragOver={dragOverIndex === i && dragIndex !== i}
                  {...getPriceInfo(coin.pair)}
                />
              ))}
              {/* Add Coin Card */}
              <button
                onClick={() => setShowAddModal(true)}
                className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2
                           hover:opacity-80 transition-all duration-200 cursor-pointer"
                style={{ borderColor: "var(--add-border)" }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-muted)" }}>
                  <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Add Coin</span>
              </button>
          </div>

          {/* Bottom widgets */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3">
              <NewsFeed />
            </div>
            <div>
              <FearGreedGauge />
            </div>
          </div>
        </main>
      )}

      {/* Detail View */}
      {selectedPair && (
        <>
          <LiveTicker />

          <main className="flex-1 p-4 lg:p-6">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Chart Area */}
              <div className="flex-1 space-y-4">
                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                      {selectedLabel}{" "}
                      <span className="font-normal text-base" style={{ color: "var(--text-muted)" }}>
                        {selectedPair}
                      </span>
                    </h2>
                    {/* Symbol quick-switch buttons */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {coins.map((c) => (
                        <button
                          key={c.pair}
                          onClick={() => setSelectedPair(c.pair)}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            c.pair === selectedPair
                              ? "bg-blue-600 text-white"
                              : ""
                          }`}
                          style={c.pair !== selectedPair ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
                        >
                          {c.ticker}
                        </button>
                      ))}
                    </div>
                  </div>
                  <IntervalSelector selected={interval} onChange={setInterval} />
                </div>

                {/* Candlestick Chart */}
                <div className="rounded-lg p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                      OHLC + Volume ({interval})
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-0.5 bg-blue-500 inline-block"></span>
                        SMA 7
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-0.5 bg-yellow-500 inline-block"></span>
                        SMA 14
                      </span>
                    </div>
                  </div>
                  {ohlcData && ohlcData.length > 0 ? (
                    <CandlestickChart data={ohlcData} smaData={smaData} />
                  ) : (
                    <div className="h-[500px] flex items-center justify-center text-gray-500">
                      {ohlcData ? "No data available" : "Loading chart..."}
                    </div>
                  )}
                </div>

                {/* RSI Chart */}
                <div className="rounded-lg p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                  <span className="text-sm mb-2 block" style={{ color: "var(--text-muted)" }}>
                    RSI (14)
                  </span>
                  {rsiData && rsiData.length > 0 ? (
                    <RSIChart data={rsiData} />
                  ) : (
                    <div className="h-[150px] flex items-center justify-center text-gray-500">
                      {rsiData ? "No RSI data" : "Loading..."}
                    </div>
                  )}
                </div>

                {/* Depth Chart */}
                <DepthChart symbol={selectedPair} />
              </div>

              {/* Sidebar */}
              <div className="w-full lg:w-80 space-y-4">
                {ohlcData && ohlcData.length > 0 && (
                  <div className="rounded-lg p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                    <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                      Latest Candle
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="block" style={{ color: "var(--text-muted)" }}>Open</span>
                        <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                          ${ohlcData[ohlcData.length - 1].open?.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="block" style={{ color: "var(--text-muted)" }}>High</span>
                        <span className="text-green-400 font-mono">
                          ${ohlcData[ohlcData.length - 1].high?.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="block" style={{ color: "var(--text-muted)" }}>Low</span>
                        <span className="text-red-400 font-mono">
                          ${ohlcData[ohlcData.length - 1].low?.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="block" style={{ color: "var(--text-muted)" }}>Close</span>
                        <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                          ${ohlcData[ohlcData.length - 1].close?.toLocaleString()}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="block" style={{ color: "var(--text-muted)" }}>VWAP</span>
                        <span className="text-blue-400 font-mono">
                          ${ohlcData[ohlcData.length - 1].vwap?.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <AlertsFeed />
                <NewsFeed currency={selectedTicker || undefined} />
              </div>
            </div>
          </main>
        </>
      )}

      {/* Add Coin Modal */}
      {showAddModal && (
        <AddCoinModal
          activeCoins={coins}
          onAdd={handleAddCoin}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
