import React, { useMemo } from 'react';
import { RuleChangeBadges, renderHumanSummary } from './RuleChangeBadges';
import type { RuleChangeSummary } from '../services/ruleAnalysis/ruleChangeTypes';
import { MoleculeGlyph } from './MoleculeGlyph';
import type {
  VisualizationComponentRole,
  VisualizationMolecule,
  VisualizationRule,
} from '../types/visualization';

const roleClasses: Record<'context' | 'transformed' | 'created', string> = {
  context: 'opacity-60 filter grayscale dark:opacity-60',
  transformed: 'opacity-100',
  created: 'opacity-100',
};

// removed MoleculeVisualizer; now render molecules via MoleculeGlyph

interface ComplexVisualizerProps {
  complex: VisualizationMolecule[];
  showBondLabels?: boolean;
}

const ComplexVisualizer: React.FC<ComplexVisualizerProps> = ({ complex, showBondLabels }) => (
  <div className="flex flex-wrap items-center gap-2">
    {complex.map((molecule, index) => (
      <React.Fragment key={`${molecule.name}-${index}`}>
        {(() => {
          const moleculeRole = molecule.components.every((c) => c.role === 'context') ? 'context' : 'transformed';
          return (
            <div className={`${roleClasses[moleculeRole]}`}>
              <MoleculeGlyph molecule={molecule} showBondLabels={showBondLabels} />
            </div>
          );
        })()}
        {index < complex.length - 1 && <span className="text-xl text-slate-400">•</span>}
      </React.Fragment>
    ))}
  </div>
);

type AnnotatedVisualization = {
  reactants: VisualizationMolecule[][];
  products: VisualizationMolecule[][];
};

const cloneMolecule = (
  molecule: VisualizationMolecule,
  defaultRole: VisualizationComponentRole
): VisualizationMolecule => ({
  ...molecule,
  components: molecule.components.map((component) => ({
    ...component,
    role: component.role ?? defaultRole,
  })),
});

export const annotateRule = (rule: VisualizationRule): AnnotatedVisualization => {
  const annotatedReactants = rule.reactants.map((complex) =>
    complex.map((molecule) => cloneMolecule(molecule, 'context'))
  );
  const annotatedProducts = rule.products.map((complex) =>
    complex.map((molecule) => cloneMolecule(molecule, 'created'))
  );

  annotatedReactants.forEach((complex, complexIdx) => {
    const productComplex = annotatedProducts[complexIdx] ?? [];
    const productMoleculesByName = new Map<string, number[]>();
    productComplex.forEach((candidate, idx) => {
      let arr = productMoleculesByName.get(candidate.name);
      if (!arr) {
        arr = [];
        productMoleculesByName.set(candidate.name, arr);
      }
      arr.push(idx);
    });

    complex.forEach((molecule, moleculeIdx) => {
      const annotatedReactant = annotatedReactants[complexIdx][moleculeIdx];
      const candidates = productMoleculesByName.get(molecule.name);
      const productMatchIdx = candidates && candidates.length > 0 ? candidates.shift()! : -1;

      if (productMatchIdx === -1) {
        annotatedReactant.components = annotatedReactant.components.map((component) => ({
          ...component,
          role: 'transformed',
        }));
        return;
      }

      const annotatedProduct = productComplex[productMatchIdx];
      const productComponentsByName = new Map<string, number[]>();
      annotatedProduct.components.forEach((candidate, idx) => {
        let arr = productComponentsByName.get(candidate.name);
        if (!arr) {
          arr = [];
          productComponentsByName.set(candidate.name, arr);
        }
        arr.push(idx);
      });
      const productComponentUsage = new Set<number>();

      annotatedReactant.components = annotatedReactant.components.map((component) => {
        const compCandidates = productComponentsByName.get(component.name);
        const candidateIdx = compCandidates && compCandidates.length > 0 ? compCandidates.shift()! : -1;

        if (candidateIdx === -1) {
          return { ...component, role: 'transformed' };
        }

        productComponentUsage.add(candidateIdx);
        const productComponent = annotatedProduct.components[candidateIdx];
        const stateChanged = (component.state ?? '') !== (productComponent.state ?? '');
        const bondChanged = (component.bondLabel ?? '') !== (productComponent.bondLabel ?? '');
        const role: VisualizationComponentRole = stateChanged || bondChanged ? 'transformed' : 'context';

        annotatedProduct.components[candidateIdx] = {
          ...productComponent,
          role: role === 'context' ? 'context' : 'transformed',
        };

        return { ...component, role };
      });

      annotatedProduct.components = annotatedProduct.components.map((component, idx) => {
        if (!productComponentUsage.has(idx)) {
          return { ...component, role: component.role ?? 'created' };
        }
        if (component.role === 'transformed') {
          return component;
        }
        return { ...component, role: component.role ?? 'context' };
      });
    });
  });

  return {
    reactants: annotatedReactants,
    products: annotatedProducts,
  };
};

interface RuleCartoonProps {
  ruleId: string;
  displayName: string;
  rule: VisualizationRule;
  isSelected?: boolean;
  onSelect?: (ruleId: string) => void;
  showBondLabels?: boolean;
  classification?: RuleChangeSummary | null;
}

/**
 * ⚡ Bolt Performance Optimization:
 * Wrapped RuleCartoon in React.memo to prevent unnecessary re-renders
 * when the parent component (e.g., CartoonTab) re-renders, such as when
 * the selected rule changes. Since these components can be numerous and
 * their props are generally stable (except for isSelected), this saves
 * significant reconciliation time.
 */
export const RuleCartoon = React.memo<RuleCartoonProps>(({
  ruleId,
  displayName,
  rule,
  isSelected = false,
  onSelect,
  showBondLabels = true,
  classification,
}) => {
  const annotated = useMemo(() => annotateRule(rule), [rule]);

  const containerClasses = `w-full rounded-lg border bg-slate-50 dark:bg-slate-900/50 p-4 text-left transition dark:bg-slate-900 ${
    isSelected
      ? 'border-sky-500 ring-2 ring-offset-2 ring-sky-500 dark:border-sky-400 dark:ring-offset-slate-900'
      : 'border-stone-200 hover:border-slate-300 dark:border-slate-600 dark:border-slate-700 dark:hover:border-slate-600'
  }`;

  const handleSelect = () => {
    onSelect?.(ruleId);
  };

  return (
    <button type="button" className={containerClasses} onClick={handleSelect} aria-label={`Select rule ${displayName}`}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{displayName}</span>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-300">{rule.rate}</span>
      </div>
      {rule.comment && (
        <div className="mb-2 text-xs text-slate-500 dark:text-slate-300 italic">{rule.comment}</div>
      )}
      {classification && (
        <div className="mb-4 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 p-2 text-xs text-slate-600 dark:text-slate-300 shadow-inner dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <RuleChangeBadges summary={classification} size="xs" />
          </div>
          <p className="text-[11px] leading-4 text-slate-600 dark:text-slate-300">{renderHumanSummary(classification)}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-6">
        <div className="flex flex-wrap items-center gap-3">
          {annotated.reactants.map((complex, index) => (
            <React.Fragment key={`reactant-${index}`}>
              <ComplexVisualizer complex={complex} showBondLabels={showBondLabels} />
              {index < annotated.reactants.length - 1 && (
                <span className="text-2xl font-light text-slate-400">+</span>
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="flex flex-col items-center gap-1 text-slate-500 dark:text-slate-300">
          <svg className="h-6 w-16" viewBox="0 0 64 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M2 12H60M60 12L52 4M60 12L52 20"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {rule.isBidirectional && rule.reverseRate && (
            <>
              <svg className="h-6 w-16 rotate-180" viewBox="0 0 64 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M2 12H60M60 12L52 4M60 12L52 20"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-300">{rule.reverseRate}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {annotated.products.map((complex, index) => (
            <React.Fragment key={`product-${index}`}>
              <ComplexVisualizer complex={complex} showBondLabels={showBondLabels} />
              {index < annotated.products.length - 1 && (
                <span className="text-2xl font-light text-slate-400">+</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </button>
  );
});

export const EnhancedRuleCartoon = RuleCartoon;
