"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { subscribe } from "@/lib/ws-manager";

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT", "ADAUSDT"];
const COIN_LABELS: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
  DOGEUSDT: "DOGE",
  ADAUSDT: "ADA",
};

const ROUND_DURATION = 30; // seconds

const STORAGE_KEY = "price-predictor-stats";

interface Stats {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
}

const EMPTY_STATS: Stats = { wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 };

function loadStats(): Stats {
  if (typeof window === "undefined") return EMPTY_STATS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return EMPTY_STATS;
}

function saveStats(stats: Stats) {
  // Save to localStorage (instant) and sync to server (async)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {}
  fetch("/api/game-stats", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stats),
  }).catch(() => {});
}

export default function PricePredictor() {
  const [coin, setCoin] = useState("BTCUSDT");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "waiting" | "result">("idle");
  const [prediction, setPrediction] = useState<"up" | "down" | null>(null);
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(ROUND_DURATION);
  const [result, setResult] = useState<"win" | "loss" | "draw" | null>(null);
  const [stats, setStats] = useState<Stats>(loadStats);
  const [pricePath, setPricePath] = useState<number[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load stats from server on mount (merge with localStorage — take highest values)
  useEffect(() => {
    fetch("/api/game-stats")
      .then((r) => r.json())
      .then((serverStats: Stats) => {
        if (!serverStats || (!serverStats.wins && !serverStats.losses && !serverStats.draws)) return;
        setStats((local) => {
          const merged: Stats = {
            wins: Math.max(local.wins, serverStats.wins || 0),
            losses: Math.max(local.losses, serverStats.losses || 0),
            draws: Math.max(local.draws, serverStats.draws || 0),
            streak: Math.max(local.streak, serverStats.streak || 0),
            bestStreak: Math.max(local.bestStreak, serverStats.bestStreak || 0),
          };
          // If server had more data, persist the merge
          if (JSON.stringify(merged) !== JSON.stringify(local)) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
          }
          return merged;
        });
      })
      .catch(() => {});
  }, []);

  // Live price via shared WebSocket manager
  useEffect(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    setPricePath([]);
    setLivePrice(null);

    const stream = `${coin.toLowerCase()}@trade`;
    unsubRef.current = subscribe(stream, (raw) => {
      try {
        const msg = JSON.parse(raw);
        const price = parseFloat(msg.p);
        setLivePrice(price);
        setPricePath((prev) => {
          const next = [...prev, price];
          return next.length > 60 ? next.slice(-60) : next;
        });
      } catch {}
    });

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [coin]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "waiting") return;

    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          // Round over
          clearInterval(timerRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Resolve round when countdown hits 0
  useEffect(() => {
    if (phase !== "waiting" || countdown > 0 || livePrice === null || entryPrice === null) return;

    const exitPrice = livePrice;
    let roundResult: "win" | "loss" | "draw";

    if (exitPrice === entryPrice) {
      roundResult = "draw";
    } else if (
      (prediction === "up" && exitPrice > entryPrice) ||
      (prediction === "down" && exitPrice < entryPrice)
    ) {
      roundResult = "win";
    } else {
      roundResult = "loss";
    }

    setResult(roundResult);
    setPhase("result");

    if (roundResult === "win") {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);
    }

    setStats((prev) => {
      const next = { ...prev };
      if (roundResult === "win") {
        next.wins++;
        next.streak++;
        next.bestStreak = Math.max(next.bestStreak, next.streak);
      } else if (roundResult === "loss") {
        next.losses++;
        next.streak = 0;
      } else {
        next.draws++;
      }
      saveStats(next);
      return next;
    });
  }, [countdown, phase, livePrice, entryPrice, prediction]);

  const startRound = useCallback(
    (direction: "up" | "down") => {
      if (livePrice === null) return;
      setPrediction(direction);
      setEntryPrice(livePrice);
      setCountdown(ROUND_DURATION);
      setResult(null);
      setPricePath([livePrice]);
      setPhase("waiting");
    },
    [livePrice]
  );

  const resetRound = () => {
    setPhase("idle");
    setPrediction(null);
    setEntryPrice(null);
    setResult(null);
  };

  const totalGames = stats.wins + stats.losses + stats.draws;
  const winRate = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(1) : "0.0";

  // Mini SVG line chart for the price path during a round
  const miniChart = () => {
    if (pricePath.length < 2) return null;
    const min = Math.min(...pricePath);
    const max = Math.max(...pricePath);
    const range = max - min || 1;
    const w = 280;
    const h = 60;

    const path = pricePath
      .map((v, i) => {
        const x = (i / (pricePath.length - 1)) * w;
        const y = 4 + (1 - (v - min) / range) * (h - 8);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const currentUp = entryPrice !== null && pricePath[pricePath.length - 1] >= entryPrice;
    const lineColor = phase === "idle" ? "#6b7280" : currentUp ? "#22c55e" : "#ef4444";

    // Entry price line
    const entryY = entryPrice !== null ? 4 + (1 - (entryPrice - min) / range) * (h - 8) : null;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 60 }}>
        {entryY !== null && (
          <line
            x1="0" y1={entryY} x2={w} y2={entryY}
            stroke="#6b7280" strokeWidth="1" strokeDasharray="4,4" opacity="0.5"
          />
        )}
        <path d={path} fill="none" stroke={lineColor} strokeWidth="2" />
        {/* Current price dot */}
        <circle
          cx={((pricePath.length - 1) / Math.max(pricePath.length - 1, 1)) * w}
          cy={4 + (1 - (pricePath[pricePath.length - 1] - min) / range) * (h - 8)}
          r="3"
          fill={lineColor}
        />
      </svg>
    );
  };

  // Confetti particles
  const confettiElements = showConfetti
    ? Array.from({ length: 20 }, (_, i) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={{
            left: `${10 + Math.random() * 80}%`,
            top: "-10px",
            width: `${6 + Math.random() * 6}px`,
            height: `${6 + Math.random() * 6}px`,
            backgroundColor: ["#22c55e", "#3b82f6", "#eab308", "#ec4899", "#8b5cf6"][i % 5],
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animation: `confetti-fall ${1 + Math.random() * 1.5}s ease-out forwards`,
            animationDelay: `${Math.random() * 0.3}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))
    : null;

  const priceChange =
    entryPrice !== null && livePrice !== null
      ? (((livePrice - entryPrice) / entryPrice) * 100).toFixed(4)
      : null;

  const priceChangeNum = priceChange !== null ? parseFloat(priceChange) : 0;

  return (
    <div
      className="rounded-lg p-4 relative overflow-hidden"
      style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}
    >
      {/* Confetti */}
      {confettiElements}

      {/* CSS for confetti animation */}
      <style jsx>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(200px) rotate(720deg); opacity: 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
          50% { box-shadow: 0 0 20px 4px rgba(34, 197, 94, 0.3); }
        }
        .countdown-ring {
          animation: pulse-glow 1s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Predict the Price
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-600/20 text-yellow-400 font-medium">
            GAME
          </span>
        </div>
        {totalGames > 0 && (
          <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
            {winRate}% win rate
          </span>
        )}
      </div>

      {/* Coin selector */}
      <div className="flex gap-1 mb-3">
        {COINS.map((c) => (
          <button
            key={c}
            onClick={() => {
              if (phase === "idle") setCoin(c);
            }}
            disabled={phase !== "idle"}
            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
              c === coin ? "bg-blue-600 text-white" : ""
            } ${phase !== "idle" ? "opacity-50 cursor-not-allowed" : ""}`}
            style={c !== coin ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
          >
            {COIN_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Live price */}
      <div className="text-center mb-3">
        <div className="text-2xl font-mono font-bold" style={{ color: "var(--text-primary)" }}>
          {livePrice !== null ? `$${livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Connecting..."}
        </div>
        {phase === "waiting" && priceChange !== null && (
          <div className={`text-sm font-mono font-bold mt-1 ${priceChangeNum >= 0 ? "text-green-400" : "text-red-400"}`}>
            {priceChangeNum >= 0 ? "+" : ""}{priceChange}%
          </div>
        )}
      </div>

      {/* Mini chart */}
      <div className="mb-3 rounded overflow-hidden" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
        {miniChart()}
      </div>

      {/* Game controls */}
      {phase === "idle" && (
        <div className="space-y-2">
          <div className="text-center text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            Will {COIN_LABELS[coin]} go up or down in {ROUND_DURATION}s?
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => startRound("up")}
              disabled={livePrice === null}
              className="flex-1 py-3 rounded-lg font-bold text-sm transition-all
                         hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #16a34a, #22c55e)",
                color: "white",
              }}
            >
              UP
            </button>
            <button
              onClick={() => startRound("down")}
              disabled={livePrice === null}
              className="flex-1 py-3 rounded-lg font-bold text-sm transition-all
                         hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #dc2626, #ef4444)",
                color: "white",
              }}
            >
              DOWN
            </button>
          </div>
        </div>
      )}

      {/* Waiting phase */}
      {phase === "waiting" && (
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>You picked</span>
            <span className={`text-sm font-bold ${prediction === "up" ? "text-green-400" : "text-red-400"}`}>
              {prediction === "up" ? "UP" : "DOWN"}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>at</span>
            <span className="text-sm font-mono font-bold" style={{ color: "var(--text-primary)" }}>
              ${entryPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Countdown circle */}
          <div className="flex items-center justify-center">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold font-mono ${
                countdown <= 5 ? "countdown-ring" : ""
              }`}
              style={{
                border: `3px solid ${countdown <= 5 ? "#ef4444" : countdown <= 15 ? "#eab308" : "#22c55e"}`,
                color: "var(--text-primary)",
              }}
            >
              {countdown}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${(countdown / ROUND_DURATION) * 100}%`,
                background: countdown <= 5 ? "#ef4444" : countdown <= 15 ? "#eab308" : "#22c55e",
              }}
            />
          </div>
        </div>
      )}

      {/* Result phase */}
      {phase === "result" && (
        <div className="text-center space-y-3">
          <div
            className="text-3xl font-black"
            style={{
              color:
                result === "win" ? "#22c55e" : result === "loss" ? "#ef4444" : "#eab308",
            }}
          >
            {result === "win" ? "YOU WIN!" : result === "loss" ? "YOU LOSE" : "DRAW"}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Entry: ${entryPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {" -> "}
            Exit: ${livePrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {priceChange !== null && (
              <span className={priceChangeNum >= 0 ? "text-green-400" : "text-red-400"}>
                {" "}({priceChangeNum >= 0 ? "+" : ""}{priceChange}%)
              </span>
            )}
          </div>
          <button
            onClick={resetRound}
            className="px-6 py-2 rounded-lg text-sm font-bold transition-all hover:scale-105 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              color: "white",
            }}
          >
            Play Again
          </button>
        </div>
      )}

      {/* Stats bar */}
      {totalGames > 0 && (
        <div className="flex justify-between mt-4 pt-3" style={{ borderTop: "1px solid var(--border-color)" }}>
          <div className="text-center">
            <div className="text-xs font-mono font-bold text-green-400">{stats.wins}</div>
            <div className="text-[9px] uppercase" style={{ color: "var(--text-muted)" }}>Wins</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-mono font-bold text-red-400">{stats.losses}</div>
            <div className="text-[9px] uppercase" style={{ color: "var(--text-muted)" }}>Losses</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-mono font-bold text-yellow-400">{stats.draws}</div>
            <div className="text-[9px] uppercase" style={{ color: "var(--text-muted)" }}>Draws</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-mono font-bold" style={{ color: "var(--text-primary)" }}>{stats.streak}</div>
            <div className="text-[9px] uppercase" style={{ color: "var(--text-muted)" }}>Streak</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-mono font-bold text-purple-400">{stats.bestStreak}</div>
            <div className="text-[9px] uppercase" style={{ color: "var(--text-muted)" }}>Best</div>
          </div>
        </div>
      )}
    </div>
  );
}
