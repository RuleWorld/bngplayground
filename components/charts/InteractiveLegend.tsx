import React from 'react';
import { formatValue } from '../../src/utils/formatValue';

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
            <button
              type="button"
              key={entry.name}
              onClick={() => onToggle(entry.name)}
              onDoubleClick={(e) => {
                e.preventDefault();
                onIsolate(entry.name);
              }}
              title="Double-click to isolate"
              aria-pressed={isVisible}
              aria-label={`${isVisible ? 'Hide' : 'Show'} series ${entry.name}`}
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
            </button>
          );
        })}
      </div>
    </div>
  );
};

export interface LegendPayloadEntry {
  value: string;
  color: string;
  type?: 'line' | 'scatter' | 'area';
  inactive?: boolean;
}

export const InlineLegend: React.FC<{
  payload?: LegendPayloadEntry[];
  onToggle: (name: string) => void;
  onIsolate: (name: string) => void;
}> = ({ payload, onToggle, onIsolate }) => {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1.5 px-4">
      {payload.map((entry, index) => {
        const isScatter = entry.type === 'scatter';
        return (
          <button
            type="button"
            key={`item-${index}`}
            onClick={() => onToggle(entry.value)}
            onDoubleClick={(e) => {
              e.preventDefault();
              onIsolate(entry.value);
            }}
            title="Click to toggle, double-click to isolate"
            aria-pressed={!entry.inactive}
            aria-label={`${entry.inactive ? 'Show' : 'Hide'} series ${entry.value}`}
            className={`flex items-center gap-2 cursor-pointer transition-all duration-200 
              ${entry.inactive ? 'opacity-40 grayscale-[0.5]' : 'opacity-100'} 
              hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-md px-2 py-1
              border border-transparent hover:border-slate-200 dark:hover:border-slate-700
              select-none active:scale-95`}
          >
            <div
              className={`shrink-0 transition-transform ${entry.inactive ? 'scale-75' : 'scale-100'}`}
              style={{
                width: 10,
                height: 10,
                backgroundColor: entry.color,
                borderRadius: isScatter ? '50%' : '2px',
                boxShadow: entry.inactive ? 'none' : `0 0 0 1px ${entry.color}44`,
              }}
            />
            <span className={`text-[11px] font-medium transition-colors ${entry.inactive ? 'text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300'}`}>
              {entry.value}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export function formatYAxisTick(value: unknown): string {
  if (typeof value !== 'number') return String(value);
  return formatValue(value);
}

export function formatTooltipNumber(value: any, _digits = 2): string {
  const num = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(num)) return String(value);
  return formatValue(num);
}
