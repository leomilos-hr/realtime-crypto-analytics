"use client";

import { INTERVALS, Interval } from "@/lib/types";

interface Props {
  selected: Interval;
  onChange: (i: Interval) => void;
}

export default function IntervalSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {INTERVALS.map((i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
            selected === i
              ? "bg-yellow-600 text-white"
              : ""
          }`}
          style={selected !== i ? { backgroundColor: "var(--bg-input)", color: "var(--text-muted)" } : {}}
        >
          {i}
        </button>
      ))}
    </div>
  );
}
