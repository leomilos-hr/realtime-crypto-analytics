"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function getColor(value: number): string {
  if (value <= 25) return "#ea3943";
  if (value <= 45) return "#ea8c00";
  if (value <= 55) return "#f5d100";
  if (value <= 75) return "#93d900";
  return "#16c784";
}

function getGradientStops() {
  return [
    { offset: "0%", color: "#ea3943" },
    { offset: "25%", color: "#ea8c00" },
    { offset: "50%", color: "#f5d100" },
    { offset: "75%", color: "#93d900" },
    { offset: "100%", color: "#16c784" },
  ];
}

export default function FearGreedGauge() {
  const { data } = useSWR("/api/fear-greed", fetcher, {
    refreshInterval: 600000,
  });

  const current = data?.[0];
  if (!current) {
    return (
      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
      >
        <h3
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Fear & Greed Index
        </h3>
        <div
          className="h-[180px] flex items-center justify-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Loading...
        </div>
      </div>
    );
  }

  const value = current.value;
  const label = current.label;
  const color = getColor(value);
  // Angle: 0 = left (fear), 180 = right (greed)
  const angle = (value / 100) * 180;
  // Needle endpoint (arc center at 120,130, radius 90)
  const rad = ((180 - angle) * Math.PI) / 180;
  const nx = 120 + 80 * Math.cos(rad);
  const ny = 130 - 80 * Math.sin(rad);

  // History sparkline (last 30 days)
  const history = data?.slice(0, 30).reverse() || [];

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-color)",
      }}
    >
      <h3
        className="text-sm font-semibold mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Fear & Greed Index
      </h3>

      <div className="flex flex-col items-center">
        <svg viewBox="0 0 240 160" className="w-full max-w-[240px]">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              {getGradientStops().map((s) => (
                <stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>

          {/* Arc background */}
          <path
            d="M 30 130 A 90 90 0 0 1 210 130"
            fill="none"
            stroke="var(--bg-input)"
            strokeWidth="18"
            strokeLinecap="round"
          />

          {/* Arc colored fill */}
          <path
            d="M 30 130 A 90 90 0 0 1 210 130"
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="18"
            strokeLinecap="round"
            opacity="0.8"
          />

          {/* Needle */}
          <line
            x1="120"
            y1="130"
            x2={nx}
            y2={ny}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="120" cy="130" r="6" fill={color} />

          {/* Value text */}
          <text
            x="120"
            y="115"
            textAnchor="middle"
            fill={color}
            fontSize="28"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {value}
          </text>

          {/* Labels */}
          <text
            x="25"
            y="150"
            textAnchor="start"
            fill="var(--text-muted)"
            fontSize="10"
          >
            Fear
          </text>
          <text
            x="215"
            y="150"
            textAnchor="end"
            fill="var(--text-muted)"
            fontSize="10"
          >
            Greed
          </text>
        </svg>

        <div
          className="text-sm font-semibold mt-1"
          style={{ color }}
        >
          {label}
        </div>
      </div>

      {/* 30-day history sparkline */}
      {history.length > 1 && (
        <div className="mt-3">
          <div
            className="text-xs mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            30-day trend
          </div>
          <svg viewBox="0 0 200 40" className="w-full" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              points={history
                .map(
                  (d: any, i: number) =>
                    `${(i / (history.length - 1)) * 200},${40 - (d.value / 100) * 40}`
                )
                .join(" ")}
            />
            {/* Threshold lines */}
            <line x1="0" y1="20" x2="200" y2="20" stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4 2" />
          </svg>
          <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
            <span>30d ago</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  );
}
