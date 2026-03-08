"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface NewsItem {
  id: number;
  title: string;
  url: string;
  source: string;
  published: string;
  currencies: string[];
  kind: string;
  votes: { positive?: number; negative?: number; important?: number; liked?: number };
}

const FILTERS = [
  { label: "Hot", value: "hot" },
  { label: "Rising", value: "rising" },
  { label: "Bullish", value: "bullish" },
  { label: "Bearish", value: "bearish" },
  { label: "Important", value: "important" },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function sentimentIcon(votes: NewsItem["votes"]) {
  const pos = (votes.positive || 0) + (votes.liked || 0);
  const neg = votes.negative || 0;
  if (pos > neg + 1) return { emoji: "\u25B2", color: "text-green-400" };
  if (neg > pos + 1) return { emoji: "\u25BC", color: "text-red-400" };
  return { emoji: "\u25CF", color: "text-gray-500" };
}

interface NewsFeedProps {
  currency?: string;
}

export default function NewsFeed({ currency }: NewsFeedProps) {
  const [filter, setFilter] = useState("hot");

  const params = new URLSearchParams({ filter });
  if (currency) params.set("currency", currency);

  const { data: news, isLoading } = useSWR<NewsItem[]>(
    `/api/news?${params.toString()}`,
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
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8" />
            <path d="M15 18h-5" />
            <path d="M10 6h8v4h-8V6Z" />
          </svg>
          Crypto News
        </h3>
        <a
          href="https://cryptopanic.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          via CryptoPanic
        </a>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              filter === f.value ? "bg-blue-600 text-white" : ""
            }`}
            style={
              filter !== f.value
                ? {
                    backgroundColor: "var(--bg-input)",
                    color: "var(--text-muted)",
                  }
                : {}
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* News list */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {isLoading && (
          <div
            className="text-center py-8 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Loading news...
          </div>
        )}

        {!isLoading && (!news || news.length === 0) && (
          <div
            className="text-center py-8 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {news
              ? "No news available. Set CRYPTOPANIC_API_TOKEN in .env to enable."
              : "Failed to load news."}
          </div>
        )}

        {news &&
          news.map((item) => {
            const sentiment = sentimentIcon(item.votes);
            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-2.5 rounded-lg transition-colors"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--bg-input)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <div className="flex gap-2">
                  <span className={`${sentiment.color} text-xs mt-0.5 flex-shrink-0`}>
                    {sentiment.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm leading-snug line-clamp-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item.source}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        &middot;
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {timeAgo(item.published)}
                      </span>
                      {item.currencies.length > 0 && (
                        <>
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            &middot;
                          </span>
                          <div className="flex gap-1">
                            {item.currencies.slice(0, 3).map((c) => (
                              <span
                                key={c}
                                className="text-xs px-1.5 py-0.5 rounded font-medium"
                                style={{
                                  backgroundColor: "var(--bg-main)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                {c}
                              </span>
                            ))}
                            {item.currencies.length > 3 && (
                              <span
                                className="text-xs"
                                style={{ color: "var(--text-muted)" }}
                              >
                                +{item.currencies.length - 3}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
      </div>
    </div>
  );
}
