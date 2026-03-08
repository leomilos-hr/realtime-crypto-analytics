"use client";

import { SYMBOLS, SYMBOL_LABELS, Symbol } from "@/lib/types";

interface Props {
  selected: Symbol;
  onChange: (s: Symbol) => void;
}

export default function SymbolSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-1 flex-wrap">
      {SYMBOLS.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
            selected === s
              ? "bg-blue-600 text-white"
              : "bg-dark-700 text-gray-400 hover:bg-dark-600 hover:text-white"
          }`}
        >
          {SYMBOL_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
