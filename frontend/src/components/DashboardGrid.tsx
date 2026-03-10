"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Responsive,
  WidthProvider,
  Layout,
  LayoutItem,
  ResponsiveLayouts,
} from "react-grid-layout/legacy";
import NewsFeed from "./NewsFeed";
import FearGreedGauge from "./FearGreedGauge";
import AlertsFeed from "./AlertsFeed";
import PricePredictor from "./PricePredictor";
import "react-grid-layout/css/styles.css";

const ResponsiveGrid = WidthProvider(Responsive);

interface PanelConfig {
  id: string;
  title: string;
  visible: boolean;
}

const ALL_PANELS: PanelConfig[] = [
  { id: "news", title: "News Feed", visible: true },
  { id: "fear-greed", title: "Fear & Greed", visible: true },
  { id: "alerts", title: "Alerts", visible: true },
  { id: "predictor", title: "Price Predictor", visible: true },
];

const DEFAULT_LAYOUTS: ResponsiveLayouts = {
  lg: [
    { i: "news", x: 0, y: 0, w: 2, h: 5, minW: 2, minH: 3 },
    { i: "predictor", x: 2, y: 0, w: 1, h: 5, minW: 1, minH: 4 },
    { i: "fear-greed", x: 3, y: 0, w: 1, h: 5, minW: 1, minH: 3 },
    { i: "alerts", x: 0, y: 5, w: 4, h: 4, minW: 2, minH: 3 },
  ],
  md: [
    { i: "news", x: 0, y: 0, w: 2, h: 5, minW: 2, minH: 3 },
    { i: "predictor", x: 2, y: 0, w: 1, h: 5, minW: 1, minH: 4 },
    { i: "fear-greed", x: 3, y: 0, w: 1, h: 5, minW: 1, minH: 3 },
    { i: "alerts", x: 0, y: 5, w: 4, h: 4, minW: 2, minH: 3 },
  ],
  sm: [
    { i: "news", x: 0, y: 0, w: 2, h: 5, minW: 1, minH: 3 },
    { i: "predictor", x: 0, y: 5, w: 2, h: 5, minW: 1, minH: 4 },
    { i: "fear-greed", x: 0, y: 10, w: 2, h: 4, minW: 1, minH: 3 },
    { i: "alerts", x: 0, y: 14, w: 2, h: 4, minW: 1, minH: 3 },
  ],
};

const STORAGE_KEY = "dashboard-grid-layouts-v2";
const PANELS_KEY = "dashboard-grid-panels-v2";

function loadLayouts(): ResponsiveLayouts | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return undefined;
}

function loadPanels(): PanelConfig[] {
  if (typeof window === "undefined") return ALL_PANELS;
  try {
    const saved = localStorage.getItem(PANELS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return ALL_PANELS;
}

export default function DashboardGrid() {
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(
    () => loadLayouts() || DEFAULT_LAYOUTS
  );
  const [panels, setPanels] = useState<PanelConfig[]>(() => loadPanels());
  const [showSettings, setShowSettings] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const onLayoutChange = useCallback(
    (_layout: Layout, allLayouts: ResponsiveLayouts) => {
      // Merge incoming layouts with existing ones to preserve hidden panels
      setLayouts((prev) => {
        const merged: ResponsiveLayouts = {};
        const allBps = Array.from(new Set([...Object.keys(prev), ...Object.keys(allLayouts)]));
        for (const bp of allBps) {
          const incoming = allLayouts[bp] || [];
          const existing = prev[bp] || [];
          // Keep hidden panel entries from existing, add/update visible ones from incoming
          const incomingIds = new Set(incoming.map((l: LayoutItem) => l.i));
          const hidden = existing.filter((l: LayoutItem) => !incomingIds.has(l.i));
          merged[bp] = [...incoming, ...hidden];
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch {}
        return merged;
      });
    },
    []
  );

  const togglePanel = (id: string) => {
    const updated = panels.map((p) =>
      p.id === id ? { ...p, visible: !p.visible } : p
    );
    setPanels(updated);
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(updated));
    } catch {}

    // When re-showing a panel, ensure it has a layout entry in every breakpoint
    const panel = updated.find((p) => p.id === id);
    if (panel?.visible) {
      setLayouts((prev) => {
        const next = { ...prev };
        for (const bp of Object.keys(DEFAULT_LAYOUTS)) {
          const bpLayout = next[bp] || [];
          const exists = bpLayout.some((l: LayoutItem) => l.i === id);
          if (!exists) {
            const defaultEntry = DEFAULT_LAYOUTS[bp]?.find((l: LayoutItem) => l.i === id);
            if (defaultEntry) {
              // Place at bottom to avoid overlapping
              const maxY = bpLayout.reduce((max: number, l: LayoutItem) => Math.max(max, (l.y || 0) + (l.h || 1)), 0);
              next[bp] = [...bpLayout, { ...defaultEntry, y: maxY }];
            }
          }
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  };

  const resetLayout = () => {
    setLayouts(DEFAULT_LAYOUTS);
    setPanels(ALL_PANELS);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PANELS_KEY);
    } catch {}
  };

  const visiblePanels = panels.filter((p) => p.visible);
  const filteredLayouts: ResponsiveLayouts = {};
  for (const bp of Object.keys(layouts)) {
    const bpLayouts = layouts[bp];
    if (bpLayouts) {
      filteredLayouts[bp] = bpLayouts.filter((l: LayoutItem) =>
        visiblePanels.some((p) => p.id === l.i)
      );
    }
  }

  const renderPanel = (id: string) => {
    switch (id) {
      case "news":
        return <NewsFeed />;
      case "fear-greed":
        return <FearGreedGauge />;
      case "alerts":
        return <AlertsFeed />;
      case "predictor":
        return <PricePredictor />;
      default:
        return null;
    }
  };

  if (!mounted) return null;

  return (
    <div className="mt-4" ref={containerRef}>
      {/* Settings toggle */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium tracking-wider uppercase" style={{ color: "var(--text-muted)" }}>
          Widgets
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ backgroundColor: "var(--bg-input)", color: "var(--text-muted)" }}
          >
            {showSettings ? "Done" : "Customize"}
          </button>
          {showSettings && (
            <button
              onClick={resetLayout}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ backgroundColor: "var(--bg-input)", color: "var(--text-muted)" }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Panel toggles */}
      {showSettings && (
        <div className="flex gap-2 mb-3 view-enter">
          {panels.map((p) => (
            <button
              key={p.id}
              onClick={() => togglePanel(p.id)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                p.visible ? "bg-blue-600 text-white" : ""
              }`}
              style={!p.visible ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
            >
              {p.visible ? "\u2713 " : ""}{p.title}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <ResponsiveGrid
        className="layout"
        layouts={filteredLayouts}
        breakpoints={{ lg: 1024, md: 768, sm: 0 }}
        cols={{ lg: 4, md: 4, sm: 2 }}
        rowHeight={110}
        onLayoutChange={onLayoutChange}
        isDraggable={showSettings}
        isResizable={showSettings}
        draggableHandle=".grid-drag-handle"
        containerPadding={[0, 0] as [number, number]}
        margin={[16, 16] as [number, number]}
      >
        {visiblePanels.map((panel) => (
          <div key={panel.id} className="relative">
            {showSettings && (
              <div
                className="grid-drag-handle absolute top-0 left-0 right-0 h-8 z-30 cursor-move flex items-center justify-center rounded-t-lg"
                style={{ backgroundColor: "rgba(59,130,246,0.15)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--text-muted)" }}>
                  <circle cx="8" cy="6" r="2" /><circle cx="16" cy="6" r="2" />
                  <circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" />
                  <circle cx="8" cy="18" r="2" /><circle cx="16" cy="18" r="2" />
                </svg>
              </div>
            )}
            <div className={`h-full overflow-auto ${showSettings ? "ring-1 ring-blue-500/30 rounded-lg" : ""}`}>
              {renderPanel(panel.id)}
            </div>
          </div>
        ))}
      </ResponsiveGrid>
    </div>
  );
}
