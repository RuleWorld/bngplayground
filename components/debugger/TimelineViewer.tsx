import React from 'react';
import type { NetworkTrace } from '@bngplayground/engine';
import { Card } from '../ui/Card';

interface TimelineViewerProps {
  trace: NetworkTrace;
  selectedStep: number;
  onSelectStep(step: number): void;
}

export const TimelineViewer: React.FC<TimelineViewerProps> = ({ trace, selectedStep, onSelectStep }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const active = container.querySelector<HTMLButtonElement>(`[data-step="${selectedStep}"]`);
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [selectedStep]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
        <span className="font-semibold">Expansion timeline · {trace.events.length} steps</span>
        <span>
          Step {Math.min(selectedStep + 1, trace.events.length)} / {trace.events.length}
        </span>
      </div>
      <div ref={containerRef} className="flex gap-2 overflow-x-auto pb-2">
        {trace.events.map((event, index) => {
          const isActive = index === selectedStep;
          return (
            <button
              key={event.stepId}
              type="button"
              data-step={index}
              className={`rounded-md border px-4 py-2 text-left text-xs transition-colors ${
                isActive
                  ? 'border-primary bg-primary text-white'
                  : 'border-stone-200 bg-white text-slate-700 hover:border-primary/70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
              onClick={() => onSelectStep(index)}
            >
              <div className="font-semibold">#{event.stepId}</div>
              <div className="truncate">{event.ruleName}</div>
              <div className="text-[10px] opacity-75">{event.productSpeciesNames.length} product(s)</div>
            </button>
          );
        })}
      </div>
      <Card className="bg-slate-50 text-sm dark:bg-slate-800/60 dark:text-slate-200">
        <div className="font-mono text-xs text-slate-500 dark:text-slate-300">{trace.events[selectedStep]?.ruleName ?? '—'}</div>
        <div className="mt-2 space-y-1 text-xs">
          <div>
            <span className="font-semibold">Reactants:</span>{' '}
            {trace.events[selectedStep]?.reactantSpeciesNames.join(', ') || '—'}
          </div>
          <div>
            <span className="font-semibold">Products:</span>{' '}
            {trace.events[selectedStep]?.productSpeciesNames.join(', ') || '—'}
          </div>
        </div>
      </Card>
    </div>
  );
};
