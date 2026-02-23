import React, { useState, useRef, useEffect } from 'react';
import { BNGLModel, SimulationOptions, SimulationResults } from '../types';
import { ResultsChart } from './ResultsChart';
import { ContactMapTab } from './tabs/ContactMapTab';
import { SteadyStateTab } from './tabs/SteadyStateTab';
import { FIMTab } from './tabs/FIMTab';
import { CartoonTab } from './tabs/CartoonTab';
import { RegulatoryTab } from './tabs/RegulatoryTab';
import { RulesTab } from './tabs/RulesTab';
import { VerificationTab } from './tabs/VerificationTab';
import { ParameterScanTab } from './tabs/ParameterScanTab';
import { ParameterEstimationTab } from './tabs/ParameterEstimationTab';
import { FluxAnalysisTab } from './tabs/FluxAnalysisTab';
import { ModelExplorerTab } from './tabs/ModelExplorerTab';
import { TrajectoryExplorerTab } from './tabs/TrajectoryExplorerTab';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { ExpressionInputPanel, CustomExpression } from './ExpressionInputPanel';
import { ComparisonPanel } from './ComparisonPanel';
import { JupyterExportTab } from './tabs/JupyterExportTab';
import { Dropdown, DropdownItem } from './ui/Dropdown';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { EmptyState } from './ui/EmptyState';
import { HelpSection } from './HelpSection';


interface VisualizationPanelProps {
  model: BNGLModel | null;
  results: SimulationResults | null;
  onSimulate: (options: SimulationOptions) => void;
  isSimulating: boolean;
  onCancelSimulation: () => void;
  simulationMethod?: 'ode' | 'ssa' | 'nf';
  activeTabIndex?: number;
  onActiveTabIndexChange?: (idx: number) => void;
  bnglCode?: string;
}

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${active
      ? 'border-teal-600 text-teal-600 dark:text-teal-400 dark:border-teal-400'
      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600'
      }`}
  >
    {children}
  </button>
);


export const VisualizationPanel: React.FC<VisualizationPanelProps> = ({
  model,
  results,
  onSimulate,
  isSimulating,
  onCancelSimulation,
  simulationMethod,
  activeTabIndex,
  onActiveTabIndexChange,
  bnglCode,
}) => {
  const [visibleSpecies, setVisibleSpecies] = useState<Set<string>>(new Set());
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [expressions, setExpressions] = useState<CustomExpression[]>([]);

  // Local active tab state if not controlled
  const [localActiveTab, setLocalActiveTab] = useState(0);
  const activeTab = activeTabIndex ?? localActiveTab;
  const setActiveTab = (idx: number) => {
    setLocalActiveTab(idx);
    onActiveTabIndexChange?.(idx);
  };

  const [networkViewMode, setNetworkViewMode] = useState<'regulatory' | 'rules' | 'contact'>('regulatory');

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

  // Tab definitions:
  // 0: Time Courses
  // 1: Network (Regulatory / Contact / Dynamics)
  // Analysis Group:
  // 2: Parameter Scan
  // 3: Steady State
  // 4: Identifiability (FIM)
  // 5: Parameter Estimation
  // 6: Flux Analysis
  // 7: Verification
  // 8: What-If Compare
  // 9: Rule Cartoons
  // 10: Model Explorer
  // 11: Trajectory Explorer
  // 12: Jupyter Export

  // Map activeTab to a group for UI highlighting
  const isAnalysisTab = activeTab >= 2 && activeTab <= 11;

  // Filter parameter names to only those used in seed species (as requested by user)
  const seedParameterNames = React.useMemo(() => {
    if (!bnglCode) return [];
    return BNGLParser.getSeedParameters(bnglCode);
  }, [bnglCode]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 border rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm relative">
      {/* Header / Tabs */}
      <div className="flex items-center justify-between px-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shrink-0 rounded-t-lg">
        <nav className="flex space-x-1" aria-label="Tabs">
          <TabButton active={activeTab === 0} onClick={() => setActiveTab(0)}>
            📈 Time Courses
          </TabButton>

          <TabButton active={activeTab === 1} onClick={() => setActiveTab(1)}>
            🔗 Network
          </TabButton>


          {/* Analysis Dropdown */}
          <div className="relative flex items-center">
            <Dropdown
              trigger={
                <button className={`flex items-center gap-1 py-2 px-3 border-b-2 font-medium text-sm transition-colors ${isAnalysisTab || activeTab === 10
                  ? 'border-teal-600 text-teal-600 dark:text-teal-400 dark:border-teal-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600'
                  }`}>
                  📊 Analysis
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
              }
            >
              <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Parameter Analysis</div>
              <DropdownItem onClick={() => setActiveTab(2)}>🔍 Parameter Scan</DropdownItem>
              <DropdownItem onClick={() => setActiveTab(3)}>⚖️ Steady State</DropdownItem>
              <DropdownItem onClick={() => setActiveTab(4)}>🎯 Sensitivity (FIM)</DropdownItem>
              <DropdownItem onClick={() => setActiveTab(5)}>🧬 Parameter Estimation</DropdownItem>

              <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
              <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Model Analysis</div>
              <DropdownItem onClick={() => setActiveTab(11)}>☄️ Trajectory Explorer</DropdownItem>
              <DropdownItem onClick={() => setActiveTab(6)}>🌊 Flux Analysis</DropdownItem>
              <DropdownItem onClick={() => setActiveTab(9)}>🎨 Rule Cartoons</DropdownItem>
              <DropdownItem onClick={() => setActiveTab(8)}>🤔 What-If Compare</DropdownItem>
              <DropdownItem onClick={() => setActiveTab(7)}>✅ Verification</DropdownItem>
              <div className="border-t border-slate-50 dark:border-slate-800/50 my-0.5" />
              <DropdownItem onClick={() => setActiveTab(10)}>🌎 Model Explorer</DropdownItem>
              <DropdownItem onClick={() => setActiveTab(12)}>📓 Jupyter Export</DropdownItem>
            </Dropdown>
          </div>

        </nav>

        {/* Network View Toggle - only visible on Network tab */}
        {activeTab === 1 && (
          <div className="flex bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 p-0.5 ml-auto my-1">
            <button
              onClick={() => setNetworkViewMode('regulatory')}
              className={`px-2 py-0.5 text-xs font-medium rounded ${networkViewMode === 'regulatory'
                ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              Regulatory
            </button>
            <button
              onClick={() => setNetworkViewMode('contact')}
              className={`px-2 py-0.5 text-xs font-medium rounded ${networkViewMode === 'contact'
                ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              Contact Map
            </button>

            <button
              onClick={() => setNetworkViewMode('rules')}
              className={`px-2 py-0.5 text-xs font-medium rounded ${networkViewMode === 'rules'
                ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              Rules
            </button>
          </div>
        )}
      </div>


      {/* Content Panels */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {activeTab === 0 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Time Courses"
              description="Visualize how your model's observables (species or groups of species) evolve over simulated time. This is the primary way to observe the dynamic behavior of your biological system."
              features={[
                "Real-time plotting of observables",
                "Custom mathematical expressions",
                "Toggle visibility of specific trajectories",
                "Export data as CSV or JSON"
              ]}
              plotDescription="The chart shows concentration (or molecular count) on the Y-axis vs. simulated time on the X-axis. Higher peaks represent higher abundance of that molecule at that specific time."
            />
            <div className="flex-1 min-h-0">
              <ResultsChart
                results={results}
                model={model}
                isNFsim={simulationMethod === 'nf'}
                visibleSpecies={visibleSpecies}
                onVisibleSpeciesChange={setVisibleSpecies}
                expressions={expressions}
              />
            </div>
            <div className="mt-4 shrink-0">
              <ExpressionInputPanel
                expressions={expressions}
                onExpressionsChange={handleExpressionsChange}
                observableNames={model?.observables?.map((o) => o.name) ?? []}
                parameterNames={seedParameterNames}
                speciesNames={results?.speciesHeaders ?? []}
                hasSpeciesData={!!results?.speciesData && results.speciesData.length > 0}
              />
            </div>
          </div>
        )}

        {activeTab === 1 && networkViewMode === 'regulatory' && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Regulatory Graph"
              description="A rule-level view of how reactions influence each other. This is different from a standard species-interaction network; it shows which rules enable (activate) or disable (inhibit) other rules."
              features={[
                "Activation (green +) and Inhibition (red -) edges",
                "Rule-to-observable mapping",
                "Interactive node dragging and zooming",
                "Rule classification by reaction type"
              ]}
              plotDescription="Green edges with '+' symbols represent activation (one rule produces a substrate for another). Red edges with '-' symbols represent inhibition (one rule consumes a substrate needed by another)."
            />
            <RegulatoryTab
              model={model}
              selectedRuleId={selectedRuleId}
              onSelectRule={setSelectedRuleId}
            />
          </div>
        )}

        {activeTab === 1 && networkViewMode === 'contact' && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Contact Map"
              description="The Contact Map provides a global view of the physical structure of your model. It shows every molecule type and all possible bonds between their components."
              features={[
                "Visualizes molecule site-map",
                "Shows potential binding interactions",
                "Highlights internal state changes",
                "Simplifies complex multi-state systems"
              ]}
              plotDescription="Shapes represent molecules, and internal port-dots represent sites. Lines between sites indicate that those two molecules can physically bind to each other."
            />
            <ContactMapTab model={model} onSelectRule={setSelectedRuleId} />
          </div>
        )}

        {activeTab === 1 && networkViewMode === 'rules' && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Rules Inspector"
              description="Follow specific site-level changes (atoms) through the simulation. This tool identifies exactly which bonds or states are modified by each rule and tracks their abundance over time."
              features={[
                "Track site-specific trajectories",
                "Classify rule impacts (bind/state/unbind)",
                "Identify producing/consuming rules",
                "Linked observable analysis"
              ]}
              plotDescription="The chart tracks observables linked to specific sites ('atoms'). Emerald badges show production, Sky badges show modifications, and Amber badges show consumption."
            />
            <RulesTab
              model={model}
              results={results}
              selectedRuleId={selectedRuleId}
              onSelectRule={setSelectedRuleId}
              simulationMethod={simulationMethod}
            />
          </div>
        )}

        {activeTab === 2 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Parameter Scan"
              description="Parameter scanning allows you to run multiple simulations automatically while varying a specific value. This is used to create dose-response curves and sensitivity maps."
              features={[
                "Scan multiple parameters",
                "Linear and Logarithmic scales",
                "Dose-response curve generation",
                "End-point vs. Time-course scans"
              ]}
              plotDescription="The X-axis represents the value of the parameter being scanned (e.g., drug concentration), and the Y-axis shows the resulting state of the system."
            />
            <ParameterScanTab model={model} />
          </div>
        )}

        {activeTab === 3 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Steady State"
              description="Find the long-term equilibrium where concentrations no longer change over time. This is useful for metabolic modeling and signaling homeostasis."
              features={[
                "Adaptive ODE-based equilibration",
                "Numerical convergence testing",
                "Relative abundance bar chart",
                "Export steady-state concentrations"
              ]}
              plotDescription="A vertical bar chart showing the final equilibrated concentration of every species. Use this to identify relative abundance in the steady-state network."
            />
            <SteadyStateTab
              model={model}
              results={results}
              onSimulate={onSimulate}
              onCancelSimulation={onCancelSimulation}
              isSimulating={isSimulating}
            />
          </div>
        )}

        {activeTab === 4 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Sensitivity (FIM)"
              description="Perform Global Identifiability Analysis using the Fisher Information Matrix. Determine if your parameters can be uniquely identified from your data."
              features={[
                "Eigenvalue spectrum analysis",
                "Parameter loading vectors",
                "Variance Inflation Factors (VIF)",
                "Correlation heatmaps"
              ]}
              plotDescription="The Eigenvalue spectrum shows which directions in parameter space are well-determined. Loading bars for each eigenvector identify which specific parameters contribute to uncertainty."
            />
            <FIMTab model={model} />
          </div>
        )}

        {activeTab === 5 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Parameter Estimation"
              description="Infer the parameter distributions that best explain your experimental data. This tool uses Variational Inference (VI) to estimate both the optimal value and the statistical uncertainty (Bayesian posterior) for each parameter."
              features={[
                "Bayesian Variational Inference",
                "Posteriors with 95% Credible Intervals",
                "ELBO-based convergence tracking",
                "Direct CSV experimental data import"
              ]}
              plotDescription="The 'ELBO Convergence' plot tracks the Evidence Lower Bound; as it increases and stabilizes, the model fit improves. The 'Posterior Estimates' chart displays the final estimated values along with their 95% uncertainty bars."
            />
            <ParameterEstimationTab model={model} />
          </div>
        )}

        {activeTab === 6 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Flux Analysis"
              description="Quantify the dynamic flow of material through each reaction. Identify which reactions are the main 'drivers' of the system at any given time point."
              features={[
                "Production vs. Consumption breakdown",
                "Time-point specific flux vectors",
                "Top-N reaction filtering",
                "Species-specific flux focus"
              ]}
              plotDescription="Green bars represent species production; Red bars represent consumption. The length of the bar indicates the magnitude of the flux (rate) at the selected time point."
            />
            <FluxAnalysisTab model={model} results={results} />
          </div>
        )}

        {activeTab === 7 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Verification"
              description="Verify model behavior by defining mathematical constraints. Ensure your system respects biological limits and physical laws like mass conservation throughout the simulation."
              features={[
                "Define conservation laws",
                "Mathematical constraint checking",
                "Time-point pass/fail details",
                "Automated model verification"
              ]}
              plotDescription="Constraints are evaluated at every time point. If a condition (like A + B == target) is violated anywhere, the specific failure time and reason will be highlighted."
            />
            <VerificationTab model={model} results={results} />
          </div>
        )}

        {activeTab === 8 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="What-If Compare"
              description="What-If comparison allows you to see the impact of any change side-by-side. Compare different genotypes, drug treatments, or initial concentrations in one view."
              features={[
                "Side-by-side comparison",
                "Snapshots of simulation runs",
                "Differential analysis",
                "Multi-state overlay"
              ]}
              plotDescription="Baseline results are shown as solid lines, while your modified 'What-If' results appear as dashed lines. This makes it easy to spot deviations."
            />
            <ComparisonPanel model={model} baseResults={results} />
          </div>
        )}

        {activeTab === 9 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Rule Cartoons"
              description="Visualize chemical reaction rules using standardized biological symbols. This view simplifies complex rules into intuitive 'cartoons' showing molecule binding, state changes, and transformations."
              features={[
                "Molecule-level symbol representation",
                "Visual binding/unbinding cues",
                "State-change highlight (🌀)",
                "Context vs. reactant distinction"
              ]}
              plotDescription="Reactant molecules (involved in the change) are shown in color, while context molecules (required but unchanged) are in gray. Icons like 🔗 (bind) and 🌀 (state) denote specific site-level actions."
            />
            <CartoonTab model={model} selectedRuleId={selectedRuleId} onSelectRule={setSelectedRuleId} />
          </div>
        )}

        {activeTab === 10 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Model Explorer"
              description="Browse nearly 200 published biological models. Use them as templates for your own research or as educational examples."
              features={[
                "Semantic Search by author or biology",
                "UMAP-based similarity map",
                "One-click loading and comparison",
                "Curated BNGL library"
              ]}
              plotDescription="The similarity map (UMAP) organizes models by their biological motifs. Clusters of models often share similar signaling mechanisms or reaction structures."
            />
            <ModelExplorerTab onLoadModel={(code, name, id) => {
              console.log("Model Explorer: request to load model", { name, id });
              // TODO: Implement model loading via custom event or prop callback
            }} />
          </div>
        )}

        {activeTab === 11 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Trajectory Explorer"
              description="In stochastic systems (SSA), every run is slightly different. The Trajectory Explorer allows you to inspect multiple individual runs to understand biological noise and variance."
              features={[
                "Multi-run stochastic analysis",
                "Variance and noise calculation",
                "Outlier detection",
                "Probability distribution views"
              ]}
              plotDescription="The UMAP map on the left shows how different stochastic runs cluster together. Selecting a run displays its specific observable trajectory on the right."
            />
            <TrajectoryExplorerTab model={model} />
          </div>
        )}

        {activeTab === 12 && (
          <div className="h-full flex flex-col">
            <HelpSection
              title="Jupyter Export"
              description="Transition from the web UI to professional data science. Export your entire session as a Python-based Jupyter Notebook for reproducibility and custom analysis."
              features={[
                "Standard .ipynb format",
                "Ready-to-run Python code",
                "Integrated with PyBioNetGen",
                "Publication-ready plotting code"
              ]}
              plotDescription="The preview window shows the exact code that will be generated. Once exported, you can run this in VS Code, Google Colab, or locally."
            />
            <JupyterExportTab model={model} bnglCode={bnglCode} />
          </div>
        )}


      </div>
    </div>
  );
};
