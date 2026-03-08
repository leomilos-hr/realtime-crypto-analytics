"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AlertsFeed() {
  const { data: alerts } = useSWR("/api/alerts?limit=15", fetcher, {
    refreshInterval: 10000,
  });

  return (
    <div className="bg-dark-800 rounded-lg p-4 border border-dark-600">
      <h3 className="text-white text-sm font-semibold mb-3">Recent Alerts</h3>
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {alerts && alerts.length > 0 ? (
          alerts.map((alert: any, i: number) => (
            <div
              key={i}
              className={`p-2 rounded text-xs border ${
                alert.severity === "HIGH"
                  ? "border-red-800 bg-red-900/20"
                  : "border-yellow-800 bg-yellow-900/20"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-white font-medium">{alert.symbol}</span>
                <span className="text-gray-500">
                  {new Date(alert.time * 1000).toLocaleTimeString()}
                </span>
              </div>
              <span className="text-gray-400">
                {alert.type === "PRICE_ALERT"
                  ? `Price change: ${alert.pct_change?.toFixed(2)}%`
                  : `RSI: ${alert.rsi?.toFixed(1)}`}
              </span>
            </div>
          ))
        ) : (
          <p className="text-gray-500 text-xs">No recent alerts</p>
        )}
      </div>
    </div>
  );
}
