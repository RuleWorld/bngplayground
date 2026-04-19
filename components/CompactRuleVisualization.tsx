import React from 'react';
import { RuleChangeBadges, renderHumanSummary } from './RuleChangeBadges';
import type { RuleChangeSummary } from '../services/ruleAnalysis/ruleChangeTypes';
import type { CompactRule, RuleOperation, VisualizationComponent } from '../types/visualization';

const operationStyles: Record<RuleOperation['type'], string> = {
  bind: 'bg-emerald-500 text-white',
  unbind: 'bg-rose-500 text-white',
  state_change: 'bg-sky-500 text-white',
  add_molecule: 'bg-violet-500 text-white',
  remove_molecule: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100',
};

const operationLabel: Record<RuleOperation['type'], string> = {
  bind: 'Bind',
  unbind: 'Unbind',
  state_change: 'State',
  add_molecule: 'Add',
  remove_molecule: 'Remove',
};

const operationIcon: Record<RuleOperation['type'], string> = {
  bind: '🔗',
  unbind: '✂️',
  state_change: '🌀',
  add_molecule: '+',
  remove_molecule: '-',
};

const describeOperation = (operation: RuleOperation): string => {
  switch (operation.type) {
    case 'bind':
      return `Creates bond ${operation.target}${operation.bondLabel ? ` (${operation.bondLabel})` : ''}`;
    case 'unbind':
      return `Breaks bond ${operation.target}${operation.bondLabel ? ` (${operation.bondLabel})` : ''}`;
    case 'state_change':
      return `Changes ${operation.target} from ${operation.from ?? 'unspecified'} to ${operation.to ?? 'unspecified'}`;
    case 'add_molecule':
      return `Synthesizes ${operation.target}`;
    case 'remove_molecule':
      return `Removes ${operation.target}`;
    default:
      return operation.target;
  }
};

const renderComponent = (component: VisualizationComponent): React.JSX.Element => {
  const state = component.state ? `~${component.state}` : '';
  const bond = component.bondLabel ? component.bondLabel : '';
  const reqGlyph = component.bondRequirement === 'bound' ? '🔗' : component.bondRequirement === 'free' ? '–' : component.bondRequirement === 'either' ? '?' : '';
  return (
    <span className="mr-1 inline-flex items-baseline gap-1">
      <span className="font-medium">{component.name}{state}{bond}</span>
      {reqGlyph && <span className="text-xs text-slate-400">{reqGlyph}</span>}
    </span>
  );
};

interface CompactRuleVisualizationProps {
  rule: CompactRule;
  ruleId: string;
  displayName: string;
  isSelected?: boolean;
  onSelect?: (ruleId: string) => void;
  classification?: RuleChangeSummary | null;
}

/**
 * ⚡ Bolt Performance Optimization:
 * Wrapped CompactRuleVisualization in React.memo to prevent unnecessary
 * re-renders of the entire list when the parent (e.g., CartoonTab) updates
 * selection state. This avoids reconciling unchanged compact rule views,
 * leading to snappier UI interaction.
 */
export const CompactRuleVisualization = React.memo<CompactRuleVisualizationProps>(({ rule, ruleId, displayName, isSelected = false, onSelect, classification }) => {
  const hasOperations = rule.operations.length > 0;

  const baseClasses = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900';
  const selectedClasses = isSelected
    ? 'ring-2 ring-offset-2 ring-sky-500 dark:ring-offset-slate-900'
    : 'hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-600';

  const handleClick = () => {
    onSelect?.(ruleId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${baseClasses} ${selectedClasses}`}
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{displayName}</span>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-300">k = {rule.rate}</span>
      </div>
      {classification && (
        <div className="mb-4 rounded-md border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-700/70 dark:bg-slate-800/60 dark:text-slate-300">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <RuleChangeBadges summary={classification} size="xs" />
          </div>
          <p className="text-[11px] leading-4 text-slate-600 dark:text-slate-300">{renderHumanSummary(classification)}</p>
        </div>
      )}
      {rule.context.length && rule.comment && (
        <div className="mb-2 text-xs italic text-slate-500 dark:text-slate-300">{(rule as any).comment}</div>
      )}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Context</div>
          {rule.context.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-300">No explicit reactant context.</div>
          ) : (
            <div className="space-y-2">
              {rule.context.map((molecule, idx) => (
                <div
                  key={`${molecule.name}-${idx}`}
                  className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{molecule.name}</span>
                  {molecule.components.length > 0 && (
                    <span className="ml-2 text-slate-600 dark:text-slate-300">
                      {molecule.components.map((component, compIdx) => (
                        <span key={`${component.name}-${compIdx}`} className="mr-2">
                          {renderComponent(component)}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Operations</div>
          {hasOperations ? (
            <div className="flex flex-wrap gap-3">
              {rule.operations.map((operation, idx) => (
                <div
                  key={`${operation.type}-${operation.target}-${idx}`}
                  className={`flex w-full max-w-xs flex-col gap-1 rounded-lg px-3 py-2 text-xs shadow-sm md:w-auto ${operationStyles[operation.type]}`}
                >
                  <span className="font-semibold uppercase tracking-wide">{operationIcon[operation.type]} {operationLabel[operation.type]}</span>
                  <span className="text-[11px] leading-4">{describeOperation(operation)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 dark:text-slate-300">No net change detected.</div>
          )}
        </div>
      </div>
    </button>
  );
});
