import React, { useMemo } from 'react';
import { BNGLModel } from '../../types';
import { ARGraphViewer } from '../ARGraphViewer';
import { buildAtomRuleGraph } from '../../services/visualization/arGraphBuilder';

interface RegulatoryTabProps {
  model: BNGLModel | null;
  selectedRuleId?: string | null;
  onSelectRule?: (ruleId: string | null) => void;
  /**
   * Value forwarded to internal ARGraphViewer to force a fit when changed.
   */
  forceFitTrigger?: any;
}

const getRuleId = (rule: { name?: string }, index: number): string => rule.name ?? `rule_${index + 1}`;
const getRuleLabel = (rule: { name?: string }, index: number): string => rule.name ?? `Rule ${index + 1}`;

export const RegulatoryTab: React.FC<RegulatoryTabProps> = ({ model, selectedRuleId, onSelectRule, forceFitTrigger }) => {
  const arGraph = useMemo(() => {
    if (!model) {
      return { nodes: [], edges: [] };
    }
    return buildAtomRuleGraph(model.reactionRules, {
      getRuleId,
      getRuleLabel,
      observables: model.observables.map(o => ({ name: o.name, pattern: o.pattern })),
      functions: model.functions?.map(f => ({ name: f.name, expression: f.expression })),
      includeRateLawDeps: false,  // we don't show parameters like ka/kd in regulatory view
      atomization: 'bng2',        // use BNG2-style patterns (Atomic Patterns) for parity
    });
  }, [model]);

  if (!model) {
    return <div className="text-slate-500 dark:text-slate-400">Parse a model to inspect regulatory structure.</div>;
  }

  if (model.reactionRules.length === 0) {
    return <div className="text-slate-500 dark:text-slate-400">This model has no reaction rules to analyse.</div>;
  }

  return (
    <div className="flex flex-col h-full gap-2">
      {arGraph.nodes.length > 0 ? (
        <ARGraphViewer arGraph={arGraph} selectedRuleId={selectedRuleId} onSelectRule={onSelectRule} forceFitTrigger={forceFitTrigger} />
      ) : (
        <div className="flex h-full items-center justify-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg min-h-[500px]">
          No graph nodes generated. Check if rules are parsed correctly.
        </div>
      )}
    </div>
  );
};
