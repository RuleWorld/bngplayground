import { useState, useCallback, useRef, useEffect } from 'react';
import { EditorPanel } from './components/EditorPanel';
import { DesignerPanel } from './components/DesignerPanel';
import { VisualizationPanel } from './components/VisualizationPanel';
import { Header } from './components/Header';
import { exportToSBML } from './services/exportSBML';
import { StatusMessage } from './components/ui/StatusMessage';
import { AboutModal } from './components/AboutModal';
import { bnglService } from './services/bnglService';
import { exportToNet } from './services/exportNet';
import { exportToSedML } from './services/exportSedML';
import { exportToOMEX } from './services/exportOMEX';
import { VSCodeAnalysisPayload } from './components/VSCodeExportModal';
import { BNGLModel, SimulationOptions, SimulationResults, Status, ValidationWarning, EditorMarker } from './types';
import { loadModelCode, setCachedCode, getCachedCode } from './services/modelLoader';
import { loadModelCatalog, getModelCatalogSync, findCatalogExampleByQuery, type CatalogExample } from './services/modelCatalog';

import SimulationModal from './components/SimulationModal';
import { BNGLParser } from '@bngplayground/engine';
import { validateBNGLModel, validationWarningsToMarkers } from './services/modelValidation';
import { lintBNGL, lintDiagnosticsToMarkers } from './services/bnglLinter';
import { getSharedModelFromUrl, clearModelFromUrl } from './src/utils/shareUrl';
import { resolveAutoMethod, getSimulationOptionsFromParsedModel } from '@bngplayground/engine';
import { parseParametersFromCode, isNumericLiteral, stripParametersBlock } from '@bngplayground/engine';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

const normalizeCode = (value: string) => value.replace(/\r\n/g, '\n').trim();
const SBML_IMPORT_TIMEOUT_MS = 45_000;
const INITIAL_BNGL_CODE = '';

const shouldGenerateNetworkForSimulation = (
  model: BNGLModel,
  method: 'ode' | 'ssa' | 'pla' | 'nf' | 'nfsim'
) => {
  if (method === 'nf' || method === 'nfsim') return false;
  if ((model.reactions?.length ?? 0) > 0) return false;
  return (model.reactionRules?.length ?? 0) > 0;
};

const getNetworkGenerationOptions = (model: BNGLModel) => ({
  maxSpecies: model.networkOptions?.maxSpecies ?? 2000,
  maxReactions: model.networkOptions?.maxReactions ?? 5000,
  maxIterations: model.networkOptions?.maxIter ?? 1000,
  maxAgg: model.networkOptions?.maxAgg ?? 500,
  ...(model.networkOptions?.maxStoich !== undefined ? { maxStoich: model.networkOptions.maxStoich as any } : {}),
});

const mergeExpandedNetworkIntoModel = (model: BNGLModel, expanded: BNGLModel): BNGLModel => ({
  ...model,
  ...(expanded.reactions ? { reactions: expanded.reactions } : {}),
  ...(expanded.species ? { species: expanded.species } : {}),
  ...((expanded as any).concreteObservables ? { concreteObservables: (expanded as any).concreteObservables } : {}),
});

const findExampleById = (id?: string | null) => {
  if (!id) return undefined;
  return getModelCatalogSync()?.examples.find((example) => example.id === id);
};

function App() {
  const PANEL_MAX_HEIGHT = 'calc(100vh - 120px)';
  const PANEL_MIN_HEIGHT = '0px';
  const MIN_SPLIT_POSITION = 18; // percentage
  const MAX_SPLIT_POSITION = 82; 
  const [code, setCode] = useState<string>(INITIAL_BNGL_CODE);
  // Refs for editor/code diffing and debounce timer for parameter-only edits
  const codeRef = useRef<string>(INITIAL_BNGL_CODE);
  const paramPatchTimerRef = useRef<number | null>(null);
  const [model, setModel] = useState<BNGLModel | null>(null);
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  // Split Panel resizing state
  const [splitPosition, setSplitPosition] = useState(50); // percentage of screen
  const isResizingRef = useRef(false);

  const [isSimulating, setIsSimulating] = useState(false);
  const [currentMethod, setCurrentMethod] = useState<'ode' | 'ssa' | 'pla' | 'nf' | 'nfsim'>('ode');
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [progressStats, setProgressStats] = useState<{ species: number; reactions: number; iteration: number }>({ species: 0, reactions: 0, iteration: 0 });
  const [simulationProgress, setSimulationProgress] = useState<number | undefined>(0);
  const [simulationTime, setSimulationTime] = useState<number | undefined>(0);
  const [simulationTimeLabel, setSimulationTimeLabel] = useState<string | undefined>(undefined);
  const [simOptions, setSimOptions] = useState<SimulationOptions | null>(null);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [aboutFocus, setAboutFocus] = useState<string | null>(null);
  const [activeVizTab, setActiveVizTab] = useState<number>(0);
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>([]);
  const [editorMarkers, setEditorMarkers] = useState<EditorMarker[]>([]);
  const [loadedModelName, setLoadedModelName] = useState<string | null>(null);
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [defaultCatalogModelId, setDefaultCatalogModelId] = useState<string | null>(null);
  const [editorResetKey, setEditorResetKey] = useState<number>(0);

  useEffect(() => {
    const unsub = bnglService.onProgress((payload) => {
      const progress = payload ?? {};

      if (typeof progress.message === 'string') setGenerationProgress(progress.message);
      if (progress.species !== undefined) {
        setProgressStats(prev => ({ ...prev, species: progress.species }));
      }
      if (progress.reactions !== undefined) {
        setProgressStats(prev => ({ ...prev, reactions: progress.reactions }));
      }
      if (progress.iteration !== undefined) {
        setProgressStats(prev => ({ ...prev, iteration: progress.iteration }));
      }
      if (progress.simulationProgress !== undefined) {
        setSimulationProgress(progress.simulationProgress);
      }
      if (progress.simulationTime !== undefined) {
        setSimulationTime(progress.simulationTime);
      }
      if (typeof progress.message === 'string' && (progress.source === 'nfsim-progress' || progress.source === 'nfsim-console')) {
        // Try to extract time label for display
        const tm = progress.message.match(/(?:^|\b)Sim\s*time\s*[:=]\s*([0-9.eE+-]+)/i) ||
          progress.message.match(/\bt\s*=\s*([0-9.eE+-]+)/i);
        if (tm) setSimulationTimeLabel(tm[1]);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = bnglService.onWarning((payload) => {
      const warning = payload && typeof payload === 'object'
        ? (typeof (payload as { warning?: unknown }).warning === 'string'
          ? (payload as { warning: string }).warning
          : typeof (payload as { message?: unknown }).message === 'string'
            ? (payload as { message: string }).message
            : null)
        : null;

      simulationWarningRef.current = warning;
    });

    return unsub;
  }, []);

  const [editorSelection] = useState<{ startLineNumber: number; endLineNumber: number } | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'code' | 'design'>('code');
  // Store designer text separately so switching modes doesn't lose content
  const [designerText, setDesignerText] = useState<string>('');
  const [designerModelName, setDesignerModelName] = useState<string | null>(null);

  const parseAbortRef = useRef<AbortController | null>(null);
  const simulateAbortRef = useRef<AbortController | null>(null);
  const simOptionsRef = useRef<SimulationOptions | null>(null);
  const simulationWarningRef = useRef<string | null>(null);

  // Editor resizing support
  const [lastResized, setLastResized] = useState<number>(Date.now());
  const [editorWidth, setEditorWidth] = useState(0);
  const isCollapsed = editorWidth > 0 && editorWidth < 180;
  const editorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editorContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setLastResized(Date.now());
      if (entries[0]) {
        setEditorWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(editorContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleMouseDown = useCallback(() => {
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleDesignerModelNameChange = useCallback((name: string | null) => {
    setDesignerModelName(name);
    setLoadedModelName(name);
  }, []);

  const handleViewModeChange = useCallback((mode: 'code' | 'design') => {
    setViewMode(mode);
    if (mode === 'design') {
      setLoadedModelId(null);
      setLoadedModelName(designerModelName);
    }
  }, [designerModelName]);

  const handleMouseUp = useCallback(() => {
    isResizingRef.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
    setLastResized(Date.now());
  }, []);

  const mouseMoveRAF = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) return;
    
    if (mouseMoveRAF.current) {
        cancelAnimationFrame(mouseMoveRAF.current);
    }

    mouseMoveRAF.current = requestAnimationFrame(() => {
        const percentage = (e.clientX / window.innerWidth) * 100;
        if (percentage < 8) setSplitPosition(5); // Collapse
        else if (percentage < MIN_SPLIT_POSITION) setSplitPosition(MIN_SPLIT_POSITION); // Enforce min width
        else if (percentage > MAX_SPLIT_POSITION) setSplitPosition(MAX_SPLIT_POSITION);
        else setSplitPosition(percentage);
    });
  }, [MIN_SPLIT_POSITION, MAX_SPLIT_POSITION]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (mouseMoveRAF.current) cancelAnimationFrame(mouseMoveRAF.current);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    simOptionsRef.current = simOptions;
  }, [simOptions]);

  // --- Handlers (hoisted to prevent initialization errors in effects) ---

  // parse the current code or an explicitly supplied string.  the
  // optional argument is useful when callers set the code and immediately
  // want to parse the new text without waiting for React state to propagate.
  const handleParse = useCallback(async (codeOverride?: any): Promise<BNGLModel | null> => {
    setResults(null);
    if (parseAbortRef.current) {
      parseAbortRef.current.abort('Parse request replaced.');
    }
    const controller = new AbortController();
    parseAbortRef.current = controller;
    // prefer the override if it's a string, otherwise use latest state value.
    // this handles cases where it's used as an onClick handler (receiving an event).
    const source = (typeof codeOverride === 'string') ? codeOverride : codeRef.current;
    try {
      const parsedModel = await bnglService.parse(source, {
        signal: controller.signal,
        description: 'Parse BNGL model',
      });
      setModel(parsedModel);
      const warnings = validateBNGLModel(parsedModel);
      setValidationWarnings(warnings);
      const lintResult = lintBNGL(parsedModel, {}, source);
      const combinedMarkers = [
        ...validationWarningsToMarkers(source, warnings),
        ...lintDiagnosticsToMarkers(source, lintResult.diagnostics),
      ];
      setEditorMarkers(combinedMarkers);
      const hasValidationErrors = warnings.some((warning) => warning.severity === 'error');
      const hasLintErrors = lintResult.summary.errors > 0;
      const statusType = hasValidationErrors || hasLintErrors ? 'warning' : 'success';
      const lintIssueCount = lintResult.diagnostics.length;
      const lintSummaryMessage = lintIssueCount
        ? ` Linter: ${lintResult.summary.errors} errors, ${lintResult.summary.warnings} warnings, ${lintResult.summary.info} info.`
        : '';
      const baseMessage = hasValidationErrors
        ? 'Model parsed with validation issues. Review the warnings panel.'
        : 'Model parsed successfully!';
      setStatus({ type: statusType, message: `${baseMessage}${lintSummaryMessage}` });
      return parsedModel;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }
      setModel(null);
      setValidationWarnings([]);
      setEditorMarkers([]);
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      setStatus({ type: 'error', message: `Parsing failed: ${message}` });
      return null;
    } finally {
      if (parseAbortRef.current === controller) {
        parseAbortRef.current = null;
      }
    }
  }, []);

  const handleSimulate = useCallback(async (options: SimulationOptions, modelOverride?: BNGLModel) => {
    const targetModel = modelOverride || model;
    if (!targetModel) {
      setStatus({ type: 'warning', message: 'Please parse a model before simulating.' });
      return;
    }
    // Estimate complexity and warn user for large models
    const estimateComplexity = (m: BNGLModel): number => {
      const ruleCount = m.reactionRules?.length ?? 0;
      const seedCount = m.species?.length ?? 0;
      const molTypeCount = m.moleculeTypes?.length ?? 0;
      // Heuristic: seeds × rules^1.5 × molTypes
      return seedCount * Math.pow(Math.max(1, ruleCount), 1.5) * Math.max(1, molTypeCount);
    };

    const complexity = estimateComplexity(targetModel);
    if (complexity > 150) {
      const proceed = window.confirm(
        `⚠️ Large Model Detected\n\n` +
        `Complexity score: ${Math.round(complexity)}\n` +
        `• ${targetModel.reactionRules?.length ?? 0} rules\n` +
        `• ${targetModel.species.length} seed species\n` +
        `• ${targetModel.moleculeTypes.length} molecule types\n\n` +
        `Network generation may take 30-60 seconds. Continue?`
      );
      if (!proceed) return;
    }
    if (simulateAbortRef.current) {
      simulateAbortRef.current.abort('Simulation replaced.');
    }
    const controller = new AbortController();
    simulateAbortRef.current = controller;
    simulationWarningRef.current = null;

    // Resolve effective method (e.g. handle 'default' -> 'nf' if model has simulate_nf)
    const effectiveMethod = resolveAutoMethod(targetModel, options.method);
    setCurrentMethod(effectiveMethod);
    setSimOptions(options);
    setIsSimulating(true);
    try {
      let simulationModel = targetModel;

      if (shouldGenerateNetworkForSimulation(targetModel, effectiveMethod)) {
        setGenerationProgress('Generating network...');
        const expandedModel = await bnglService.generateNetwork(targetModel, getNetworkGenerationOptions(targetModel), {
          signal: controller.signal,
          description: `Network generation (${effectiveMethod})`,
        });
        simulationModel = mergeExpandedNetworkIntoModel(targetModel, expandedModel);
      }

      const simResults = await bnglService.simulate(simulationModel, options, {
        signal: controller.signal,
        description: `Simulation (${effectiveMethod})`,
      });
      setResults(simResults);
      const simulationWarning = simulationWarningRef.current;
      if (simulationWarning) {
        setStatus({ type: 'warning', message: `Simulation (${effectiveMethod}) completed with warning: ${simulationWarning}` });
      } else {
        setStatus({
          type: 'success', message: (
            <span>
              Simulation ({effectiveMethod}) completed.&nbsp;
              Explore: <button className="underline" onClick={() => setActiveVizTab(0)}>Time Courses</button>,{' '}
              <button className="underline" onClick={() => setActiveVizTab(2)}>Regulatory Graph</button>
            </span>
          )
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setResults(null);
        return;
      }
      setResults(null);
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      setStatus({ type: 'error', message: `Simulation failed: ${message}` });
    } finally {
      if (simulateAbortRef.current === controller) {
        simulateAbortRef.current = null;
      }
      setIsSimulating(false);
    }
  }, [model]);

  const handleQuickRun = async () => {
    const parsedModel = await handleParse();
    if (parsedModel) {
      const opts = getSimulationOptionsFromParsedModel(parsedModel, 'default');
      await handleSimulate(opts, parsedModel);
    }
  };

  // Apply numeric parameter changes in-place without reparsing/simulating. Re-resolves dependent params and species initial concentrations.
  async function applyParameterPatch(changes: Map<string, string>, currentModel: BNGLModel | null) {
    if (!currentModel) return;
    try {
      // Merge changes; treat changed numeric values as base values
      const baseParams: Record<string, number> = { ...currentModel.parameters };
      for (const [k, v] of changes) {
        const val = parseFloat(v);
        if (!isNaN(val)) baseParams[k] = val;
      }

      // Re-resolve paramExpressions (if present) iteratively like parser does
      const paramExprs = (currentModel as any).paramExpressions || {};
      const resolved: Record<string, number> = { ...baseParams };
      const maxPasses = 10;
      for (let pass = 0; pass < maxPasses; pass++) {
        let changed = false;
        for (const [name, expr] of Object.entries(paramExprs)) {
          if (resolved[name] !== undefined) continue;
          try {
            const paramMap = new Map(Object.entries(resolved));
            const val = (BNGLParser as any).evaluateExpression(expr, paramMap);
            if (!isNaN(val)) {
              resolved[name] = val;
              changed = true;
            }
          } catch {
            // ignore failures until later passes
          }
        }
        if (!changed) break;
      }

      // Assign resolved params back to model.parameters
      currentModel.parameters = { ...currentModel.parameters, ...resolved };

      // Evaluate species initialExpression if present
      const funcMap = new Map((currentModel.functions || []).map(f => [f.name, { args: f.args, expr: f.expression } as any]));
      for (const sp of currentModel.species) {
        if (sp.initialExpression) {
          try {
            const val = (BNGLParser as any).evaluateExpression(sp.initialExpression, new Map(Object.entries(currentModel.parameters)), new Set(), funcMap);
            if (!isNaN(val)) sp.initialConcentration = val;
          } catch {
            // ignore expression eval errors
          }
        }
      }

      // Update state to reflect parameter-only changes; do not reparse or simulate
      setModel({ ...currentModel });

      // Re-run validation and lint so editor markers update (but do not run network generation/simulation)
      const warnings = validateBNGLModel(currentModel);
      setValidationWarnings(warnings);
      const lintResult = lintBNGL(currentModel);
      setEditorMarkers([
        ...validationWarningsToMarkers(codeRef.current, warnings),
        ...lintDiagnosticsToMarkers(codeRef.current, lintResult.diagnostics),
      ]);

      setStatus({ type: 'success', message: `Updated ${changes.size} parameter${changes.size === 1 ? '' : 's'} (no reparse)` });

      // If we already have simulation results and options, re-solve without re-parsing (debounced upstream)
      if (results && simOptionsRef.current) {
        void runSimulationForParameterUpdate(currentModel, simOptionsRef.current);
      }
    } catch (e) {
      console.warn('Parameter patch failed:', e);
      setStatus({ type: 'warning', message: 'Parameter update failed; consider re-parsing the model.' });
    }
  }

  const runSimulationForParameterUpdate = async (updatedModel: BNGLModel, options: SimulationOptions) => {
    if (simulateAbortRef.current) {
      simulateAbortRef.current.abort('Parameter update replaced.');
    }
    const controller = new AbortController();
    simulateAbortRef.current = controller;
    setIsSimulating(true);
    setStatus({ type: 'info', message: 'Updating simulation for parameter change...' });
    try {
      const effectiveMethod = resolveAutoMethod(updatedModel, options.method);
      let simulationModel = updatedModel;

      if (shouldGenerateNetworkForSimulation(updatedModel, effectiveMethod)) {
        setGenerationProgress('Generating network...');
        const expandedModel = await bnglService.generateNetwork(updatedModel, getNetworkGenerationOptions(updatedModel), {
          signal: controller.signal,
          description: `Network generation (${effectiveMethod}, parameter update)`,
        });
        simulationModel = mergeExpandedNetworkIntoModel(updatedModel, expandedModel);
      }

      const simResults = await bnglService.simulate(simulationModel, options, {
        signal: controller.signal,
        description: 'Simulation (parameter update)',
      });
      setResults(simResults);
      setStatus({ type: 'success', message: 'Simulation updated for parameter change.' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      setStatus({ type: 'warning', message: `Parameter update simulation failed: ${message}` });
    } finally {
      if (simulateAbortRef.current === controller) {
        simulateAbortRef.current = null;
      }
      setIsSimulating(false);
    }
  };

  const handleCancelSimulation = useCallback(() => {
    if (simulateAbortRef.current) {
      simulateAbortRef.current.abort('Simulation cancelled by user.');
      simulateAbortRef.current = null;
    }
    // Force reset state immediately when user cancels
    setIsSimulating(false);
    setGenerationProgress('');
    setProgressStats({ species: 0, reactions: 0, iteration: 0 });
    setStatus({ type: 'info', message: 'Simulation cancelled.' });
  }, []);

  // --- Effects and other logic ---

  // Remove the parameters block from source for equality checks

  // Called by the editor on every change. If the change is strictly numeric parameter edits
  // (nothing else changed), apply them analytically after a 500ms debounce without reparsing/simulating.
  const handleEditorCodeChange = useCallback((newCode: string) => {
    const prev = codeRef.current || '';
    // Update UI code immediately
    setCode(newCode);
    codeRef.current = newCode;

    // Quick check: if there's no parsed model, don't attempt fast param update
    if (!model) {
      // Cancel any pending parameter patch
      if (paramPatchTimerRef.current) {
        window.clearTimeout(paramPatchTimerRef.current);
        paramPatchTimerRef.current = null;
      }
      return;
    }

    // If non-parameter blocks changed, abort fast-path
    const prevStripped = stripParametersBlock(prev);
    const newStripped = stripParametersBlock(newCode);
    if (prevStripped !== newStripped) {
      if (paramPatchTimerRef.current) {
        window.clearTimeout(paramPatchTimerRef.current);
        paramPatchTimerRef.current = null;
      }
      return; // other blocks changed
    }

    // Compare parameter maps
    const prevParams = parseParametersFromCode(prev);
    const newParams = parseParametersFromCode(newCode);

    // If sizes equal and every key either unchanged or changed to a numeric literal, we can fast-path
    const changes = new Map<string, string>();
    for (const [k, v] of newParams) {
      const prevVal = prevParams.get(k);
      if (prevVal === undefined) {
        // New parameter added - only accept if numeric literal
        if (!isNumericLiteral(v)) {
          if (paramPatchTimerRef.current) {
            window.clearTimeout(paramPatchTimerRef.current);
            paramPatchTimerRef.current = null;
          }
          return;
        }
        changes.set(k, v);
      } else if (prevVal !== v) {
        // Changed - allow only numeric literal
        if (!isNumericLiteral(v)) {
          if (paramPatchTimerRef.current) {
            window.clearTimeout(paramPatchTimerRef.current);
            paramPatchTimerRef.current = null;
          }
          return;
        }
        changes.set(k, v);
      }
    }

    // Also ensure that no params were removed (that would be a structural change requiring parse)
    for (const k of prevParams.keys()) {
      if (!newParams.has(k)) {
        if (paramPatchTimerRef.current) {
          window.clearTimeout(paramPatchTimerRef.current);
          paramPatchTimerRef.current = null;
        }
        return;
      }
    }

    if (changes.size === 0) {
      // nothing to do
      if (paramPatchTimerRef.current) {
        window.clearTimeout(paramPatchTimerRef.current);
        paramPatchTimerRef.current = null;
      }
      return;
    }

    // Debounce applyParameterPatch with 500ms
    if (paramPatchTimerRef.current) {
      window.clearTimeout(paramPatchTimerRef.current);
    }
    paramPatchTimerRef.current = window.setTimeout(() => {
      paramPatchTimerRef.current = null;
      applyParameterPatch(changes, model);
    }, 500);
  }, [model]);

  // Ensure the worker is terminated if the app component is ever unmounted (e.g. during HMR or tab close)
  useEffect(() => {
    return () => {
      try {
        bnglService.terminate('App unmounted');
      } catch (err) {
        // swallow errors during teardown

        console.warn('Error terminating bnglService on App unmount', err);
      }
      if (paramPatchTimerRef.current) {
        window.clearTimeout(paramPatchTimerRef.current);
        paramPatchTimerRef.current = null;
      }
    };
  }, []);

  // Keep codeRef in sync with explicit setCode calls that may come from other flows
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  const applyCatalogModel = useCallback(async (example: CatalogExample, options?: {
    statusMessage?: string;
  }) => {
    const nextCode = example.code ?? await loadModelCode(example.id);
    setCachedCode(example.id, nextCode);
    setCode(nextCode);
    codeRef.current = nextCode;
    setLoadedModelId(example.id);
    setLoadedModelName(example.name);
    if (options?.statusMessage) {
      setStatus({ type: 'success', message: options.statusMessage });
    }
    return nextCode;
  }, []);

  // Load model from URL hash on startup (for shared links) or from query param (?model=...)
  useEffect(() => {
    let cancelled = false;

    console.log('[App] initializeModel effect run');

    const initializeModel = async () => {
      try {
        const catalog = await loadModelCatalog();
        if (cancelled) return;
        setDefaultCatalogModelId(catalog.defaultModelId);

        const shared = getSharedModelFromUrl();
        if (shared?.code) {
          setCode(shared.code);
          codeRef.current = shared.code;

          const example = shared.modelId ? await findCatalogExampleByQuery(shared.modelId) : null;
          if (cancelled) return;

          if (example) {
            setLoadedModelId(example.id);
            setLoadedModelName(shared.name ?? example.name);
          } else {
            setLoadedModelId(null);
            setLoadedModelName(shared.name ?? null);
          }

          clearModelFromUrl();
          setStatus({ type: 'success', message: 'Model loaded from shared link!' });
          await handleParse(shared.code);
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const raw = params.get('model');
        if (raw) {
          const example = await findCatalogExampleByQuery(raw);
          if (cancelled) return;

          if (example) {
            try {
              const nextCode = await applyCatalogModel(example, {
                statusMessage: `Loaded ${example.name} from Model Explorer`
              });
              if (cancelled) return;
              window.history.replaceState(null, '', window.location.pathname + window.location.hash);
              await handleParse(nextCode);
            } catch (error) {
              console.warn('[App] Failed to load RuleHub model for query parameter:', raw, error);
            }
          } else {
            console.warn('[App] Query model not found in RuleHub manifest:', raw);
          }

          return;
        }

        const defaultExample = catalog.defaultModelId
          ? catalog.examples.find((example) => example.id === catalog.defaultModelId)
          : null;

        if (!defaultExample) {
          console.warn('[App] No default RuleHub model available for startup.');
          return;
        }

        const nextCode = await applyCatalogModel(defaultExample);
        if (cancelled) return;
        await handleParse(nextCode);
      } catch (error) {
        console.warn('[App] Failed to initialize RuleHub-backed model state:', error);
      }
    };

    void initializeModel();

    // Expose batch runner for automation
    import('./src/utils/batchRunner').then(({ runAllModels, runModels }) => {
      (window as any).runAllModels = runAllModels;
      (window as any).runModels = runModels;
      console.log('🤖 batch runner loaded. Run `window.runAllModels()` to start.');
    });

    return () => {
      cancelled = true;
    };
  }, [applyCatalogModel, handleParse]);

  // Whenever a named model is loaded, kick off a parse so the visualization
  // reflects the new code immediately.  we watch loadedModelId rather than
  // code directly to avoid parsing on every keystroke.
  useEffect(() => {
    if (loadedModelId) {
      // parse in background, ignore result
      handleParse();
    }
  }, [loadedModelId, handleParse]);

  // Auto-run simulation on first visit for immediate value demonstration
  useEffect(() => {
    const hasVisited = localStorage.getItem('bng-has-visited');
    const urlModel = getSharedModelFromUrl();
    const params = new URLSearchParams(window.location.search);
    const isBatchMode = params.has('batch');
    const requestedModel = params.get('model');

    if (
      !hasVisited &&
      !urlModel &&
      !requestedModel &&
      !isBatchMode &&
      defaultCatalogModelId &&
      loadedModelId === defaultCatalogModelId &&
      code.trim().length > 0
    ) {
      localStorage.setItem('bng-has-visited', 'true');

      // Delay slightly to let UI render first
      const timer = setTimeout(async () => {
        try {
          // Parse the default model
          const parsedModel = await bnglService.parse(code, {
            description: 'Auto-parse default model on first visit'
          });
          setModel(parsedModel);

          // Validate
          const warnings = validateBNGLModel(parsedModel);
          setValidationWarnings(warnings);
          const lintResult = lintBNGL(parsedModel);
          setEditorMarkers([
            ...validationWarningsToMarkers(code, warnings),
            ...lintDiagnosticsToMarkers(code, lintResult.diagnostics),
          ]);

          // Run simulation with sensible defaults
          const simResults = await bnglService.simulate(parsedModel, {
            method: 'ode',
            t_end: 100,
            n_steps: 100,
            solver: 'auto'
          }, { description: 'Auto-simulation on first visit' });

          setResults(simResults);
          setStatus({
            type: 'success',
            message: '🎉 Welcome! The default model has been simulated. Try editing parameters and clicking Run!'
          });

        } catch (err) {
          // Silent fail - don't disrupt first-time experience
          console.warn('Auto-run on first visit failed:', err);
        }
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [code, defaultCatalogModelId, loadedModelId]);

  const handleSimulateWrapper = useCallback(async (options: SimulationOptions, modelOverride?: BNGLModel) => {
    // This wrapper is just to maintain the same interface if needed, or I can just use handleSimulate directly.
    return handleSimulate(options, modelOverride);
  }, [handleSimulate]);

  const handleCodeChange = (newCode: string) => {
    console.log('[App] handleCodeChange called:', {
      codeLength: newCode.length,
      codePreview: newCode.substring(0, 200),
      firstLine: newCode.split('\n')[0] || '',
      hasSimulateNf: newCode.includes('method=>"nf"'),
      hasSimulateOde: newCode.includes('method=>"ode"'),
      previousCodeLength: codeRef.current.length,
      previousLoadedModelId: loadedModelId,
      previousLoadedModelName: loadedModelName,
      nextEditorResetKey: editorResetKey + 1,
    });
    setCode(newCode);
    setModel(null);
    setResults(null);
    setValidationWarnings([]);
    setEditorMarkers([]);
    setEditorResetKey((prev) => prev + 1);

    if (loadedModelId) {
      const example = findExampleById(loadedModelId);
      const knownCode = getCachedCode(loadedModelId);
      if (!example || (knownCode !== undefined && normalizeCode(knownCode) !== normalizeCode(newCode))) {
        setLoadedModelId(null);
      }
    }
  };

  const handleStatusClose = () => {
    setStatus(null);
  };

  const handleImportSBML = async (file: File) => {
    setStatus({ type: 'info', message: 'Importing SBML...' });
    try {
      const startedAt = performance.now();
      const text = await file.text();
      console.log(
        `[App][SBML Import] file=${file.name} bytes=${file.size} chars=${text.length} timeoutMs=${SBML_IMPORT_TIMEOUT_MS}`
      );
      const result = await bnglService.atomize(text, {
        timeoutMs: SBML_IMPORT_TIMEOUT_MS,
        description: `SBML import atomize (${file.name})`,
      });
      if (result.success && result.bngl) {
        handleCodeChange(result.bngl);
        // Use the incoming file name (e.g., BIOMD0000000123.xml) as the loaded model title
        try {
          setLoadedModelName(file.name.replace(/\.[^.]+$/, ''));
        } catch (e) {
          // ignore failures in name parsing
        }
        console.log(`[App][SBML Import] success in ${Math.round(performance.now() - startedAt)} ms`);
        setStatus({ type: 'success', message: 'SBML imported successfully!' });
      } else {
        setStatus({ type: 'error', message: `Import failed: ${result.error || 'Unknown error'}` });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const timedOut = (e as { name?: string } | null)?.name === 'TimeoutError' || /timed out/i.test(message);
      if (timedOut) {
        bnglService.restart();
      }
      setStatus({ type: 'error', message: `Import failed: ${message}` });
      console.error('SBML Import error:', e);
    }
  };

  // Note: When importing from BioModels, the file name is set to the BioModels
  // ID (e.g., BIOMD0000000123.xml). We use that file name to set the editor
  // title so users can see the original BioModels accession as the loaded model.
  // If the BioModels download returns a COMBINE/OMEX archive, the importer
  // extracts the primary SBML file and assigns the BioModels ID as the file name.

  // Export SBML helper used by Header and EditorPanel
  const handleExportSBML = async () => {
    if (!model) {
      setStatus({ type: 'warning', message: 'No model to export. Parse or load a model first.' });
      return;
    }
    setStatus({ type: 'info', message: 'Generating SBML...' });
    try {
      const xml = await exportToSBML(model);
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${loadedModelName?.replace(/\s+/g, '_') || 'model'}.sbml`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', message: 'SBML export generated.' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to export SBML.' });
      console.warn('SBML export failed', e);
    }
  };

  const handleExportNET = async () => {
    if (!model) {
      setStatus({ type: 'warning', message: 'No model to export. Parse or load a model first.' });
      return;
    }
    setStatus({ type: 'info', message: 'Generating NET file...' });
    try {
      const generatedModel = await bnglService.generateNetwork(model);
      const netString = await exportToNet(generatedModel);
      const blob = new Blob([netString], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${loadedModelName?.replace(/\s+/g, '_') || 'model'}.net`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', message: 'NET export generated.' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to export NET file. Check console for details.' });
      console.error('NET export failed:', e);
    }
  };

  const handleExportSedML = async () => {
    if (!model) {
      setStatus({ type: 'warning', message: 'No model to export. Parse or load a model first.' });
      return;
    }
    setStatus({ type: 'info', message: 'Generating SED-ML...' });
    try {
      const xml = exportToSedML(model, {
        t_end: simOptions?.t_end || 100,
        n_steps: simOptions?.n_steps || 100,
        method: (simOptions?.method as any) || 'ode'
      });
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${loadedModelName?.replace(/\s+/g, '_') || 'model'}.sedml`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', message: 'SED-ML export generated.' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to export SED-ML.' });
      console.warn('SED-ML export failed', e);
    }
  };

  const handleExportOMEX = async () => {
    if (!model) {
      setStatus({ type: 'warning', message: 'No model to export. Parse or load a model first.' });
      return;
    }
    setStatus({ type: 'info', message: 'Generating OMEX archive...' });
    try {
      const data = exportToOMEX(model, code, {
        modelName: loadedModelName || 'model',
        simulationOptions: {
          t_end: simOptions?.t_end || 100,
          n_steps: simOptions?.n_steps || 100,
          method: (simOptions?.method as any) || 'ode'
        }
      });
      // Convert to Blob; slice(0) ensures we have a standard ArrayBuffer, avoiding SharedArrayBuffer type mismatches.
      const blob = new Blob([data.slice(0)], { type: 'application/omex+zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${loadedModelName?.replace(/\s+/g, '_') || 'model'}.omex`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', message: 'OMEX export generated.' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to export OMEX.' });
      console.warn('OMEX export failed', e);
    }
  };

  const handleExportBNGL = () => {
    if (!code?.trim()) {
      setStatus({ type: 'warning', message: 'No BNGL code to export.' });
      return;
    }
    try {
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${loadedModelName?.replace(/\s+/g, '_') || 'model'}.bngl`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', message: 'BNGL export generated.' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to export BNGL.' });
      console.warn('BNGL export failed', e);
    }
  };

  const vscodeExportPayload: VSCodeAnalysisPayload | null = code?.trim()
    ? {
        version: 1,
        source: 'bng-playground',
        modelName: loadedModelName,
        code,
        analyses: {
          activeTabIndex: activeVizTab,
          simulationOptions: simOptions ? { ...simOptions } as Record<string, unknown> : null,
          simulationResults: results ? JSON.parse(JSON.stringify(results)) as Record<string, unknown> : null,
          exportedAt: new Date().toISOString(),
        },
      }
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {/* Export SBML handler exposed to Header and EditorPanel */}
      <Header
        onAboutClick={(focus?: string) => {
          setAboutFocus(focus ?? null);
          setIsAboutModalOpen(true);
        }}
        onExportSBML={handleExportSBML}
        onImportSBML={handleImportSBML}
        onExportSedML={handleExportSedML}
        onExportOMEX={handleExportOMEX}
        onExportNET={handleExportNET}
        onExportBNGL={handleExportBNGL}
        code={code}
        modelName={loadedModelName}
        modelId={loadedModelId}
        onModelNameChange={setLoadedModelName}
        vscodeExportPayload={vscodeExportPayload}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />


      <main className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        <div className="container mx-auto flex min-h-full flex-col gap-6 p-4 sm:p-6 lg:p-8">
          <div className="fixed top-20 right-8 z-50 w-full max-w-sm">
            {status && <StatusMessage status={status} onClose={handleStatusClose} />}
          </div>

          <div className="flex flex-1 min-h-0 min-w-0 flex-col lg:flex-row gap-0 items-stretch" style={{ height: PANEL_MAX_HEIGHT }}>
            {/* Left Panel: Editor */}
            <div 
              className={`flex min-h-0 min-w-0 flex-col overflow-hidden transition-[flex] duration-200 ${splitPosition <= 5 ? 'flex-none w-14' : ''}`} 
              style={{ 
                height: PANEL_MAX_HEIGHT,
                minHeight: PANEL_MAX_HEIGHT,
                maxHeight: PANEL_MAX_HEIGHT,
                flex: splitPosition <= 5 ? 'none' : `1 1 ${splitPosition}%`,
                width: splitPosition <= 5 ? '56px' : '100%',
                maxWidth: '100%'
              }}
            >
              <div ref={editorContainerRef} className="h-full flex flex-col">
                {viewMode === 'code' ? (
                  <ErrorBoundary label="editor">
                    <EditorPanel
                      lastResized={lastResized}
                      isCollapsed={splitPosition <= 5}
                      onExpand={() => setSplitPosition(35)}
                      onRunQuick={handleQuickRun}
                      editorResetKey={editorResetKey}
                      code={code}
                      onCodeChange={handleEditorCodeChange}
                      onLoadCode={handleCodeChange}
                      onParse={handleParse}
                      onSimulate={handleSimulate}
                      isSimulating={isSimulating}
                      modelExists={!!model}
                      model={model}
                      validationWarnings={validationWarnings}
                      editorMarkers={editorMarkers}
                      loadedModelName={loadedModelName}
                      onModelNameChange={setLoadedModelName}
                      onModelIdChange={setLoadedModelId}
                      selection={editorSelection}
                      onImportSBML={handleImportSBML}
                      onExportSBML={handleExportSBML}
                      onExportSedML={handleExportSedML}
                      onExportOMEX={handleExportOMEX}
                      onExportBNGL={handleExportBNGL}
                      onExportNET={handleExportNET}
                    />
                  </ErrorBoundary>
                ) : (
                  <ErrorBoundary label="designer">
                    <DesignerPanel
                      isCollapsed={splitPosition <= 5}
                      onExpand={() => setSplitPosition(35)}
                      text={designerText}
                      onTextChange={setDesignerText}
                      modelName={designerModelName}
                      onModelNameChange={handleDesignerModelNameChange}
                      onCodeChange={handleEditorCodeChange}
                      onParse={handleParse}
                      onSimulate={(modelOverride) => handleSimulate({
                        method: 'ode',
                        t_end: 100,
                        n_steps: 100,
                        solver: 'auto'
                      }, modelOverride)}
                    />
                  </ErrorBoundary>
                )}
              </div>
            </div>

            {/* Splitter Handle */}
            <div 
              onMouseDown={handleMouseDown}
              className="flex-shrink-0 w-2 group cursor-col-resize hidden lg:flex items-center justify-center relative touch-none hover:bg-teal-500/20 transition-colors"
              title="Drag to resize panels"
            >
              <div className="w-0.5 h-16 bg-slate-300 dark:bg-slate-600 rounded-full group-hover:bg-teal-500 transition-colors" />
              {/* Invisible touch target extension */}
              <div className="absolute inset-y-0 -left-2 -right-2 z-10" />
            </div>

            {/* Right Panel: Visualization */}
            <div 
              className="flex min-w-0 flex-col min-h-0"
              style={{ 
                height: PANEL_MAX_HEIGHT,
                minHeight: PANEL_MAX_HEIGHT,
                maxHeight: PANEL_MAX_HEIGHT,
                flex: `1 1 ${100 - splitPosition}%`,
                minWidth: '320px',
                width: '100%', // Mobile default
              }}
            >
              <ErrorBoundary label="visualization">
                <VisualizationPanel
                  model={model}
                  results={results}
                  onSimulate={handleSimulate}
                  isSimulating={isSimulating}
                  onCancelSimulation={handleCancelSimulation}
                  simulationMethod={currentMethod}
                  activeTabIndex={activeVizTab}
                  onActiveTabIndexChange={setActiveVizTab}
                  bnglCode={code}
                  onLoadModel={(modelCode, name, id) => {
                    setLoadedModelId(id);
                    setLoadedModelName(name);
                    handleCodeChange(modelCode);
                    setStatus({ type: 'success', message: `Loaded ${name} from Model Explorer` });
                  }}
                />
              </ErrorBoundary>
            </div>
          </div>
          <SimulationModal
            isGenerating={isSimulating}
            progressMessage={generationProgress}
            onCancel={handleCancelSimulation}
            speciesCount={progressStats.species}
            reactionCount={progressStats.reactions}
            iteration={progressStats.iteration}
            simulationProgress={simulationProgress}
            simTime={simulationTime}
            simTimeLabel={simulationTimeLabel}
            phase={currentMethod === 'nf' ? 'simulating' : 'generating'}
            hideNetworkStats={currentMethod === 'nf'}
            model={model}
          />
        </div>
      </main>
      <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} focus={aboutFocus} />
    </div>
  );
}

export default App;
