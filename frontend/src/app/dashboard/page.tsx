"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import CandlestickChart from "@/components/CandlestickChart";
import RSIChart from "@/components/RSIChart";
import SymbolSelector from "@/components/SymbolSelector";
import IntervalSelector from "@/components/IntervalSelector";
import LiveTicker from "@/components/LiveTicker";
import AlertsFeed from "@/components/AlertsFeed";
import { Symbol, Interval, SYMBOL_LABELS } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const RANGE_MAP: Record<Interval, string> = {
  "1m": "-24h",
  "5m": "-7d",
  "15m": "-30d",
  "30m": "-90d",
  "1h": "-365d",
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [symbol, setSymbol] = useState<Symbol>("BTCUSDT");
  const [interval, setInterval] = useState<Interval>("1h");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const range = RANGE_MAP[interval];

  const { data: ohlcData } = useSWR(
    status === "authenticated"
      ? `/api/ohlc?symbol=${symbol}&interval=${interval}&from=${range}`
      : null,
    fetcher,
    { refreshInterval: interval === "1m" ? 5000 : 30000 }
  );

  const { data: rsiData } = useSWR(
    status === "authenticated" ? `/api/rsi?symbol=${symbol}&range=${range}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: smaData } = useSWR(
    status === "authenticated" ? `/api/sma?symbol=${symbol}&range=${range}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400">Loading...</span>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-600 px-6 py-3 flex justify-between items-center">
        <h1 className="text-lg font-bold text-white">Crypto Analytics</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{session?.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Live Ticker */}
      <LiveTicker />

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Chart Area */}
          <div className="flex-1 space-y-4">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">
                  {SYMBOL_LABELS[symbol]}{" "}
                  <span className="text-gray-400 font-normal text-base">
                    {symbol}
                  </span>
                </h2>
                <SymbolSelector selected={symbol} onChange={setSymbol} />
              </div>
              <IntervalSelector selected={interval} onChange={setInterval} />
            </div>

            {/* Candlestick Chart */}
            <div className="bg-dark-800 border border-dark-600 rounded-lg p-4">
              <div className="flex items-center gap-4 mb-2">
                <span className="text-sm text-gray-400">
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
            <div className="bg-dark-800 border border-dark-600 rounded-lg p-4">
              <span className="text-sm text-gray-400 mb-2 block">
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
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-4">
            {/* Stats */}
            {ohlcData && ohlcData.length > 0 && (
              <div className="bg-dark-800 border border-dark-600 rounded-lg p-4">
                <h3 className="text-white text-sm font-semibold mb-3">
                  Latest Candle
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-400 block">Open</span>
                    <span className="text-white font-mono">
                      ${ohlcData[ohlcData.length - 1].open?.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">High</span>
                    <span className="text-green-400 font-mono">
                      ${ohlcData[ohlcData.length - 1].high?.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Low</span>
                    <span className="text-red-400 font-mono">
                      ${ohlcData[ohlcData.length - 1].low?.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Close</span>
                    <span className="text-white font-mono">
                      ${ohlcData[ohlcData.length - 1].close?.toLocaleString()}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400 block">VWAP</span>
                    <span className="text-blue-400 font-mono">
                      ${ohlcData[ohlcData.length - 1].vwap?.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Alerts */}
            <AlertsFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
