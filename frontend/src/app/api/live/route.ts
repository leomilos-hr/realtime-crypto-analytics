import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT",
  "DOTUSDT", "BCHUSDT", "QNTUSDT",
];

async function fetchBinancePrices() {
  const url = "https://api.binance.com/api/v3/ticker/24hr";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  const data = await res.json();

  const bySymbol = new Map<string, any>();
  for (const t of data) {
    bySymbol.set(t.symbol, t);
  }
  return bySymbol;
}

export async function GET() {
  const encoder = new TextEncoder();
  let priceInterval: ReturnType<typeof setInterval> | null = null;
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const cleanup = () => {
    closed = true;
    if (priceInterval) clearInterval(priceInterval);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    priceInterval = null;
    keepAliveInterval = null;
  };

  const stream = new ReadableStream({
    async start(controller) {
      const sendPrices = async () => {
        if (closed) return;
        try {
          const tickers = await fetchBinancePrices();

          const prices = DEFAULT_SYMBOLS
            .filter((s) => tickers.has(s))
            .map((s) => {
              const t = tickers.get(s)!;
              return {
                symbol: s,
                price: parseFloat(t.lastPrice),
                open: parseFloat(t.openPrice),
                change: parseFloat(t.priceChangePercent),
                high: parseFloat(t.highPrice),
                low: parseFloat(t.lowPrice),
                volume: parseFloat(t.volume),
              };
            });

          // Also include any extra USDT pairs for user-added coins
          const allPrices: any[] = [];
          tickers.forEach((t: any, sym: string) => {
            if (sym.endsWith("USDT") && !DEFAULT_SYMBOLS.includes(sym)) {
              allPrices.push({
                symbol: sym,
                price: parseFloat(t.lastPrice),
                open: parseFloat(t.openPrice),
                change: parseFloat(t.priceChangePercent),
                high: parseFloat(t.highPrice),
                low: parseFloat(t.lowPrice),
                volume: parseFloat(t.volume),
              });
            }
          });

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify([...prices, ...allPrices])}\n\n`)
          );
        } catch (error) {
          if (!closed) console.error("SSE price fetch error:", error);
        }
      };

      try {
        controller.enqueue(encoder.encode(": connected\n\n"));
        await sendPrices();
        priceInterval = setInterval(sendPrices, 10000);
        keepAliveInterval = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            cleanup();
          }
        }, 30000);
      } catch {
        cleanup();
      }
    },
    cancel() {
      cleanup();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
