"use client";

import { useState, useEffect } from "react";
import { COIN_CATALOG } from "@/lib/types";

interface PriceAlert {
  id: string;
  coin: string;
  ticker: string;
  condition: "above" | "below";
  price: number;
  triggered?: boolean;
}

interface Props {
  onAlertsChange?: (alerts: PriceAlert[]) => void;
}

export default function PriceAlertManager({ onAlertsChange }: Props) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCoin, setSelectedCoin] = useState<{ pair: string; ticker: string } | null>(null);
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [targetPrice, setTargetPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/price-alerts")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAlerts(data);
          onAlertsChange?.(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addAlert = async () => {
    if (!selectedCoin || !targetPrice) return;
    setSaving(true);
    try {
      const res = await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coin: selectedCoin.pair,
          ticker: selectedCoin.ticker,
          condition,
          price: parseFloat(targetPrice),
        }),
      });
      if (res.ok) {
        const newAlert = await res.json();
        const updated = [...alerts, newAlert];
        setAlerts(updated);
        onAlertsChange?.(updated);
        setShowAdd(false);
        setSelectedCoin(null);
        setTargetPrice("");
        setSearch("");
      }
    } catch {}
    setSaving(false);
  };

  const removeAlert = async (id: string) => {
    try {
      await fetch("/api/price-alerts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const updated = alerts.filter((a) => a.id !== id);
      setAlerts(updated);
      onAlertsChange?.(updated);
    } catch {}
  };

  const filteredCoins = search.length > 0
    ? COIN_CATALOG.filter(
        (c) =>
          c.ticker.toLowerCase().includes(search.toLowerCase()) ||
          c.name.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : [];

  if (loading) {
    return <div className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>Loading alerts...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Existing alerts */}
      {alerts.length === 0 && !showAdd && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No price alerts set. Add one to get notified when a coin reaches your target price.
        </p>
      )}

      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-center justify-between px-3 py-2 rounded-lg"
          style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-color)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {alert.ticker}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${alert.condition === "above" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {alert.condition === "above" ? ">" : "<"}
            </span>
            <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>
              ${alert.price.toLocaleString()}
            </span>
          </div>
          <button
            onClick={() => removeAlert(alert.id)}
            className="text-xs px-2 py-1 rounded hover:bg-red-500/20 text-red-400 transition-colors"
          >
            Remove
          </button>
        </div>
      ))}

      {/* Add alert form */}
      {showAdd ? (
        <div className="space-y-3 p-3 rounded-lg" style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-color)" }}>
          {/* Coin search */}
          <div>
            <label className="block text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Coin
            </label>
            {selectedCoin ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {selectedCoin.ticker}
                </span>
                <button
                  onClick={() => { setSelectedCoin(null); setSearch(""); }}
                  className="text-xs text-blue-400 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search coin..."
                  className="w-full px-3 py-1.5 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
                  style={{ backgroundColor: "var(--bg-main)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
                  autoFocus
                />
                {filteredCoins.length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded" style={{ backgroundColor: "var(--bg-main)", border: "1px solid var(--border-color)" }}>
                    {filteredCoins.map((c) => (
                      <button
                        key={c.pair}
                        onClick={() => { setSelectedCoin({ pair: c.pair, ticker: c.ticker }); setSearch(""); }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-600/20 transition-colors"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <span className="font-medium">{c.ticker}</span>
                        <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Condition */}
          <div>
            <label className="block text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Condition
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setCondition("above")}
                className={`flex-1 py-1.5 text-sm rounded font-medium transition-colors ${condition === "above" ? "bg-green-600 text-white" : ""}`}
                style={condition !== "above" ? { backgroundColor: "var(--bg-main)", color: "var(--text-muted)" } : {}}
              >
                Price goes above
              </button>
              <button
                onClick={() => setCondition("below")}
                className={`flex-1 py-1.5 text-sm rounded font-medium transition-colors ${condition === "below" ? "bg-red-600 text-white" : ""}`}
                style={condition !== "below" ? { backgroundColor: "var(--bg-main)", color: "var(--text-muted)" } : {}}
              >
                Price goes below
              </button>
            </div>
          </div>

          {/* Target price */}
          <div>
            <label className="block text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Target Price (USD)
            </label>
            <input
              type="number"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="e.g. 100000"
              step="any"
              className="w-full px-3 py-1.5 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500/50 font-mono"
              style={{ backgroundColor: "var(--bg-main)", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={addAlert}
              disabled={saving || !selectedCoin || !targetPrice}
              className="flex-1 py-1.5 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Alert"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setSelectedCoin(null); setSearch(""); setTargetPrice(""); }}
              className="flex-1 py-1.5 rounded text-sm font-medium transition-colors"
              style={{ backgroundColor: "var(--bg-main)", color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          + Add Price Alert
        </button>
      )}
    </div>
  );
}
