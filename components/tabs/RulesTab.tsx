
import React, { useEffect, useMemo, useState } from 'react';
import { BNGLModel, SimulationResults } from '../../types';
import { ResultsChart } from '../ResultsChart';
import { buildRegulatoryInsights } from '../../services/visualization/regulatoryInsights';
import { classifyRuleChanges } from '../../services/ruleAnalysis/ruleChangeClassifier';
import type { RuleChangeSummary } from '../../services/ruleAnalysis/ruleChangeTypes';
import { RuleChangeBadges, renderHumanSummary } from '../RuleChangeBadges';

interface RulesTabProps {
  model: BNGLModel | null;
  results: SimulationResults | null;
  selectedRuleId?: string | null;
  onSelectRule?: (ruleId: string) => void;
  simulationMethod?: 'ode' | 'ssa' | 'nf' | 'nfsim';
}

const getRuleId = (rule: { name?: string }, index: number): string => rule.name ?? `rule_${index + 1}`;
// For unnamed rules (or parser-generated names like _R1), show the 1-indexed number
const getRuleLabel = (rule: { name?: string }, index: number): string => {
  const name = rule.name;
  if (!name) return `${index + 1}`;
  // If name matches _R followed by digits, extract just the number
  const match = name.match(/^_R(\d+)$/);
  if (match) return match[1];
  return name;
};

export const RulesTab: React.FC<RulesTabProps> = ({ model, results, selectedRuleId, onSelectRule, simulationMethod }) => {
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null);
  const [overlaySpecies, setOverlaySpecies] = useState<Set<string>>(new Set());
  const [highlightedSeries, setHighlightedSeries] = useState<string[]>([]);

  const insights = useMemo(() => buildRegulatoryInsights(model), [model]);

  const ruleClassifications = useMemo(() => {
    if (!model) {
      return {} as Record<string, RuleChangeSummary>;
    }
    return model.reactionRules.reduce((acc, rule, index) => {
      const ruleId = getRuleId(rule, index);
      const ruleName = getRuleLabel(rule, index);
      try {
        acc[ruleId] = classifyRuleChanges(rule, { ruleId, ruleName });
      } catch (error) {
        console.warn('Failed to classify rule', ruleId, error);
      }
      return acc;
    }, {} as Record<string, RuleChangeSummary>);
  }, [model]);

  useEffect(() => {
    if (!insights || !selectedRuleId) {
      setSelectedAtomId(null);
      return;
    }

    const impact = insights.ruleImpacts[selectedRuleId];
    if (!impact) {
      setSelectedAtomId(null);
      return;
    }

    const priority = [...impact.produces, ...impact.modifies, ...impact.consumes];
    if (priority.length === 0) {
      setSelectedAtomId(null);
      return;
    }

    setSelectedAtomId((current) => {
      if (current && priority.includes(current)) {
        return current;
      }
      return priority[0];
    });
  }, [insights, selectedRuleId]);

  useEffect(() => {
    if (!results) {
      setOverlaySpecies(new Set());
      setHighlightedSeries([]);
      return;
    }

    const initial = new Set(results.headers.filter((header) => header !== 'time'));
    setOverlaySpecies(initial);
  }, [results]);

  const atomObservables = useMemo(() => {
    if (!insights || !selectedAtomId) {
      return [] as string[];
    }
    return insights.atomToObservables[selectedAtomId] ?? [];
  }, [insights, selectedAtomId]);

  const observablesKey = atomObservables.join('|');

  useEffect(() => {
    if (!results) {
      setHighlightedSeries([]);
      return;
    }

    setHighlightedSeries(atomObservables);
    if (atomObservables.length === 0) {
      return;
    }

    setOverlaySpecies((prev) => {
      const next = new Set(prev);
      atomObservables.forEach((observable) => {
        if (results.headers.includes(observable)) {
          next.add(observable);
        }
      });
      const sanitized = new Set(Array.from(next).filter((name) => name !== 'time' && results.headers.includes(name)));
      const unchanged = sanitized.size === prev.size && Array.from(sanitized).every((name) => prev.has(name));
      return unchanged ? prev : sanitized;
    });
  }, [observablesKey, results]);

  const selectedRuleImpact = selectedRuleId && insights ? insights.ruleImpacts[selectedRuleId] : null;
  const selectedRuleClassification = selectedRuleId ? ruleClassifications[selectedRuleId] : null;
  const selectedRuleComment = selectedRuleId && model ? model.reactionRules.find((r, i) => getRuleId(r, i) === selectedRuleId)?.comment : null;
  const selectedAtomMeta = selectedAtomId && insights ? insights.atomMetadata[selectedAtomId] : null;
  const atomSpecies = selectedAtomId && insights ? insights.atomToSpecies[selectedAtomId] ?? [] : [];
  const atomUsage = selectedAtomId && insights ? insights.atomRuleUsage[selectedAtomId] : undefined;

  if (!model) {
    return <div className="text-slate-500 dark:text-slate-400">Parse a model to inspect rules.</div>;
  }

  if (model.reactionRules.length === 0) {
    return <div className="text-slate-500 dark:text-slate-400">This model has no reaction rules.</div>;
  }

  const renderAtomList = (atoms: string[], label: string, accent: string) => (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {atoms.map((atom) => (
          <button
            key={atom}
            type="button"
            onClick={() => setSelectedAtomId(atom)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${selectedAtomId === atom
              ? `${accent} border-transparent text-white`
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
          >
            {insights?.atomMetadata[atom]?.label ?? atom}
          </button>
        ))}
        {atoms.length === 0 && <span className="text-xs text-slate-400">—</span>}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Rule Selector - Horizontal Top Bar */}
      <div className="flex items-center gap-3 shrink-0">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">
          Rule:
        </label>
        <select
          value={selectedRuleId || ''}
          onChange={(e) => onSelectRule?.(e.target.value)}
          className="flex-1 max-w-md px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="" disabled>Select a rule ({model.reactionRules.length} available)</option>
          {model.reactionRules.map((rule, index) => {
            const id = getRuleId(rule, index);
            const label = getRuleLabel(rule, index);
            // Build reaction representation from reactants/products if reactionString not available
            const reactionDisplay = rule.reactionString
              || `${rule.reactants.join(' + ')} → ${rule.products.join(' + ')}`;
            const truncated = reactionDisplay.length > 60 ? reactionDisplay.substring(0, 57) + '...' : reactionDisplay;
            return (
              <option key={id} value={id}>
                {label} — {truncated}
              </option>
            );
          })}
        </select>
        {selectedRuleId && (
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
            {(() => {
              const rule = model.reactionRules.find((r, i) => getRuleId(r, i) === selectedRuleId);
              if (!rule) return '';
              return rule.reactionString || `${rule.reactants.join(' + ')} → ${rule.products.join(' + ')}`;
            })()}
          </span>
        )}
      </div>

      {/* Main Content Area - Full Width */}
      <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
        <section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900 shrink-0 overflow-y-auto max-h-[15%]">
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {selectedRuleImpact ? selectedRuleImpact.label : 'Select a rule'}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Follow how a rule manipulates structural atoms, then inspect their time courses.
              </p>
              {selectedRuleClassification && (
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                  <RuleChangeBadges summary={selectedRuleClassification} size="xs" />
                  <p className="mt-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                    {renderHumanSummary(selectedRuleClassification)}
                  </p>
                </div>
              )}
              {selectedRuleComment && (
                <div className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">{selectedRuleComment}</div>
              )}
            </div>
          </div>

          {selectedRuleImpact && (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {renderAtomList(selectedRuleImpact.produces, 'Produces', 'bg-emerald-500')}
              {renderAtomList(selectedRuleImpact.modifies, 'Modifies', 'bg-sky-500')}
              {renderAtomList(selectedRuleImpact.consumes, 'Consumes', 'bg-amber-500')}
            </div>
          )}

          {selectedAtomMeta && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/70">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-200">Focused atom:</span>
                <span className="rounded bg-sky-100 px-2 py-0.5 font-mono text-[11px] text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
                  {selectedAtomMeta.label}
                </span>
                {atomSpecies.length > 0 && (
                  <span className="text-slate-500 dark:text-slate-400">Seen in {atomSpecies.length} species</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                {atomObservables.length > 0 ? (
                  <span>
                    Linked observables:{' '}
                    {atomObservables.map((obs) => (
                      <span key={obs} className="ml-1 rounded bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
                        {obs}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span>No observables track this atom yet.</span>
                )}
                {atomUsage && (
                  <span>
                    Influenced by rules:{' '}
                    {[...atomUsage.produces, ...atomUsage.modifies, ...atomUsage.consumes]
                      .slice(0, 6)
                      .map((ruleId) => (
                        <button
                          key={ruleId}
                          type="button"
                          onClick={() => onSelectRule?.(ruleId)}
                          className="ml-1 rounded border border-slate-300 px-2 py-0.5 font-medium text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-200 dark:hover:border-slate-500"
                        >
                          {insights?.ruleImpacts[ruleId]?.label ?? ruleId}
                        </button>
                      ))}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="flex-1 overflow-y-auto p-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          {results ? (
            <ResultsChart
              results={results}
              model={model}
              isNFsim={simulationMethod === 'nf'}
              visibleSpecies={overlaySpecies}
              onVisibleSpeciesChange={setOverlaySpecies}
              highlightedSeries={highlightedSeries}
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Run a simulation to enable the time-course overlay.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
