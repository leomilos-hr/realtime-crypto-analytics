export const SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "ADAUSDT",
  "DOTUSDT",
  "BCHUSDT",
  "QNTUSDT",
] as const;

export type Symbol = (typeof SYMBOLS)[number];

export const INTERVALS = ["1m", "5m", "15m", "30m", "1h"] as const;
export type Interval = (typeof INTERVALS)[number];

export const SYMBOL_LABELS: Record<Symbol, string> = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  SOLUSDT: "Solana",
  ADAUSDT: "Cardano",
  DOTUSDT: "Polkadot",
  BCHUSDT: "Bitcoin Cash",
  QNTUSDT: "Quant",
};
