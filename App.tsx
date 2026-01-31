import { useState, useCallback, useRef, useEffect } from 'react';
import { EditorPanel } from './components/EditorPanel';
import { DesignerPanel } from './components/DesignerPanel';
import { VisualizationPanel } from './components/VisualizationPanel';
import { Header } from './components/Header';
import { exportToSBML } from './services/exportSBML';
import { StatusMessage } from './components/ui/StatusMessage';
import { AboutModal } from './components/AboutModal';
import { bnglService } from './services/bnglService';
import { BNGLModel, SimulationOptions, SimulationResults, Status, ValidationWarning, EditorMarker } from './types';
import { EXAMPLES, INITIAL_BNGL_CODE } from './constants';
import SimulationModal from './components/SimulationModal';
import { BNGLParser } from './src/services/graph/core/BNGLParser.ts';
import { validateBNGLModel, validationWarningsToMarkers } from './services/modelValidation';
import { lintBNGL, lintDiagnosticsToMarkers } from './services/bnglLinter';
import { getSharedModelFromUrl, clearModelFromUrl } from './src/utils/shareUrl';
import { resolveAutoMethod } from './src/utils/simulationOptions';
import { Atomizer } from '@/src/lib/atomizer';
import { parseParametersFromCode, isNumericLiteral, stripParametersBlock } from './services/paramUtils';

const normalizeCode = (value: string) => value.replace(/\r\n/g, '\n').trim();

const findExampleById = (id?: string | null) => {
  if (!id) return undefined;
  return EXAMPLES.find((example) => example.id === id);
};

function App() {
  const PANEL_MAX_HEIGHT = 'calc(100vh - 100px)';
  const [code, setCode] = useState<string>(INITIAL_BNGL_CODE);
  // Refs for editor/code diffing and debounce timer for parameter-only edits
  const codeRef = useRef<string>(INITIAL_BNGL_CODE);
  const paramPatchTimerRef = useRef<number | null>(null);
  const [model, setModel] = useState<BNGLModel | null>(null);
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  const [isSimulating, setIsSimulating] = useState(false);
  const [currentMethod, setCurrentMethod] = useState<'ode' | 'ssa' | 'nf'>('ode');
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

  const [editorSelection] = useState<{ startLineNumber: number; endLineNumber: number } | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'code' | 'design'>('code');
  // Store designer text separately so switching modes doesn't lose content
  const [designerText, setDesignerText] = useState<string>('');

  const parseAbortRef = useRef<AbortController | null>(null);
  const simulateAbortRef = useRef<AbortController | null>(null);
  const simOptionsRef = useRef<SimulationOptions | null>(null);

  useEffect(() => {
    simOptionsRef.current = simOptions;
  }, [simOptions]);

  // Remove the parameters block from source for equality checks
  function stripParametersBlock(src: string): string {
    const lines = src.split(/\r?\n/);
    let out: string[] = [];
    let inParams = false;
    for (const raw of lines) {
      const l = raw.trim();
      if (/^begin\s+parameters\b/i.test(l)) { inParams = true; continue; }
      if (/^end\s+parameters\b/i.test(l)) { inParams = false; continue; }
      if (!inParams) out.push(raw);
    }
    return out.join('\n').replace(/\s+$/g, '').trim();
  }

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
        if (!isNumericLiteral(v)) return;
        changes.set(k, v);
      } else if (prevVal !== v) {
        // Changed - allow only numeric literal
        if (!isNumericLiteral(v)) return;
        changes.set(k, v);
      }
    }

    // Also ensure that no params were removed (that would be a structural change requiring parse)
    for (const k of prevParams.keys()) {
      if (!newParams.has(k)) return;
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

  // Load model from URL hash on startup (for shared links) or from query param (?model=...)
  useEffect(() => {
    const shared = getSharedModelFromUrl();
    if (shared?.code) {
      setCode(shared.code);

      const example = findExampleById(shared.modelId);
      const matchesExample = example && normalizeCode(example.code) === normalizeCode(shared.code);

      if (matchesExample) {
        setLoadedModelId(example.id);
        setLoadedModelName(shared.name ?? example.name);
      } else {
        setLoadedModelId(null);
        setLoadedModelName(shared.name ?? null);
      }

      clearModelFromUrl(); // Clean up URL
      setStatus({ type: 'success', message: 'Model loaded from shared link!' });
    }

    // Also support loading a model by ID via query parameter (used by the Model Explorer / UMAP page)
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('model')) {
        const raw = params.get('model') || '';
        console.log('[App] Model explorer requesting model:', raw);

        // Normalize: allow both 'example-models/akt-signaling' and 'akt-signaling.bngl'
        let candidate = raw.includes('/') ? raw.split('/').pop() || raw : raw;
        candidate = candidate.replace(/\.bngl$/i, '');

        // Try several matching strategies: exact id, candidate suffix, name, and filename
        let example = findExampleById(raw) || findExampleById(candidate);
        if (!example) {
          example = EXAMPLES.find(e => (
            e.id === candidate ||
            e.id === raw ||
            (e.name && (e.name === candidate || e.name === raw)) ||
            // @ts-ignore
            (e.filename && (e.filename === candidate || e.filename === raw || e.filename === `${candidate}.bngl`))
          ));
        }

        if (example) {
          console.log('[App] Found model in EXAMPLES:', example.id);
          setCode(example.code);
          setLoadedModelId(example.id);
          setLoadedModelName(example.name);
          // Remove the query param so the URL is clean afterwards
          window.history.replaceState(null, '', window.location.pathname + window.location.hash);
          setStatus({ type: 'success', message: `Loaded ${example.name} from Model Explorer` });
        } else {
          console.log('[App] Model not found in EXAMPLES, attempting fetch fallback...');
          // Attempt to fetch BNGL file from likely locations if it's not embedded in EXAMPLES.
          (async () => {
            const tryPaths = (rawVal: string) => {
              const paths = [] as string[];
              const clean = rawVal.replace(/^\/+/, '');

              // Determine base path of current app
              const basePath = window.location.pathname.replace(/\/$/, '');

              const pushBoth = (p: string) => {
                paths.push(p);
                if (basePath) paths.push(basePath + (p.startsWith('/') ? '' : '/') + p);
              };

              if (/\.bngl$/i.test(clean)) {
                pushBoth('/' + clean);
              } else {
                pushBoth('/' + clean + '.bngl');
                const base = clean.split('/').pop();
                if (base) {
                  pushBoth('/models/' + base + '.bngl');
                  pushBoth('/example-models/' + base + '.bngl');
                  pushBoth('/published-models/' + base + '.bngl');
                }
              }
              return paths;
            };

            const paths = tryPaths(raw);
            console.debug('[App] Attempting to fetch model from paths:', paths);

            let fetchedCode: string | null = null;
            let fetchedPath: string | null = null;
            for (const p of paths) {
              try {
                const attemptUrl = p.startsWith('/') ? p : (window.location.pathname.replace(/\/$/, '') + '/' + p);
                console.debug('[App] Fetching', attemptUrl);
                const resp = await fetch(attemptUrl);
                if (resp.ok) {
                  fetchedCode = await resp.text();
                  fetchedPath = attemptUrl;
                  console.debug('[App] Fetched model from', attemptUrl);
                  break;
                } else {
                  console.debug('[App] Fetch failed', attemptUrl, resp.status);
                }
              } catch (e) {
                console.debug('[App] Fetch error for', p, e);
                // ignore and continue
              }
            }

            if (fetchedCode) {
              setCode(fetchedCode);
              setLoadedModelId(raw);
              setLoadedModelName((raw.split('/').pop() || raw).replace(/[-_]/g, ' '));
              window.history.replaceState(null, '', window.location.pathname + window.location.hash);
              setStatus({ type: 'success', message: 'Model loaded from Model Explorer (fetched)' });
            } else {
              console.warn('[App] Model param not matched to embedded example and fetch failed:', raw, 'tried paths:', paths);
            }
          })();
        }
      }
    } catch (e) {
      // Ignore if URL parsing isn't available
    }

    // Expose batch runner for automation
    import('./src/utils/batchRunner').then(({ runAllModels, runModels }) => {
      (window as any).runAllModels = runAllModels;
      (window as any).runModels = runModels;
      console.log('🤖 batch runner loaded. Run `window.runAllModels()` to start.');
    });
  }, []);

  // Auto-run simulation on first visit for immediate value demonstration
  useEffect(() => {
    const hasVisited = localStorage.getItem('bng-has-visited');
    const urlModel = getSharedModelFromUrl();

    // Only auto-run if: first visit, no URL model, and code matches default
    if (!hasVisited && !urlModel && code === INITIAL_BNGL_CODE) {
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
  }, []); // Empty deps - run once on mount



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

      setStatus({ type: 'success', message: `Updated ${changes.size} parameter${changes.size === 1 ? '' : 's'} (no reparse/simulate)` });
    } catch (e) {
      console.warn('Parameter patch failed:', e);
      setStatus({ type: 'warning', message: 'Parameter update failed; consider re-parsing the model.' });
    }
  }

  const handleParse = useCallback(async (): Promise<BNGLModel | null> => {
    setResults(null);
    if (parseAbortRef.current) {
      parseAbortRef.current.abort('Parse request replaced.');
    }
    const controller = new AbortController();
    parseAbortRef.current = controller;
    try {
      const parsedModel = await bnglService.parse(code, {
        signal: controller.signal,
        description: 'Parse BNGL model',
      });
      setModel(parsedModel);
      const warnings = validateBNGLModel(parsedModel);
      setValidationWarnings(warnings);
      const lintResult = lintBNGL(parsedModel, {}, code);
      const combinedMarkers = [
        ...validationWarningsToMarkers(code, warnings),
        ...lintDiagnosticsToMarkers(code, lintResult.diagnostics),
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
  }, [code]);

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

    // Resolve effective method (e.g. handle 'default' -> 'nf' if model has simulate_nf)
    const effectiveMethod = resolveAutoMethod(targetModel, options.method);
    setCurrentMethod(effectiveMethod);
    setSimOptions(options);
    setIsSimulating(true);
    try {
      // Note: We still pass the original options to the worker, letting it also resolve 'default' if needed,
      // or we could pass the resolved method. Passing original preserves intent, but let's pass resolved for consistent behavior
      // IF we trust our resolution. The worker specifically has logic for 'default' too.
      // Let's stick to passing options as-is, but use effectiveMethod for UI state.
      const simResults = await bnglService.simulate(targetModel, options, {
        signal: controller.signal,
        description: `Simulation (${effectiveMethod})`,
      });
      setResults(simResults);
      setStatus({
        type: 'success', message: (
          <span>
            Simulation ({effectiveMethod}) completed.&nbsp;
            Explore: <button className="underline" onClick={() => setActiveVizTab(0)}>Time Courses</button>,{' '}
            <button className="underline" onClick={() => setActiveVizTab(2)}>Regulatory Graph</button>
          </span>
        )
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // User cancelled - status already set by handleCancelSimulation
        // Just ensure results are cleared
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

  useEffect(() => {
    const onProgress = (payload: any) => {
      if (!payload) return;

      // Extract simulation time (use console-derived NFsim logs as source of truth)
      let simTimeVal: number | undefined = undefined;

      const isAuthoritativeSimTime = payload.source === 'nfsim-console' ||
        (typeof payload.message === 'string' && /(?:^|\b)Sim\s*time\s*[:=]/i.test(payload.message));

      if (isAuthoritativeSimTime && typeof payload.simulationTime === 'number') {
        simTimeVal = payload.simulationTime;
      } else if (typeof payload.simTime === 'number') {
        simTimeVal = payload.simTime;
      } else if (typeof payload.message === 'string') {
        // Strict regex: only parse "Sim time" to avoid CPU time
        const m = payload.message.match(/(?:^|\b)Sim\s*time\s*[:=]\s*([+-]?(?:\d+\.?\d*|\d*\.\d+)(?:e[+-]?\d+)?)/i) ||
          payload.message.match(/\bt\s*=\s*([+-]?(?:\d+\.?\d*|\d*\.\d+)(?:e[+-]?\d+)?)/i);
        if (m) {
          const val = Number(m[1]);
          setSimulationTimeLabel(m[1]);
          if (!isNaN(val)) simTimeVal = val;
        }
      }

      if (typeof simTimeVal === 'number' && Number.isFinite(simTimeVal)) {
        setSimulationTime(simTimeVal);

        // Use simulationProgress from payload if provided, else calculate
        if (isAuthoritativeSimTime && typeof payload.simulationProgress === 'number') {
          setSimulationProgress(payload.simulationProgress);
        } else {
          const tEnd = simOptionsRef.current?.t_end;
          if (typeof tEnd === 'number' && tEnd > 0) {
            const next = (simTimeVal / tEnd) * 100;
            setSimulationProgress(prev => (prev === undefined || next > prev) ? next : prev);
          }
        }
      } else if (typeof payload.simulationProgress === 'number') {
        setSimulationProgress(payload.simulationProgress);
      }

      // Update progress stats
      if (payload.species !== undefined || payload.speciesCount !== undefined || payload.reactionCount !== undefined || payload.iteration !== undefined) {
        setProgressStats(prev => ({
          species: payload.species ?? payload.speciesCount ?? prev.species,
          reactions: payload.reactions ?? payload.reactionCount ?? prev.reactions,
          iteration: payload.iteration ?? prev.iteration
        }));
      }

      if (payload.message) {
        setGenerationProgress(String(payload.message));
      }
    };

    const onWarning = (payload: any) => {
      if (!payload) return;
      setGenerationProgress(`⚠️ ${String(payload.message ?? 'Warning during generation')}`);
    };

    const unsubP = bnglService.onProgress(onProgress);
    const unsubW = bnglService.onWarning(onWarning);
    return () => {
      unsubP();
      unsubW();
    };
  }, []);

  useEffect(() => {
    if (!isSimulating) {
      // Reset progress stats when not simulating
      setProgressStats({ species: 0, reactions: 0, iteration: 0 });
      setGenerationProgress('');
      setSimulationProgress(0);
      setSimulationTime(0);
      setSimulationTimeLabel(undefined);
    }
  }, [isSimulating]);

  // Simulation progress estimator for silent solvers (like NFsim)
  useEffect(() => {
    if (!isSimulating || currentMethod !== 'nf' || !simOptions) {
      return undefined;
    }

    // The simulator is now correctly parsing Sim time logs from the console. 
    // We don't need a wall-clock estimator anymore as it just causes lag/confusion.
    // The onProgress handler will catch scientific notation logs and update the UI in real time.
    return undefined;
  }, [isSimulating, currentMethod, simOptions]);

  const handleCodeChange = (newCode: string) => {
    console.log('[App] handleCodeChange called:', {
      codeLength: newCode.length,
      codePreview: newCode.substring(0, 200),
      hasSimulateNf: newCode.includes('method=>"nf"'),
      hasSimulateOde: newCode.includes('method=>"ode"')
    });
    setCode(newCode);
    setModel(null);
    setResults(null);
    setValidationWarnings([]);
    setEditorMarkers([]);

    if (loadedModelId) {
      const example = findExampleById(loadedModelId);
      if (!example || normalizeCode(example.code) !== normalizeCode(newCode)) {
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
      const text = await file.text();
      const atomizer = new Atomizer();
      await atomizer.initialize();
      const result = await atomizer.atomize(text);
      if (result.success && result.bngl) {
        handleCodeChange(result.bngl);
        // Use the incoming file name (e.g., BIOMD0000000123.xml) as the loaded model title
        try {
          setLoadedModelName(file.name.replace(/\.[^.]+$/, ''));
        } catch (e) {
          // ignore failures in name parsing
        }
        setStatus({ type: 'success', message: 'SBML imported successfully!' });
      } else {
        setStatus({ type: 'error', message: `Import failed: ${result.error || 'Unknown error'}` });
      }
    } catch (e) {
      setStatus({ type: 'error', message: 'Failed to read SBML file.' });
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
        code={code}
        modelName={loadedModelName}
        modelId={loadedModelId}
        onModelNameChange={setLoadedModelName}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />


      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="container mx-auto flex h-full min-h-0 flex-col gap-6 p-4 sm:p-6 lg:p-8">
          <div className="fixed top-20 right-8 z-50 w-full max-w-sm">
            {status && <StatusMessage status={status} onClose={handleStatusClose} />}
          </div>

          <div className="grid flex-1 min-h-0 grid-cols-1 gap-6 items-start lg:grid-cols-2">
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden" style={{ maxHeight: PANEL_MAX_HEIGHT }}>
              {viewMode === 'code' ? (
                <EditorPanel
                  code={code}
                  onCodeChange={handleEditorCodeChange}
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
                />
              ) : (
                <DesignerPanel
                  text={designerText}
                  onTextChange={setDesignerText}
                  onCodeChange={handleEditorCodeChange}
                  onParse={handleParse}
                  onSimulate={(modelOverride) => handleSimulate({
                    method: 'ode',
                    t_end: 100,
                    n_steps: 100,
                    solver: 'auto'
                  }, modelOverride)}
                />
              )}
            </div>
            <div className="flex min-w-0 flex-col">
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
              />
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
