import React from 'react';
import type { ExpansionEvent } from '@bngplayground/engine';
import { Card } from '../ui/Card';

interface MatchVisualizerGlyphProps {
  event: ExpansionEvent;
}

export const MatchVisualizerGlyph: React.FC<MatchVisualizerGlyphProps> = ({ event }) => {
  if (!event.matches.length) {
    return (
      <Card className="text-xs text-slate-500 dark:text-slate-300">
        Detailed match information was not captured for this event.
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {event.matches.map((match, idx) => (
        <Card key={`${event.stepId}-${idx}`} className="text-xs">
          <div className="mb-2 font-semibold text-slate-700 dark:text-slate-100">Match #{idx + 1}</div>
          <div className="space-y-1">
            <div>
              <span className="font-semibold">Pattern molecule:</span>{' '}
              {match.patternMolecule >= 0 ? match.patternMolecule : '—'}
            </div>
            <div>
              <span className="font-semibold">Target molecule:</span>{' '}
              {match.targetMolecule >= 0 ? match.targetMolecule : '—'}
            </div>
            <div className="pt-1">
              <span className="font-semibold">Components:</span>
              <ul className="mt-1 space-y-0.5">
                {match.componentMappings.map((mapping, mapIdx) => (
                  <li key={mapIdx} className="font-mono">
                    p{mapping.patternComponent} → t{mapping.targetComponent}
                  </li>
                ))}
                {!match.componentMappings.length && <li className="text-slate-400">No component mapping recorded</li>}
              </ul>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
