import React, { Suspense, lazy, useState } from 'react';
import { BNGLModel, SimulationOptions, SimulationResults } from '../types';
import { ResultsChart } from './ResultsChart';
import { buildRuleOverlays } from '../services/visualization/buildRuleOverlays';
import { computeInfluenceGraph } from '../services/visualization/computeInfluence';
import { BNGLParser } from '@bngplayground/engine';
import { ExpressionInputPanel, CustomExpression } from './ExpressionInputPanel';
import { Dropdown, DropdownItem } from './ui/Dropdown';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { HelpSection } from './HelpSection';
import { ErrorBoundary } from './ui/ErrorBoundary';

const ContactMapTab = lazy(() => import('./tabs/ContactMapTab').then((module) => ({ default: module.ContactMapTab })));
const InfluenceGraphViewer = lazy(() => import('./InfluenceGraphViewer').then((module) => ({ default: module.InfluenceGraphViewer })));
const SteadyStateTab = lazy(() => import('./tabs/SteadyStateTab').then((module) => ({ default: module.SteadyStateTab })));
const FIMTab = lazy(() => import('./tabs/FIMTab').then((module) => ({ default: module.FIMTab })));
const CartoonTab = lazy(() => import('./tabs/CartoonTab').then((module) => ({ default: module.CartoonTab })));
const RegulatoryTab = lazy(() => import('./tabs/RegulatoryTab').then((module) => ({ default: module.RegulatoryTab })));
const RulesTab = lazy(() => import('./tabs/RulesTab').then((module) => ({ default: module.RulesTab })));
const VerificationTab = lazy(() => import('./tabs/VerificationTab').then((module) => ({ default: module.VerificationTab })));
const ParameterScanTab = lazy(() => import('./tabs/ParameterScanTab').then((module) => ({ default: module.ParameterScanTab })));
const ParameterEstimationTab = lazy(() => import('./tabs/ParameterEstimationTab').then((module) => ({ default: module.ParameterEstimationTab })));
const FluxAnalysisTab = lazy(() => import('./tabs/FluxAnalysisTab').then((module) => ({ default: module.FluxAnalysisTab })));
const SobolSensitivityTab = lazy(() => import('./tabs/SobolSensitivityTab').then((module) => ({ default: module.SobolSensitivityTab })));
const ProfileLikelihoodTab = lazy(() => import('./tabs/ProfileLikelihoodTab').then((module) => ({ default: module.ProfileLikelihoodTab })));
const ABCSMCTab = lazy(() => import('./tabs/ABCSMCTab').then((module) => ({ default: module.ABCSMCTab })));
const ModelExplorerTab = lazy(() => import('./tabs/ModelExplorerTab').then((module) => ({ default: module.ModelExplorerTab })));
const TrajectoryExplorerTab = lazy(() => import('./tabs/TrajectoryExplorerTab').then((module) => ({ default: module.TrajectoryExplorerTab })));
const ComparisonPanel = lazy(() => import('./ComparisonPanel').then((module) => ({ default: module.ComparisonPanel })));
const JupyterExportTab = lazy(() => import('./tabs/JupyterExportTab').then((module) => ({ default: module.JupyterExportTab })));
const NetworkAnalysisTab = lazy(() => import('./tabs/NetworkAnalysisTab').then((module) => ({ default: module.NetworkAnalysisTab })));
const SpatialPanel = lazy(() => import('./SpatialPanel').then((module) => ({ default: module.SpatialPanel })));
const BifurcationTab = lazy(() => import('./tabs/BifurcationTab').then((module) => ({ default: module.BifurcationTab })));
const TemporalAnalysisTab = lazy(() => import('./tabs/TemporalAnalysisTab').then((module) => ({ default: module.TemporalAnalysisTab })));
const VersionHistoryTab = lazy(() => import('./tabs/VersionHistoryTab').then((module) => ({ default: module.VersionHistoryTab })));
const MultiscaleTab = lazy(() => import('./tabs/MultiscaleTab').then((module) => ({ default: module.MultiscaleTab })));
const PKPDTab = lazy(() => import('./tabs/PKPDTab').then((module) => ({ default: module.PKPDTab })));
const RobustnessTab = lazy(() => import('./tabs/RobustnessTab').then((module) => ({ default: module.RobustnessTab })));



interface VisualizationPanelProps {
  model: BNGLModel | null;
  results: SimulationResults | null;
  onSimulate: (options: SimulationOptions, modelOverride?: BNGLModel, modelSourceOverride?: string) => void;
  isSimulating: boolean;
  onCancelSimulation: () => void;
  simulationMethod?: 'ode' | 'ssa' | 'pla' | 'psa' | 'nf' | 'nfsim';
  activeTabIndex?: number;
  onActiveTabIndexChange?: (idx: number) => void;
  bnglCode?: string;
  modelSource?: string | null;
  simulationOptions?: SimulationOptions | null;
  onLoadModel?: (code: string, name: string, id: string) => void;
}

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  id?: string;
  ariaControls?: string;
}> = ({ active, onClick, children, id, ariaControls }) => (
  <button
    role="tab"
    aria-selected={active}
    id={id}
    aria-controls={ariaControls}
    onClick={onClick}
    className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${active
      ? 'border-teal-600 text-teal-600 dark:text-teal-400 dark:border-teal-400'
      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:text-slate-200 dark:hover:border-slate-600'
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
  modelSource,
  simulationOptions,
  onLoadModel,
}) => {
  const [visibleSpecies, setVisibleSpecies] = useState<Set<string>>(new Set());
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [expressions, setExpressions] = useState<CustomExpression[]>([]);
  const reactionRules = React.useMemo(() => model?.reactionRules ?? [], [model?.reactionRules]);

  // Local active tab state if not controlled
  const [localActiveTab, setLocalActiveTab] = useState(0);
  const activeTab = activeTabIndex ?? localActiveTab;
  const setActiveTab = (idx: number) => {
    setLocalActiveTab(idx);
    onActiveTabIndexChange?.(idx);
  };

  const [networkViewMode, setNetworkViewMode] = useState<'regulatory' | 'rules' | 'contact' | 'influence' | 'analysis'>('regulatory');

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
    if (!model || reactionRules.length === 0) {
      setSelectedRuleId(null);
      return;
    }

    setSelectedRuleId((prev) => {
      if (!prev) {
        return null;
      }

      const hasRule = reactionRules.some((rule, index) => {
        const ruleId = rule.name ?? `rule_${index + 1}`;
        return ruleId === prev;
      });

      return hasRule ? prev : null;
    });
  }, [model, reactionRules]);

  // Tab definitions:
  // 0: Time Courses
  // 1: Network (Regulatory / Contact / Rules / Influence / Analysis)
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
  const isAnalysisTab = (activeTab >= 2 && activeTab <= 9) || activeTab >= 11;


  // Filter parameter names to only those used in seed species (as requested by user)
  const seedParameterNames = React.useMemo(() => {
    if (!bnglCode) return [];
    return BNGLParser.getSeedParameters(bnglCode);
  }, [bnglCode]);

  const influenceGraphData = React.useMemo(() => {
    if (activeTab !== 1 || networkViewMode !== 'influence' || !model || reactionRules.length === 0) {
      return { nodes: [], edges: [] };
    }
    const overlays = buildRuleOverlays(reactionRules);
    return computeInfluenceGraph(overlays, reactionRules);
  }, [activeTab, model, networkViewMode, reactionRules]);

  return (
    <div role="region" aria-label="Visualization panel" className="flex h-full min-h-0 flex-col gap-0 border rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm relative">
      {/* Header / Tabs */}
      <div className="flex items-center justify-between px-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 shrink-0 rounded-t-lg">
        <nav className="flex space-x-1" aria-label="Tabs" role="tablist">
          <TabButton active={activeTab === 0} onClick={() => setActiveTab(0)} id="viz-tab-0" ariaControls="viz-tabpanel-0">
            📈 Time Courses
          </TabButton>

          <TabButton active={activeTab === 1} onClick={() => setActiveTab(1)} id="viz-tab-1" ariaControls="viz-tabpanel-1">
            🔗 Network
          </TabButton>


          {/* Analysis Dropdown */}
          <div className="relative flex items-center">
            <Dropdown
              trigger={
                <button aria-label="Analysis options" aria-haspopup="menu" className={`flex items-center gap-1 py-2 px-3 border-b-2 font-medium text-sm transition-colors ${isAnalysisTab || activeTab === 10
                  ? 'border-teal-600 text-teal-600 dark:text-teal-400 dark:border-teal-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600'
                  }`}>
                  📊 Analysis
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-x-2" style={{ width: '28rem' }}>
                {/* Left column */}
                <div>
                  <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Parameter Analysis</div>
                  <DropdownItem onClick={() => setActiveTab(2)}>🔍 Parameter Scan</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(4)}>🎯 Local Sensitivity</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(14)}>📊 Global Sensitivity (Sobol)</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(5)}>🧬 Parameter Estimation (VI)</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(16)}>🎲 ABC-SMC (Inference)</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(15)}>📈 Profile Likelihood</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(3)}>⚖️ Steady State</DropdownItem>
                  <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                  <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Advanced</div>
                  <DropdownItem onClick={() => setActiveTab(18)}>🔀 Bifurcation Analysis</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(19)}>🎵 Temporal Info Theory</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(22)}>💊 PK/PD Framework</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(23)}>🛡️ Robustness Analysis</DropdownItem>
                </div>
                {/* Right column */}
                <div>
                  <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Model Analysis</div>
                  <DropdownItem onClick={() => setActiveTab(11)}>☄️ Trajectory Explorer</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(6)}>🌊 Flux Analysis</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(9)}>🎨 Rule Cartoons</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(8)}>🤔 What-If Compare</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(7)}>✅ Verification</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(10)}>🌎 Model Explorer</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(12)}>📓 Jupyter Export</DropdownItem>
                  <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                  <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Simulation</div>
                  <DropdownItem onClick={() => setActiveTab(17)}>🔬 Spatial Simulation</DropdownItem>
                  <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                  <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Experimental</div>
                  <DropdownItem onClick={() => setActiveTab(21)}>🧫 Multi-Scale Modeling</DropdownItem>
                  <DropdownItem onClick={() => setActiveTab(20)}>📜 Version History</DropdownItem>
                </div>
              </div>

            </Dropdown>
          </div>

        </nav>

        {/* Network View Toggle - only visible on Network tab */}
        {activeTab === 1 && (
          <div role="group" aria-label="Network View Mode" className="flex bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 p-0.5 ml-auto my-1 max-w-full min-w-0 overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => setNetworkViewMode('regulatory')}
              aria-pressed={networkViewMode === 'regulatory'}
              aria-label="Switch to Regulatory view"
              className={`px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${networkViewMode === 'regulatory'
                  ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100'
                }`}
            >
              Regulatory
            </button>
            <button
              onClick={() => setNetworkViewMode('contact')}
              aria-pressed={networkViewMode === 'contact'}
              aria-label="Switch to Contact Map view"
              className={`px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${networkViewMode === 'contact'
                ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100'
                }`}
            >
              Contact Map
            </button>

            <button
              onClick={() => setNetworkViewMode('rules')}
              aria-pressed={networkViewMode === 'rules'}
              aria-label="Switch to Rules view"
              className={`px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${networkViewMode === 'rules'
                ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100'
                }`}
            >
              Rules
            </button>

            <button
              onClick={() => setNetworkViewMode('influence')}
              aria-pressed={networkViewMode === 'influence'}
              aria-label="Switch to Influence view"
              className={`px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${networkViewMode === 'influence'
                ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100'
                }`}
            >
              Influence
            </button>
            <button
              onClick={() => setNetworkViewMode('analysis')}
              aria-pressed={networkViewMode === 'analysis'}
              aria-label="Switch to Analysis view"
              className={`px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${networkViewMode === 'analysis'
                ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100'
                }`}
            >
              Analysis
            </button>
          </div>
        )}
      </div>


      {/* Content Panels */}
      <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-300">Loading analysis…</div>}>
        {activeTab === 0 && (
          <div role="tabpanel" id="viz-tabpanel-0" aria-labelledby="viz-tab-0" aria-label="Time courses" className="flex-1 min-h-0 flex flex-col overflow-y-auto pb-2">
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
            <ErrorBoundary label="tab:time-courses">
              <div className="min-h-0 shrink-0">
                <ResultsChart
                  results={results}
                  model={model}
                  isNFsim={simulationMethod === 'nf'}
                  // PLA outputs stochastic count-style trajectories, so render with SSA chart semantics.
                  isSSA={simulationMethod === 'ssa' || simulationMethod === 'pla'}
                  visibleSpecies={visibleSpecies}
                  onVisibleSpeciesChange={setVisibleSpecies}
                  expressions={expressions}
                  modelSource={modelSource}
                  simulationOptions={simulationOptions}
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
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 1 && networkViewMode === 'regulatory' && (
          <div role="tabpanel" id="viz-tabpanel-1" aria-labelledby="viz-tab-1" aria-label="Regulatory graph" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
            <HelpSection
              title="Regulatory Graph"
              description="An atom-rule dependency view linking reaction rules to atomic patterns (sites, states, and bonds). This is different from the Influence graph: it shows structural dependencies between rules and patterns rather than activation/inhibition polarity."
              features={[
                "Directed dependencies between atomic patterns and rules",
                "Interaction and Context edge types",
                "Rule-to-observable mapping",
                "Interactive node dragging and zooming",
                "Rule classification by reaction type"
              ]}
              plotDescription="Purple nodes are rules and tan nodes are atomic patterns. Arrows indicate dependency flow between rules and patterns (for example, required context vs direct interaction). This plot does not encode activation/inhibition sign semantics."
            />
            <ErrorBoundary label="tab:regulatory">
              <RegulatoryTab
                model={model}
                selectedRuleId={selectedRuleId}
                onSelectRule={setSelectedRuleId}
                forceFitTrigger={`${activeTab}:${networkViewMode}:${model?.reactionRules?.length ?? 0}`}
              />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 1 && networkViewMode === 'contact' && (
          <div role="tabpanel" id="viz-tabpanel-1" aria-labelledby="viz-tab-1" aria-label="Contact map" className="flex-1 min-h-0 flex flex-col">
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
            <ErrorBoundary label="tab:contact-map">
              <ContactMapTab model={model} results={results} onSelectRule={setSelectedRuleId} />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 1 && networkViewMode === 'rules' && (
          <div role="tabpanel" id="viz-tabpanel-1" aria-labelledby="viz-tab-1" aria-label="Rules" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
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
            <ErrorBoundary label="tab:rules">
              <RulesTab
                model={model}
                results={results}
                selectedRuleId={selectedRuleId}
                onSelectRule={setSelectedRuleId}
                simulationMethod={simulationMethod}
              />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 1 && networkViewMode === 'influence' && (
          <div role="tabpanel" id="viz-tabpanel-1" aria-labelledby="viz-tab-1" aria-label="Influence graph" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
            <HelpSection
              title="Structural Influence Graph"
              description="Shows rule-to-rule causal relationships. An edge from rule A to rule B means A's structural changes can affect B's ability to fire."
              features={[
                "Green edges: activation (A creates what B needs)",
                "Magenta edges: inhibition (A destroys what B needs)",
                "Solid: definite, Dashed: possible",
                "Click a node to filter its connections"
              ]}
              plotDescription="Based on structural overlap between rule centers (changes) and contexts (requirements), ported from RuleBender's influence graph algorithm."
            />
            <ErrorBoundary label="tab:influence">
              <InfluenceGraphViewer
                graphData={influenceGraphData}
              />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 2 && (
          <div role="tabpanel" id="viz-tabpanel-2" aria-labelledby="viz-tab-2" aria-label="Parameter scan" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
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
            <ErrorBoundary label="tab:parameter-scan">
              <div className="flex-1 min-h-0">
                <ParameterScanTab model={model} bnglText={bnglCode} />
              </div>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 3 && (
          <div role="tabpanel" id="viz-tabpanel-3" aria-labelledby="viz-tab-3" aria-label="Steady state" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
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
            <ErrorBoundary label="tab:steady-state">
              <SteadyStateTab
                model={model}
                results={results}
                onSimulate={onSimulate}
                onCancelSimulation={onCancelSimulation}
                isSimulating={isSimulating}
                modelSource={modelSource}
                simulationOptions={simulationOptions}
              />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 4 && (
          <div role="tabpanel" id="viz-tabpanel-4" aria-labelledby="viz-tab-4" aria-label="Local sensitivity" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
            <HelpSection
              title="Local Sensitivity"
              description="Perform local sensitivity analysis using the Fisher Information Matrix (FIM). Determine if your parameters can be uniquely identified from your data."
              features={[
                "Eigenvalue spectrum analysis",
                "Parameter loading vectors",
                "Variance Inflation Factors (VIF)",
                "Correlation heatmaps"
              ]}
              plotDescription="The Eigenvalue spectrum shows which directions in parameter space are well-determined. Loading bars for each eigenvector identify which specific parameters contribute to uncertainty."
            />
            <ErrorBoundary label="tab:fim">
              <div className="flex-1 min-h-0">
                <FIMTab model={model} bnglText={bnglCode} />
              </div>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 5 && (
          <div role="tabpanel" id="viz-tabpanel-5" aria-labelledby="viz-tab-5" aria-label="Parameter estimation" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
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
            <ErrorBoundary label="tab:parameter-estimation">
              <div className="flex-1 min-h-0">
                <ParameterEstimationTab model={model} bnglText={bnglCode} />
              </div>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 6 && (
          <div role="tabpanel" id="viz-tabpanel-6" aria-labelledby="viz-tab-6" aria-label="Flux analysis" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
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
            <ErrorBoundary label="tab:flux-analysis">
              <div className="flex-1 min-h-0">
                <FluxAnalysisTab model={model} results={results} modelSource={modelSource} />
              </div>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 7 && (
          <div role="tabpanel" id="viz-tabpanel-7" aria-labelledby="viz-tab-7" aria-label="Verification" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
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
            <ErrorBoundary label="tab:verification">
              <div className="flex-1 min-h-0">
              <VerificationTab model={model} results={results} modelSource={modelSource} />
              </div>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 8 && (
          <div role="tabpanel" id="viz-tabpanel-8" aria-labelledby="viz-tab-8" aria-label="What-If comparison" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
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
            <ErrorBoundary label="tab:comparison">
              <div className="flex-1 min-h-0">
                <ComparisonPanel model={model} baseResults={results} bnglText={bnglCode} />
              </div>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 9 && (
          <div role="tabpanel" id="viz-tabpanel-9" aria-labelledby="viz-tab-9" aria-label="Rule cartoons" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
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
            <ErrorBoundary label="tab:cartoon">
              <CartoonTab model={model} selectedRuleId={selectedRuleId} onSelectRule={setSelectedRuleId} />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 10 && (
          <div role="tabpanel" id="viz-tabpanel-10" aria-labelledby="viz-tab-10" aria-label="Model explorer" className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
            <ErrorBoundary label="tab:model-explorer">
              <div className="flex-1 min-h-0">
                <ModelExplorerTab onLoadModel={onLoadModel} />
              </div>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 11 && (
          <div role="tabpanel" id="viz-tabpanel-11" aria-labelledby="viz-tab-11" aria-label="Trajectory explorer" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
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
            <ErrorBoundary label="tab:trajectory-explorer">
              <TrajectoryExplorerTab model={model} bnglText={bnglCode} />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 12 && (
          <div role="tabpanel" id="viz-tabpanel-12" aria-labelledby="viz-tab-12" aria-label="Jupyter export" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
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
            <ErrorBoundary label="tab:jupyter-export">
              <JupyterExportTab model={model} bnglCode={bnglCode} results={results} />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 1 && networkViewMode === 'analysis' && (
          <div role="tabpanel" id="viz-tabpanel-1" aria-labelledby="viz-tab-1" aria-label="Network analysis" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
            <HelpSection
              title="Network Analysis"
              description="Apply graph-theory algorithms to your reaction network. Compute centrality metrics (betweenness, PageRank, closeness), detect communities, and measure network connectivity."
              features={[
                "Community detection via label propagation",
                "Centrality: betweenness, closeness, PageRank",
                "Global/local clustering coefficients",
                "Three graph types: molecular, reaction, regulatory",
              ]}
              plotDescription="Nodes are colored by community and sized by PageRank. The degree distribution chart shows connectivity across the network."
            />
            <ErrorBoundary label="tab:network-analysis">
              <NetworkAnalysisTab model={model} bnglText={bnglCode} />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 13 && (
          // Legacy tab — redirect user to Network → Analysis view
          <div role="tabpanel" id="viz-tabpanel-13" aria-labelledby="viz-tab-13" aria-label="Network analysis redirect" className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-300">
            Network Analysis has moved to the
            <button
              className="mx-1 underline text-teal-600 dark:text-teal-400"
              onClick={() => { setActiveTab(1); setNetworkViewMode('analysis'); }}
              aria-label="Go to Network Analysis tab"
            >
              Network → Analysis
            </button>
            tab.
          </div>
        )}

        {activeTab === 14 && (
          <div role="tabpanel" id="viz-tabpanel-14" aria-labelledby="viz-tab-14" aria-label="Global sensitivity" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
            <HelpSection
              title="Global Sensitivity (Sobol)"
              description="Quantify how much each parameter contributes to the variance of your model outputs across its entire range. Sobol indices provide a robust way to identify the most (and least) influential parameters, accounting for non-linear interactions."
              features={[
                "Saltelli unbiased sampling",
                "First-order (S1) and Total-order (ST) indices",
                "Bootstrap confidence intervals",
                "Interaction effect identification"
              ]}
              plotDescription="Higher bars indicate parameters that dominate the model variance. If Total-order (ST) is significantly higher than First-order (S1), the parameter has strong non-linear interactions with others."
            />
            <ErrorBoundary label="tab:sobol-sensitivity">
              <div className="flex-1 min-h-0">
                <SobolSensitivityTab model={model} bnglText={bnglCode} />
              </div>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 15 && (
          <div role="tabpanel" id="viz-tabpanel-15" aria-labelledby="viz-tab-15" aria-label="Profile likelihood" className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <HelpSection
              title="Profile Likelihood"
              description="Evaluate the identifiability of your parameters. By 'stepping' through each parameter and re-optimizing the others, this analysis determines if a parameter is well-determined by your experimental data or if it's structurally/practically unidentifiable."
              features={[
                "Likelihood-ratio based confidence intervals",
                "Identifiability classification (Identifiable, Practical, Structural)",
                "Full profiling with re-optimization",
                "Threshold-based significance testing"
              ]}
              plotDescription="A sharp parabolic bowl indicates a well-identified parameter. A flat or shallow curve indicates unidentifiability, where multiple parameter combinations explain the data equally well."
            />
            <ErrorBoundary label="tab:profile-likelihood">
              <div className="flex-1 min-h-0 overflow-hidden">
                <ProfileLikelihoodTab model={model} bnglText={bnglCode} />
              </div>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 16 && (
          <div role="tabpanel" id="viz-tabpanel-16" aria-labelledby="viz-tab-16" aria-label="ABC-SMC inference" className="flex-1 min-h-0 flex flex-col overflow-y-auto">
            <HelpSection
              title="ABC-SMC (Bayesian Inference)"
              description="Approximate Bayesian Computation with Sequential Monte Carlo allows you to infer parameter distributions even without a defined likelihood function. It iteratively refines a population of particles (parameter sets) to match your experimental data."
              features={[
                "Likelihood-free Bayesian inference",
                "Iterative tolerance refinement (SMC)",
                "Full posterior distribution mapping",
                "Handles complex, non-Gaussian uncertainties"
              ]}
              plotDescription="The posterior distribution shows the range of values that are statistically consistent with your data. The narrower the peak, the more certain the inference."
            />
            <ErrorBoundary label="tab:abc-smc">
              <div className="flex-1 min-h-0">
                <ABCSMCTab model={model} bnglText={bnglCode} />
              </div>
            </ErrorBoundary>
          </div>
        )}
        {activeTab === 17 && (
          <div role="tabpanel" id="viz-tabpanel-17" aria-labelledby="viz-tab-17" aria-label="Spatial simulation" className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <HelpSection
              title="Spatial Simulation"
              description="Simulate your model in a 3D volume using particle-based Monte Carlo. Molecules diffuse, interact with compartment boundaries, and react upon collision."
              features={[
                "3D particle visualization (Three.js)",
                "Rule-based reaction resolution (ANTLR4)",
                "Auto-generated compartment geometry",
                "Brownian dynamics (MCell4-compatible)"
              ]}
              plotDescription="Dots represent individual molecule instances. The simulation handles spatial exclusion and diffusion-limited reactions."
            />
            <ErrorBoundary label="tab:spatial">
              <div className="flex-1 min-h-0">
                <SpatialPanel bnglText={bnglCode || ''} />
              </div>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 18 && (
          <div role="tabpanel" id="viz-tabpanel-18" aria-labelledby="viz-tab-18" aria-label="Bifurcation analysis" className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <BifurcationTab
              model={model}
              results={results}
              onSimulate={onSimulate}
              onCancelSimulation={onCancelSimulation}
              isSimulating={isSimulating}
              bnglText={bnglCode}
            />
          </div>
        )}
        {activeTab === 19 && (
          <div role="tabpanel" id="viz-tabpanel-19" aria-labelledby="viz-tab-19" aria-label="Temporal analysis" className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <TemporalAnalysisTab
              model={model}
              results={results}
              onSimulate={onSimulate}
              onCancelSimulation={onCancelSimulation}
              isSimulating={isSimulating}
              modelSource={modelSource}
            />
          </div>
        )}
        {activeTab === 20 && (
          <div role="tabpanel" id="viz-tabpanel-20" aria-labelledby="viz-tab-20" aria-label="Version history" className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <VersionHistoryTab
              model={model}
              bnglCode={bnglCode || ''}
              onCodeChange={(code: string) => onLoadModel?.(code, 'Loaded Version', '')}
              results={results}
              onSimulate={onSimulate}
              isSimulating={isSimulating}
            />
          </div>
        )}
        {activeTab === 21 && (
          <div role="tabpanel" id="viz-tabpanel-21" aria-labelledby="viz-tab-21" aria-label="Multiscale modeling" className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <MultiscaleTab bnglCode={bnglCode || ''} />
          </div>
        )}
        {activeTab === 22 && (
          <div role="tabpanel" id="viz-tabpanel-22" aria-labelledby="viz-tab-22" aria-label="PK/PD framework" className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <PKPDTab
              model={model}
              results={results}
              onSimulate={onSimulate}
              onCodeChange={(code: string) => onLoadModel?.(code, 'PK Model', '')}
              isSimulating={isSimulating}
              modelSource={modelSource}
            />
          </div>
        )}

        {activeTab === 23 && (
          <div role="tabpanel" id="viz-tabpanel-23" aria-labelledby="viz-tab-23" aria-label="Robustness analysis" className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <ErrorBoundary label="tab:robustness">
              <RobustnessTab model={model} bnglText={bnglCode} />
            </ErrorBoundary>
          </div>
        )}


        </Suspense>
      </div>
    </div>
  );
};
