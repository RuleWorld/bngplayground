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
          <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">Compact rule icons: 🔗 bind • ✂️ unbind • 🌀 state change — green represents new bonds</div>
          <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">Legend: molecules use hashed colors; <span className="font-semibold">grey</span> molecules are context-only, <span className="font-semibold">colored</span> molecules are affected or created.</div>
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
