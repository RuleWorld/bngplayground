import React, { useMemo } from 'react';
import { BNGLModel } from '../../types';
import { RuleCartoon } from '../RuleCartoon';
import { CompactRuleVisualization } from '../CompactRuleVisualization';
import { parseRuleForVisualization } from '../../services/visualization/ruleParser';
import { buildCompactRule } from '../../services/visualization/compactRuleBuilder';
import { classifyRuleChanges } from '../../services/ruleAnalysis/ruleChangeClassifier';
import type { RuleChangeSummary } from '../../services/ruleAnalysis/ruleChangeTypes';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '../ui/Tabs';

interface CartoonTabProps {
  model: BNGLModel | null;
  selectedRuleId?: string | null;
  onSelectRule?: (ruleId: string) => void;
}

export const CartoonTab: React.FC<CartoonTabProps> = ({ model, selectedRuleId, onSelectRule }) => {
  const ruleDescriptors = useMemo(() => {
    if (!model) {
      return [];
    }

    return (model.reactionRules ?? []).map((rule, index) => {
      const ruleId = rule.name ?? `rule_${index + 1}`;
      const displayName = rule.name ?? `Rule ${index + 1}`;
      let classification: RuleChangeSummary | null = null;
      try {
        classification = classifyRuleChanges(rule, { ruleId, ruleName: displayName });
      } catch (error) {
        console.warn('Failed to classify rule', ruleId, error);
      }

      return {
        id: ruleId,
        displayName,
        visualization: parseRuleForVisualization(rule, index),
        compact: buildCompactRule(rule, displayName),
        classification,
      };
    });
  }, [model]);

  if (!model) {
    return <div className="text-slate-500 dark:text-slate-400">Parse a model to visualize reaction rules.</div>;
  }

  if ((model.reactionRules ?? []).length === 0) {
    return <div className="text-slate-500 dark:text-slate-400">This model has no reaction rules defined.</div>;
  }

  return (
    <Tabs>
      <TabList>
        <Tab>Rule Cartoons</Tab>
        <Tab>Compact Rules</Tab>
      </TabList>
      <TabPanels>
        <TabPanel>
          <details open className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
            <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-100">Rule Cartoon key</summary>
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <li><strong>Molecules:</strong> boxes identify molecule types; grey shows unchanged context and colored boxes show affected or created molecules.</li>
              <li><strong>Sites:</strong> small circles are binding sites; labels such as <span className="font-mono">~P</span> and <span className="font-mono">~U</span> show states.</li>
              <li><strong>Bonds:</strong> lines connect bonded sites; matching BNGL labels such as <span className="font-mono">!1</span> mark the two bond ends.</li>
              <li><strong>Site marks:</strong> <span className="font-mono">–</span> means free, <span className="font-mono">🔗</span> means bound, and <span className="font-mono">?</span> allows either (BNGL wildcard).</li>
              <li><strong>Compact icons:</strong> 🔗 bind, ✂️ unbind, 🌀 state change; green highlights new bonds.</li>
            </ul>
          </details>
          <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-2">
            {ruleDescriptors.map((rule) => (
              <RuleCartoon
                key={rule.id}
                ruleId={rule.id}
                displayName={rule.displayName}
                rule={rule.visualization}
                isSelected={rule.id === selectedRuleId}
                onSelect={onSelectRule}
                classification={rule.classification}
              />
            ))}
          </div>
        </TabPanel>
        <TabPanel>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
            {ruleDescriptors.map((rule) => (
              <CompactRuleVisualization
                key={rule.id}
                rule={rule.compact}
                ruleId={rule.id}
                displayName={rule.displayName}
                isSelected={rule.id === selectedRuleId}
                onSelect={onSelectRule}
                classification={rule.classification}
              />
            ))}
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
};
