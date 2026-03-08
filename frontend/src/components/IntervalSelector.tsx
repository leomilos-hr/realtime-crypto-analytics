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
              : "bg-dark-700 text-gray-400 hover:bg-dark-600 hover:text-white"
          }`}
        >
          {i}
        </button>
      ))}
    </div>
  );
}
