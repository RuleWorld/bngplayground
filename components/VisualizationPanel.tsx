import React, { useState } from 'react';
import { BNGLModel, SimulationOptions, SimulationResults } from '../types';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from './ui/Tabs';
import { ResultsChart } from './ResultsChart';
import { ContactMapTab } from './tabs/ContactMapTab';
import { SteadyStateTab } from './tabs/SteadyStateTab';
import { FIMTab } from './tabs/FIMTab';
import { CartoonTab } from './tabs/CartoonTab';
import { RegulatoryTab } from './tabs/RegulatoryTab';
import { VerificationTab } from './tabs/VerificationTab';
import { ParameterScanTab } from './tabs/ParameterScanTab';
import { ParameterEstimationTab } from './tabs/ParameterEstimationTab';
import { FluxAnalysisTab } from './tabs/FluxAnalysisTab';
import { ExpressionInputPanel, CustomExpression } from './ExpressionInputPanel';
import { ComparisonPanel } from './ComparisonPanel';


interface VisualizationPanelProps {
  model: BNGLModel | null;
  results: SimulationResults | null;
  onSimulate: (options: SimulationOptions) => void;
  isSimulating: boolean;
  onCancelSimulation: () => void;
  activeTabIndex?: number;
  onActiveTabIndexChange?: (idx: number) => void;

}

export const VisualizationPanel: React.FC<VisualizationPanelProps> = ({
  model,
  results,
  onSimulate,
  isSimulating,
  onCancelSimulation,
  activeTabIndex,
  onActiveTabIndexChange,

}) => {
  const [visibleSpecies, setVisibleSpecies] = useState<Set<string>>(new Set());
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [expressions, setExpressions] = useState<CustomExpression[]>([]);
  
  // Keep advanced tabs hidden by default (no persistence)
  const [showAdvancedTabs, setShowAdvancedTabs] = useState(false);

  React.useEffect(() => {
    if (model) {
      setVisibleSpecies(new Set(model.observables.map((o) => o.name)));
    } else {
      setVisibleSpecies(new Set());
    }
  }, [model]);

  // Wrapper to sync expression names with visibleSpecies for legend toggle
  const handleExpressionsChange = React.useCallback((newExpressions: CustomExpression[]) => {
    // Find newly added expressions and add them to visibleSpecies
    const newNames = newExpressions.map(e => e.name);
    const oldNames = expressions.map(e => e.name);

    setVisibleSpecies(prev => {
      const updated = new Set(prev);
      // Add new expression names
      newNames.forEach(name => {
        if (!oldNames.includes(name)) {
          updated.add(name);
        }
      });
      // Remove deleted expression names
      oldNames.forEach(name => {
        if (!newNames.includes(name)) {
          updated.delete(name);
        }
      });
      return updated;
    });

    setExpressions(newExpressions);
  }, [expressions]);

  React.useEffect(() => {
    if (!model || model.reactionRules.length === 0) {
      setSelectedRuleId(null);
      return;
    }

    setSelectedRuleId((prev) => {
      if (!prev) {
        return model.reactionRules[0].name ?? 'rule_1';
      }

      const hasRule = model.reactionRules.some((rule, index) => {
        const ruleId = rule.name ?? `rule_${index + 1}`;
        return ruleId === prev;
      });

      return hasRule ? prev : model.reactionRules[0].name ?? 'rule_1';
    });
  }, [model]);

  // Toggle advanced tabs visibility
  const toggleAdvancedTabs = () => {
    const newValue = !showAdvancedTabs;
    setShowAdvancedTabs(newValue);
    // Reset to first tab when collapsing to avoid index-out-of-bounds
    if (!newValue && activeTabIndex !== undefined && activeTabIndex > 2) {
      onActiveTabIndexChange?.(0);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <Tabs activeIndex={activeTabIndex} onActiveIndexChange={onActiveTabIndexChange}>
          <TabList>
            {/* Essential tabs - always visible (3 only) */}
            <Tab>Time Courses</Tab>
            <Tab>Parameter Scan</Tab>
            <Tab>Regulatory Graph</Tab>
            
            {/* Advanced tabs - conditionally visible */}
            {showAdvancedTabs && (
              <>
                <Tab>What-If Compare</Tab>
                <Tab>Contact Map</Tab>
                <Tab>Rule Cartoons</Tab>
                <Tab>Identifiability</Tab>
                <Tab>Steady State</Tab>
                <Tab>Parameter Estimation</Tab>
                <Tab>Flux Analysis</Tab>
                <Tab>Verification</Tab>
              </>
            )}
            
            {/* Toggle button styled as a tab */}
            <button
              onClick={toggleAdvancedTabs}
              className="ml-auto px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-b-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-colors flex items-center gap-1"
              title={showAdvancedTabs ? 'Hide advanced analysis tabs' : 'Show advanced analysis tabs'}
            >
              {showAdvancedTabs ? (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Fewer
                </>
              ) : (
                <>
                  More
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </TabList>
          
          <TabPanels>
            {/* Essential panel 1: Time Courses */}
            <TabPanel>
              <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                Time Courses – plot observables vs time
              </div>
              <ResultsChart
                results={results}
                model={model}
                visibleSpecies={visibleSpecies}
                onVisibleSpeciesChange={setVisibleSpecies}
                expressions={expressions}
              />
              <ExpressionInputPanel
                expressions={expressions}
                onExpressionsChange={handleExpressionsChange}
                observableNames={model?.observables?.map((o) => o.name) ?? []}
                hasSpeciesData={!!results?.speciesData && results.speciesData.length > 0}
              />
            </TabPanel>
            
            {/* Essential panel 2: Parameter Scan */}
            <TabPanel>
              <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                Parameter Scan – explore how observables change with parameter values
              </div>
              <ParameterScanTab model={model} />
            </TabPanel>
            
            {/* Essential panel 3: Regulatory Graph */}
            <TabPanel>
              <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                Regulatory Graph – how rules influence molecular states
              </div>
              <RegulatoryTab
                model={model}
                results={results}
                selectedRuleId={selectedRuleId}
                onSelectRule={setSelectedRuleId}
              />
            </TabPanel>
            
            {/* Advanced panels - only rendered when showAdvancedTabs is true */}
            {showAdvancedTabs && (
              <>
                <TabPanel>
                  <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                    What-If Compare – see how parameter changes affect simulation results
                  </div>
                  <ComparisonPanel model={model} baseResults={results} />
                </TabPanel>
                
                <TabPanel>
                  <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                    Contact Map – visualization of molecule interactions
                  </div>
                  <ContactMapTab model={model} onSelectRule={setSelectedRuleId} />
                </TabPanel>
                
                <TabPanel>
                  <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                    Rule Cartoons – compact visualization of rules and their effects
                  </div>
                  <CartoonTab model={model} selectedRuleId={selectedRuleId} onSelectRule={setSelectedRuleId} />
                </TabPanel>
                
                <TabPanel>
                  <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                    Identifiability – Fisher Information Matrix analysis for parameter sensitivity
                  </div>
                  <FIMTab model={model} />
                </TabPanel>
                
                <TabPanel>
                  <SteadyStateTab 
                    model={model} 
                    onSimulate={onSimulate} 
                    onCancelSimulation={onCancelSimulation} 
                    isSimulating={isSimulating} 
                  />
                </TabPanel>
                
                <TabPanel>
                  <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                    Parameter Estimation – fit parameters to experimental data
                  </div>
                  <ParameterEstimationTab model={model} />
                </TabPanel>
                
                <TabPanel>
                  <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                    Flux Analysis – visualize reaction flux contributions
                  </div>
                  <FluxAnalysisTab model={model} results={results} />
                </TabPanel>
                
                <TabPanel>
                  <VerificationTab model={model} results={results} />
                </TabPanel>
              </>
            )}
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
};
