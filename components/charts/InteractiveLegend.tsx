import React from 'react';

export type LegendEntry = {
  name: string;
  color: string;
};

// Keep consistent with ResultsChart
export const LEGEND_THRESHOLD = 8;

export const ExternalLegend: React.FC<{
  entries: LegendEntry[];
  visible: Set<string>;
  onToggle: (name: string) => void;
  onIsolate: (name: string) => void;
  highlighted?: Set<string>;
}> = ({ entries, visible, onToggle, onIsolate, highlighted }) => {
  const highlightedSet = highlighted;

  return (
    <div className="mt-4 max-h-48 overflow-y-auto border-t border-slate-200 dark:border-slate-700 pt-4">
      <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 px-4">
        {entries.map((entry) => {
          const isVisible = visible.has(entry.name);
          const isHighlighted =
            !highlightedSet || highlightedSet.size === 0 || highlightedSet.has(entry.name);

          return (
            <div
              key={entry.name}
              onClick={() => onToggle(entry.name)}
              onDoubleClick={(e) => {
                e.preventDefault();
                onIsolate(entry.name);
              }}
              title="Double-click to isolate"
              className={`flex items-center cursor-pointer transition-opacity ${!isVisible ? 'opacity-40' : isHighlighted ? 'opacity-100' : 'opacity-60'} hover:bg-slate-50 dark:hover:bg-slate-800 rounded px-1 -ml-1`}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: entry.color,
                  marginRight: 6,
                  borderRadius: '2px',
                }}
              />
              <span className="text-xs text-slate-700 dark:text-slate-300">{entry.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const InlineLegend: React.FC<{
  payload?: Array<{ value: string; color: string; inactive?: boolean }>;
  onToggle: (name: string) => void;
  onIsolate: (name: string) => void;
}> = ({ payload, onToggle, onIsolate }) => {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 mt-4 px-4">
      {payload.map((entry, index) => (
        <div
          key={`item-${index}`}
          onClick={() => onToggle(entry.value)}
          onDoubleClick={(e) => {
            e.preventDefault();
            onIsolate(entry.value);
          }}
          title="Double-click to isolate"
          className={`flex items-center cursor-pointer transition-opacity ${entry.inactive ? 'opacity-50' : 'opacity-100'} hover:bg-slate-50 dark:hover:bg-slate-800 rounded px-1 -ml-1`}
        >
          <div
            style={{
              width: 12,
              height: 12,
              backgroundColor: entry.color,
              marginRight: 6,
              borderRadius: '2px',
            }}
          />
          <span className="text-xs text-slate-700 dark:text-slate-300">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export function formatYAxisTick(value: unknown): string {
  if (typeof value !== 'number') return String(value);
  const abs = Math.abs(value);
  if (abs >= 1e9) return (value / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  if (abs < 0.01 && abs !== 0) return value.toExponential(1);
  return value.toFixed(0);
}

export function formatTooltipNumber(value: any, digits = 2): string {
  const num = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toFixed(digits);
}
