"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import CandlestickChart from "@/components/CandlestickChart";
import RSIChart from "@/components/RSIChart";
import IntervalSelector from "@/components/IntervalSelector";
import LiveTicker from "@/components/LiveTicker";
import AlertsFeed from "@/components/AlertsFeed";
import CryptoCard from "@/components/CryptoCard";
import AddCoinModal from "@/components/AddCoinModal";
import NewsFeed from "@/components/NewsFeed";
import DepthChart from "@/components/DepthChart";
import DashboardGrid from "@/components/DashboardGrid";
import SettingsModal from "@/components/SettingsModal";
import { useBinanceKline } from "@/hooks/useBinanceKline";
import {
  Interval,
  INTERVALS,
  CoinConfig,
  DEFAULT_COINS,
  SYMBOL_LABELS,
  Symbol,
} from "@/lib/types";
import { useTheme } from "@/lib/theme";
import type { SettingsChangePayload } from "@/components/SettingsModal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const RANGE_MAP: Record<Interval, string> = {
  "1s": "-1h",
  "5s": "-1h",
  "1m": "-24h",
  "5m": "-7d",
  "15m": "-30d",
  "30m": "-90d",
  "1h": "-365d",
  "4h": "-90d",
  "1d": "-365d",
  "1w": "-730d",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
};

// Save coins to server (debounced)
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveCoinsToServer(coins: CoinConfig[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch("/api/user-coins", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(coins),
    }).catch(() => {});
  }, 500);
}

interface PriceData {
  symbol: string;
  price: number;
  open: number;
  change?: number;
}

interface PriceAlert {
  id: string;
  coin: string;
  ticker: string;
  condition: "above" | "below";
  price: number;
  triggered?: boolean;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme, toggle: toggleTheme, setTheme } = useTheme();
  const [coins, setCoins] = useState<CoinConfig[]>(DEFAULT_COINS);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>("1h");
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [chartStyle, setChartStyle] = useState<"candle" | "line">("candle");
  const [compactMode, setCompactMode] = useState(false);
  const [numberFormat, setNumberFormat] = useState<{ decimals: string; grouping: string }>({ decimals: "auto", grouping: "comma" });
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const triggeredAlerts = useRef<Set<string>>(new Set());

  // Load coins, settings, exchange rates, and alerts on mount
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/user-coins")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setCoins(data);
      })
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data?.settings?.defaultInterval && INTERVALS.includes(data.settings.defaultInterval)) {
          setInterval(data.settings.defaultInterval as Interval);
        }
        if (data?.settings?.currency) setCurrency(data.settings.currency);
        if (data?.settings?.chartStyle) setChartStyle(data.settings.chartStyle as "candle" | "line");
        if (data?.settings?.theme) setTheme(data.settings.theme as "dark" | "light");
        if (data?.settings?.compactMode !== undefined) setCompactMode(data.settings.compactMode);
        if (data?.settings?.numberFormat) setNumberFormat(data.settings.numberFormat);
        if (data?.settings?.notifications !== undefined) setNotificationsEnabled(data.settings.notifications);
      })
      .catch(() => {});
    fetch("/api/price-alerts")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPriceAlerts(data);
      })
      .catch(() => {});
  }, [status]);

  // Fetch exchange rates when currency changes
  useEffect(() => {
    if (currency === "USD") {
      setExchangeRate(1);
      return;
    }
    fetch("/api/exchange-rates")
      .then((r) => r.json())
      .then((rates) => {
        if (rates[currency]) setExchangeRate(rates[currency]);
      })
      .catch(() => {});
  }, [currency]);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUserMenu]);

  // Check price alerts against live prices
  const checkAlerts = useCallback(
    (currentPrices: PriceData[]) => {
      if (priceAlerts.length === 0) return;
      for (const alert of priceAlerts) {
        if (triggeredAlerts.current.has(alert.id)) continue;
        const priceData = currentPrices.find((p) => p.symbol === alert.coin);
        if (!priceData) continue;
        const triggered =
          (alert.condition === "above" && priceData.price >= alert.price) ||
          (alert.condition === "below" && priceData.price <= alert.price);
        if (triggered) {
          triggeredAlerts.current.add(alert.id);
          if (!notificationsEnabled) continue;
          const dir = alert.condition === "above" ? "above" : "below";
          const msg = `${alert.ticker} is now ${dir} $${alert.price.toLocaleString()} (current: $${priceData.price.toLocaleString()})`;
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`Price Alert: ${alert.ticker}`, {
              body: msg,
              icon: "/favicon.ico",
            });
          }
        }
      }
    },
    [priceAlerts, notificationsEnabled]
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // Dynamic browser tab title with live price
  useEffect(() => {
    if (prices.length === 0) return;
    if (selectedPair) {
      const p = prices.find((x) => x.symbol === selectedPair);
      if (p) {
        const coin = coins.find((c) => c.pair === selectedPair);
        const ticker = coin?.ticker || selectedPair.replace("USDT", "");
        const change = p.change !== undefined ? p.change : (p.open > 0 ? ((p.price - p.open) / p.open) * 100 : 0);
        const arrow = change >= 0 ? "\u25B2" : "\u25BC";
        document.title = `${ticker} $${p.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${arrow}${Math.abs(change).toFixed(1)}% | CryptoAnalytics`;
      }
    } else {
      const btc = prices.find((x) => x.symbol === "BTCUSDT");
      if (btc) {
        document.title = `BTC $${btc.price.toLocaleString(undefined, { maximumFractionDigits: 0 })} | CryptoAnalytics`;
      } else {
        document.title = "CryptoAnalytics";
      }
    }
  }, [prices, selectedPair, coins]);

  // SSE for live prices
  useEffect(() => {
    if (status !== "authenticated") return;
    const eventSource = new EventSource("/api/live");
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setPrices(data);
        checkAlerts(data);
      } catch {}
    };
    return () => eventSource.close();
  }, [status, checkAlerts]);

  const range = RANGE_MAP[interval];

  // Live OHLC data via Binance WebSocket (REST for history, WS for real-time updates)
  const { data: ohlcData } = useBinanceKline(
    selectedPair && status === "authenticated" ? selectedPair : null,
    interval
  );

  const { data: rsiData } = useSWR(
    selectedPair && status === "authenticated"
      ? `/api/rsi?symbol=${selectedPair}&range=${range}`
      : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: smaData } = useSWR(
    selectedPair && status === "authenticated"
      ? `/api/sma?symbol=${selectedPair}&range=${range}`
      : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const handleAddCoin = (coin: CoinConfig) => {
    const updated = [...coins, coin];
    setCoins(updated);
    saveCoinsToServer(updated);
  };

  const handleRemoveCoin = (pair: string) => {
    const updated = coins.filter((c) => c.pair !== pair);
    if (updated.length === 0) return;
    setCoins(updated);
    saveCoinsToServer(updated);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const updated = [...coins];
      const [dragged] = updated.splice(dragIndex, 1);
      updated.splice(dragOverIndex, 0, dragged);
      setCoins(updated);
      saveCoinsToServer(updated);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Format price with current currency and number format
  const fmtPrice = (usdPrice: number) => {
    const converted = usdPrice * exchangeRate;
    const sym = CURRENCY_SYMBOLS[currency] || "$";
    let dec = 2;
    if (numberFormat.decimals === "auto") {
      if (converted < 0.01) dec = 8;
      else if (converted < 1) dec = 4;
      else dec = 2;
    } else {
      dec = parseInt(numberFormat.decimals, 10);
    }
    let formatted: string;
    if (numberFormat.grouping === "period") {
      formatted = converted.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    } else if (numberFormat.grouping === "space") {
      formatted = converted.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    } else if (numberFormat.grouping === "none") {
      formatted = converted.toFixed(dec);
    } else {
      formatted = converted.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }
    return `${sym}${formatted}`;
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
    const change = p.change !== undefined ? p.change : (p.open > 0 ? ((p.price - p.open) / p.open) * 100 : 0);
    return { price: p.price * exchangeRate, change };
  };

  const selectedCoin = coins.find((c) => c.pair === selectedPair);
  const selectedLabel = selectedCoin?.name || SYMBOL_LABELS[selectedPair as Symbol] || selectedPair;
  const currSym = CURRENCY_SYMBOLS[currency] || "$";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header
        className="px-4 sm:px-6 h-14 flex items-center justify-between shrink-0 relative z-50"
        style={{
          backgroundColor: "var(--bg-card)",
          borderBottom: "1px solid var(--border-color)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Left — Logo + back */}
        <div className="flex items-center gap-3">
          {selectedPair ? (
            <button
              onClick={() => setSelectedPair(null)}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:brightness-125"
              style={{ backgroundColor: "var(--bg-input)", color: "var(--text-muted)" }}
              title="Back to overview"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : null}
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            onClick={() => setSelectedPair(null)}
          >
            {/* Logo icon */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight hidden sm:block" style={{ color: "var(--text-primary)" }}>
              CryptoAnalytics
            </span>
          </div>
        </div>

        {/* Right — Avatar with dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all hover:brightness-110"
            style={{ backgroundColor: showUserMenu ? "var(--bg-input)" : "transparent" }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold uppercase shrink-0"
              style={{
                background: "linear-gradient(135deg, #6366f1, #ec4899)",
                color: "white",
              }}
            >
              {(session?.user?.name || session?.user?.email || "?").charAt(0)}
            </div>
            <span className="text-xs font-medium hidden sm:block max-w-[120px] truncate" style={{ color: "var(--text-primary)" }}>
              {session?.user?.name || session?.user?.email}
            </span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              className={`hidden sm:block transition-transform duration-200 ${showUserMenu ? "rotate-180" : ""}`}
              style={{ color: "var(--text-muted)" }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {/* Dropdown menu */}
          {showUserMenu && (
            <div
              className="absolute right-0 top-full mt-1.5 w-56 rounded-xl shadow-2xl py-1.5 z-[100]"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border-color)",
              }}
            >
              {/* User info */}
              <div className="px-3.5 py-2.5 mb-1" style={{ borderBottom: "1px solid var(--border-color)" }}>
                <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {session?.user?.name || "User"}
                </div>
                <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {session?.user?.email}
                </div>
              </div>

              {/* Theme toggle */}
              <button
                onClick={() => { toggleTheme(); setShowUserMenu(false); }}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-left text-sm transition-colors hover:brightness-110"
                style={{ color: "var(--text-primary)" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-input)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                {theme === "dark" ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
                <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
              </button>

              {/* Settings */}
              <button
                onClick={() => { setShowSettings(true); setShowUserMenu(false); }}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-left text-sm transition-colors"
                style={{ color: "var(--text-primary)" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-input)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span>Settings</span>
              </button>

              {/* Divider */}
              <div className="my-1.5" style={{ borderTop: "1px solid var(--border-color)" }} />

              {/* Sign out */}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-left text-sm transition-colors"
                style={{ color: "#ef4444" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-input)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Card Grid View */}
      {!selectedPair && (
        <main key="grid-view" className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 view-enter"
              style={{ background: "var(--bg-main)" }}>
          <div className={`flex-1 grid auto-rows-fr ${
            compactMode
              ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3"
              : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6"
          }`}>
              {coins.map((coin, i) => (
                <div key={coin.pair} className="card-enter" style={{ animationDelay: `${i * 0.04}s` }}>
                  <CryptoCard
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
                    currencySymbol={currSym}
                    compact={compactMode}
                    {...getPriceInfo(coin.pair)}
                  />
                </div>
              ))}
              {/* Add Coin Card */}
              <button
                onClick={() => setShowAddModal(true)}
                className="rounded-2xl border border-dashed flex flex-col items-center justify-center gap-3
                           transition-all duration-300 cursor-pointer"
                style={{
                  borderColor: "var(--card-tile-border)",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--card-tile)";
                  e.currentTarget.style.borderColor = "var(--text-muted)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.borderColor = "var(--card-tile-border)";
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
                  <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="text-xs font-medium tracking-wider uppercase" style={{ color: "var(--text-muted)", opacity: 0.5 }}>Add Coin</span>
              </button>
          </div>

          {/* Bottom widgets — customizable grid */}
          <DashboardGrid />
        </main>
      )}

      {/* Detail View */}
      {selectedPair && (
        <div key={`detail-${selectedPair}`} className="detail-enter">
          <LiveTicker currency={currency} exchangeRate={exchangeRate} />

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
                  <div className="flex items-center gap-2">
                    {/* Chart style toggle */}
                    <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-color)" }}>
                      <button
                        onClick={() => setChartStyle("candle")}
                        className="px-2.5 py-1.5 transition-colors"
                        style={{
                          backgroundColor: chartStyle === "candle" ? "var(--bg-input)" : "transparent",
                          color: chartStyle === "candle" ? "var(--text-primary)" : "var(--text-muted)",
                        }}
                        title="Candlestick"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="9" y1="2" x2="9" y2="22"/><rect x="5" y="7" width="8" height="10" rx="1" fill="currentColor" opacity="0.3"/>
                          <line x1="18" y1="4" x2="18" y2="20"/><rect x="14" y="9" width="8" height="6" rx="1" fill="currentColor" opacity="0.3"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => setChartStyle("line")}
                        className="px-2.5 py-1.5 transition-colors"
                        style={{
                          backgroundColor: chartStyle === "line" ? "var(--bg-input)" : "transparent",
                          color: chartStyle === "line" ? "var(--text-primary)" : "var(--text-muted)",
                        }}
                        title="Line"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 8 13 13 9 9 2 16"/>
                        </svg>
                      </button>
                    </div>
                    <IntervalSelector selected={interval} onChange={setInterval} />
                  </div>
                </div>

                {/* Chart */}
                <div className="rounded-lg p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {chartStyle === "candle" ? "OHLC" : "Price"} + Volume ({interval})
                    </span>
                    {chartStyle === "candle" && (
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
                    )}
                  </div>
                  {ohlcData && ohlcData.length > 0 ? (
                    <CandlestickChart data={ohlcData} smaData={smaData} chartStyle={chartStyle} />
                  ) : (
                    <div className="h-[500px] flex items-center justify-center text-gray-500">
                      {ohlcData ? "No data available" : "Loading chart..."}
                    </div>
                  )}
                </div>

                {/* RSI Chart (only for pipeline intervals) */}
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
                          {fmtPrice(ohlcData[ohlcData.length - 1].open)}
                        </span>
                      </div>
                      <div>
                        <span className="block" style={{ color: "var(--text-muted)" }}>High</span>
                        <span className="text-green-400 font-mono">
                          {fmtPrice(ohlcData[ohlcData.length - 1].high)}
                        </span>
                      </div>
                      <div>
                        <span className="block" style={{ color: "var(--text-muted)" }}>Low</span>
                        <span className="text-red-400 font-mono">
                          {fmtPrice(ohlcData[ohlcData.length - 1].low)}
                        </span>
                      </div>
                      <div>
                        <span className="block" style={{ color: "var(--text-muted)" }}>Close</span>
                        <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                          {fmtPrice(ohlcData[ohlcData.length - 1].close)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="block" style={{ color: "var(--text-muted)" }}>Volume</span>
                        <span className="text-blue-400 font-mono">
                          {ohlcData[ohlcData.length - 1].volume.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <AlertsFeed />
                <NewsFeed />
              </div>
            </div>
          </main>
        </div>
      )}

      {/* Add Coin Modal */}
      {showAddModal && (
        <AddCoinModal
          activeCoins={coins}
          onAdd={handleAddCoin}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          currentTheme={theme}
          onSettingsChange={(s: SettingsChangePayload) => {
            if (s.defaultInterval) setInterval(s.defaultInterval);
            if (s.currency) setCurrency(s.currency);
            if (s.chartStyle) setChartStyle(s.chartStyle);
            if (s.theme) setTheme(s.theme);
            if (s.compactMode !== undefined) setCompactMode(s.compactMode);
            if (s.numberFormat) setNumberFormat(s.numberFormat);
            if (s.notifications !== undefined) setNotificationsEnabled(s.notifications);
          }}
        />
      )}
    </div>
  );
}
