"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface NewsItem {
  title: string;
  link: string;
  source: string;
  source_icon: string;
  og: string;
}

const CATEGORIES = [
  "World", "Business", "Technology", "Science", "Health", "Entertainment", "Sports", "US",
];

export default function NewsFeed() {
  const [category, setCategory] = useState("World");

  const { data: news, isLoading } = useSWR<NewsItem[]>(
    `/api/news?category=${category}`,
    fetcher,
    { refreshInterval: 300000 }
  );

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-color)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-sm font-semibold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8" />
            <path d="M15 18h-5" />
            <path d="M10 6h8v4h-8V6Z" />
          </svg>
          Global News
        </h3>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Live headlines
        </span>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              category === cat ? "bg-blue-600 text-white" : ""
            }`}
            style={
              category !== cat
                ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" }
                : {}
            }
          >
            {cat}
          </button>
        ))}
      </div>

      {/* News list */}
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
        {isLoading && (
          <div className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
            Loading news...
          </div>
        )}

        {!isLoading && (!news || news.length === 0) && (
          <div className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
            No news available.
          </div>
        )}

        {news && news.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 p-2 rounded-lg transition-colors"
            style={{ backgroundColor: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-input)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            {/* Thumbnail */}
            {item.og && (
              <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden">
                <img
                  src={item.og}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p
                className="text-sm leading-snug line-clamp-2 mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                {item.title}
              </p>
              <div className="flex items-center gap-1.5">
                {item.source_icon && (
                  <img
                    src={item.source_icon}
                    alt=""
                    className="w-3.5 h-3.5 rounded-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {item.source}
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
