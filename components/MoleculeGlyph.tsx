import React from 'react';
import type { VisualizationMolecule } from '../types/visualization';
import { foregroundForBackground } from '../services/visualization/colorUtils';

interface MoleculeGlyphProps {
  molecule: VisualizationMolecule;
  showBondLabels?: boolean;
}

const glyphForRequirement = (req?: 'free' | 'bound' | 'either' | null) => {
  switch (req) {
    case 'bound':
      return '🔗';
    case 'free':
      return '–';
    case 'either':
      return '?';
    default:
      return '';
  }
};

export const MoleculeGlyph: React.FC<MoleculeGlyphProps> = ({ molecule, showBondLabels = true }) => {
  const color = molecule.color ?? '#94A3B8';
  const fg = molecule.textColor ?? foregroundForBackground(color);

  return (
    <div className="flex flex-col items-center">
      <div
        className="flex w-44 items-center justify-center rounded-t-md px-3 py-1 text-sm font-semibold"
        style={{ background: color, color: fg, border: `2px solid ${color}` }}
      >
        {molecule.name}
      </div>
      <div className="flex w-44 flex-wrap items-center justify-center gap-1 rounded-b-md border p-2 bg-white dark:bg-slate-900 dark:bg-slate-800">
        {molecule.components.map((component, idx) => (
          <div key={`${component.name}-${idx}`} className="flex flex-col items-center">
            <div className={`rounded-md border px-2 py-1 text-xs ${component.role === 'context' ? 'bg-slate-100 text-slate-500 dark:text-slate-300 dark:bg-slate-800/60 dark:text-slate-300' : 'bg-white dark:bg-slate-900 dark:bg-slate-800'}`}>
              <span className="font-semibold">{component.name}</span>
              {component.state && <span className="ml-1 text-slate-600 dark:text-slate-300">~{component.state}</span>}
              {showBondLabels && component.bondLabel && (
                <span className="ml-1 text-amber-700 dark:text-amber-300 font-mono text-[11px]">{component.bondLabel}</span>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-400">{glyphForRequirement(component.bondRequirement)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MoleculeGlyph;
