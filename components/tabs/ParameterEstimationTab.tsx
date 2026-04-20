import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ComposedChart, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ErrorBar, Scatter } from 'recharts';
import { BNGLModel } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Card } from '../ui/Card';
import { DataTable } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { StatusMessage } from '../ui/StatusMessage';
import { CHART_COLORS } from '../../src/utils/chartColors';
import { TimeSeriesChart, TimeSeriesSeries } from '../charts/TimeSeriesChart';
import { parseExperimentalData, ExperimentalDataPoint } from '../../src/services/data/experimentalData';
import { fitParameters, FitAlgorithm } from '../../services/optimization/paramFitter';
import { bnglService } from '../../services/bnglService';
import { formatValue } from '../../src/utils/formatValue';
import { parsePEtab, parsePEtabCombined } from '@bngplayground/engine';

type PetabFileKey = 'parameters' | 'measurements' | 'conditions' | 'observables' | 'problem';

interface ParameterEstimationTabProps {
  model: BNGLModel | null;
}

interface ParameterPrior {
  name: string;
  mean: number;
  std: number;
  min: number;
  max: number;
}

interface EstimationResult {
  parameters: string[];
  /** Best-estimate parameter values from optimizer. */
  posteriorMean: number[];
  /** Half-width of 95% confidence interval. */
  posteriorStd: number[];
  /** SSE history (one entry per progress report, ~every 5 iters). */
  elbo: number[];
  convergence: boolean;
  iterations: number;
  rmse: number;
  sse: number;
  rSquared: number;
  bestPredictions?: Map<string, number[]>;
  credibleIntervals: { lower: number; upper: number }[];
  percentiles: { q1: number; q3: number; median: number }[];
  priorMeans: number[];
  algorithm?: string;
  bpslResults?: {
    totalPenalty: number;
    details: Array<{
      constraint: { source: string };
      satisfied: boolean;
      message: string;
    }>;
  };
}

// Default data for testing - uses typical BNGL observable names
const DEFAULT_TEST_DATA = `# Paste experimental data here (CSV format)
# Columns: time, observable1, observable2, ...
# Or click "Generate from Simulation" to auto-populate
# from the current model's time course with 5% noise.
time`;

export const ParameterEstimationTab: React.FC<ParameterEstimationTabProps> = ({ model }) => {
  // Parameter selection
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [priors, setPriors] = useState<ParameterPrior[]>([]);

  // Experimental data - initialize with default test data
  const [dataInput, setDataInput] = useState<string>(DEFAULT_TEST_DATA);
  const [parsedData, setParsedData] = useState<ExperimentalDataPoint[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'csv' | 'petab'>('csv');
  const [petabText, setPetabText] = useState('');
  const [petabFiles, setPetabFiles] = useState<Partial<Record<PetabFileKey, { name: string; content: string }>>>({});
  const [fitInputData, setFitInputData] = useState<ExperimentalDataPoint[]>([]);

  // Estimation settings
  const [nIterations, setNIterations] = useState('500');
  const [algorithm, setAlgorithm] = useState<FitAlgorithm>('nelder-mead');
  const [bpslText, setBpslText] = useState('');
  const [regType, setRegType] = useState<'none' | 'l1' | 'l2' | 'elastic-net'>('none');
  const [regLambda, setRegLambda] = useState('0.01');

  // Results
  const [result, setResult] = useState<EstimationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, elbo: 0 });
  const [error, setError] = useState<string | null>(null);
  const [visibleFitSeries, setVisibleFitSeries] = useState<Set<string>>(new Set());

  // Refs
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const parameterNames = useMemo(() => (model ? Object.keys(model.parameters) : []), [model]);
  const observableNames = useMemo(() => (model ? model.observables.map(o => o.name) : []), [model]);

  // Initialize selected parameters when model changes
  useEffect(() => {
    if (!model) {
      setSelectedParams([]);
      setPriors([]);
      setResult(null);
      return;
    }

    setResult(null);
    setError(null);
    setProgress({ current: 0, total: 0, elbo: 0 });

    // Select first few parameters by default
    const defaultSelected = parameterNames.slice(0, Math.min(3, parameterNames.length));
    setSelectedParams(defaultSelected);

    // Initialize priors from model values
    const initialPriors: ParameterPrior[] = defaultSelected.map(name => {
      const value = model.parameters[name] ?? 1;
      return {
        name,
        mean: value,
        std: Math.abs(value) * 0.5 || 0.1,
        min: Math.max(0, value * 0.1),
        max: value * 10
      };
    });
    setPriors(initialPriors);
  }, [model, parameterNames]);

  // Update priors when selected parameters change
  useEffect(() => {
    if (!model) return;

    setPriors(prev => {
      const newPriors: ParameterPrior[] = selectedParams.map(name => {
        const existing = prev.find(p => p.name === name);
        if (existing) return existing;

        const value = model.parameters[name] ?? 1;
        return {
          name,
          mean: value,
          std: Math.abs(value) * 0.5 || 0.1,
          min: Math.max(0, value * 0.1),
          max: value * 10
        };
      });
      return newPriors;
    });
  }, [selectedParams, model]);

  // Parse experimental data
  const parseData = useCallback((input: string) => {
    try {
      const data = parseExperimentalData(input);
      setParsedData(data);
      setDataError(null);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to parse data');
      setParsedData([]);
    }
  }, []);

  useEffect(() => {
    parseData(dataInput);
  }, [dataInput, parseData]);

  const handleParamToggle = (paramName: string) => {
    setSelectedParams(prev => {
      if (prev.includes(paramName)) {
        return prev.filter(p => p !== paramName);
      }
      return [...prev, paramName];
    });
  };

  const updatePrior = (name: string, field: keyof ParameterPrior, value: number) => {
    setPriors(prev => prev.map(p =>
      p.name === name ? { ...p, [field]: value } : p
    ));
  };



  const dataObsNames = useMemo(() => {
    if (parsedData.length === 0) return [];
    return Object.keys(parsedData[0].values);
  }, [parsedData]);

  const sharedObsNames = useMemo(() => {
    return dataObsNames.filter(name => observableNames.includes(name));
  }, [dataObsNames, observableNames]);

  const hasRequiredPetabFiles = Boolean(petabFiles.parameters?.content && petabFiles.measurements?.content);
  const buildPetabFileMap = useCallback(() => new Map<string, string>([
    ['parameters.tsv', petabFiles.parameters?.content ?? ''],
    ['measurements.tsv', petabFiles.measurements?.content ?? ''],
    ...(petabFiles.conditions?.content ? [['conditions.tsv', petabFiles.conditions.content] as [string, string]] : []),
    ...(petabFiles.observables?.content ? [['observables.tsv', petabFiles.observables.content] as [string, string]] : []),
    ...(petabFiles.problem?.content ? [['problem.yaml', petabFiles.problem.content] as [string, string]] : []),
  ]), [petabFiles]);

  const petabPreview = useMemo(() => {
    if (importMode !== 'petab') return null;
    if (!hasRequiredPetabFiles && petabText.trim().length === 0) return null;

    try {
      const parsed = hasRequiredPetabFiles
        ? parsePEtab(buildPetabFileMap())
        : parsePEtabCombined(petabText);
      const observableCount = Object.keys(parsed.measurements[0]?.values ?? {}).length;
      return {
        timePoints: parsed.measurements.length,
        observableCount,
        error: null as string | null,
      };
    } catch (err) {
      return {
        timePoints: 0,
        observableCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [importMode, hasRequiredPetabFiles, petabText, buildPetabFileMap]);

  const hasDataInput = importMode === 'csv' ? parsedData.length > 0 : (hasRequiredPetabFiles || petabText.trim().length > 0);
  const hasObservableOverlap = importMode === 'csv' ? sharedObsNames.length > 0 : true;
  const canRun = selectedParams.length > 0 && hasDataInput && hasObservableOverlap && !isRunning;

  const handlePetabFileUpload = async (
    key: PetabFileKey,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setPetabFiles(prev => ({
        ...prev,
        [key]: { name: file.name, content },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to read ${file.name}: ${message}`);
    }
  };

  const clearCurrentInput = () => {
    if (importMode === 'csv') {
      setDataInput('');
      return;
    }
    setPetabText('');
    setPetabFiles({});
  };

  const handleAutoGenerateInput = async () => {
    if (!model) return;
    const simulationOptions = model.simulationOptions ?? {};

    try {
      const modelId = await bnglService.prepareModel(model);
      const res = await bnglService.simulateCached(modelId, {}, {
        method: 'ode',
        t_end: simulationOptions.t_end || 10,
        n_steps: simulationOptions.n_steps || 100,
      });

      const obsNames = model.observables.map(o => o.name);
      const totalPoints = res.data.length;
      const step = Math.max(1, Math.floor((totalPoints - 1) / 9));

      const selectedIndices: number[] = [];
      for (let i = 0; i < totalPoints; i += step) selectedIndices.push(i);
      if (selectedIndices[selectedIndices.length - 1] !== totalPoints - 1) {
        if (selectedIndices.length >= 10) selectedIndices[selectedIndices.length - 1] = totalPoints - 1;
        else selectedIndices.push(totalPoints - 1);
      }

      if (importMode === 'csv') {
        let csv = `time, ${obsNames.join(', ')}\n`;
        for (const idx of selectedIndices) {
          const row = res.data[idx];
          const rowVals = [row.time.toFixed(4)];
          for (const name of obsNames) {
            const exact = row[name] ?? 0;
            const noisy = exact * (1 + (Math.random() - 0.5) * 0.05);
            rowVals.push(noisy.toFixed(4));
          }
          csv += rowVals.join(', ') + '\n';
        }
        setDataInput(csv);
        return;
      }

      const paramRows = [
        'parameterId\tparameterScale\tlowerBound\tupperBound\tnominalValue\testimate',
        ...priors.map((p) => `${p.name}\tlin\t${p.min}\t${p.max}\t${p.mean}\t1`),
      ];

      const measRows = ['observableId\tsimulationConditionId\ttime\tmeasurement'];
      for (const idx of selectedIndices) {
        const row = res.data[idx];
        for (const name of obsNames) {
          const exact = row[name] ?? 0;
          const noisy = exact * (1 + (Math.random() - 0.5) * 0.05);
          measRows.push(`${name}\tdefault\t${row.time.toFixed(4)}\t${noisy.toFixed(6)}`);
        }
      }

      const condRows = ['conditionId\tconditionName', 'default\tDefault'];
      const parametersTsv = paramRows.join('\n');
      const measurementsTsv = measRows.join('\n');
      const conditionsTsv = condRows.join('\n');

      setPetabFiles({
        parameters: { name: 'parameters.tsv', content: parametersTsv },
        measurements: { name: 'measurements.tsv', content: measurementsTsv },
        conditions: { name: 'conditions.tsv', content: conditionsTsv },
      });

      setPetabText(
        `[parameters]\n${parametersTsv}\n\n[measurements]\n${measurementsTsv}\n\n[conditions]\n${conditionsTsv}`,
      );
    } catch (e) {
      console.error('Auto-generate failed', e);
      if (importMode === 'csv') {
        setDataInput(DEFAULT_TEST_DATA);
      }
    }
  };

  const handleRunEstimation = async () => {
    if (!canRun || !model) return;

    setError(null);
    setResult(null);
    setIsRunning(true);
    setProgress({ current: 0, total: parseInt(nIterations), elbo: 0 });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const maxEval = parseInt(nIterations);
      setProgress({ current: 0, total: maxEval, elbo: 0 });

      // Prepare cached model in worker to avoid re-parsing on every eval.
      const modelId = await bnglService.prepareModel(model);

      let effectiveData = parsedData;
      let effectiveParamBounds = priors.map(p => ({
        name:    p.name,
        initial: p.mean,
        min:     p.min,
        max:     p.max,
      }));

      if (importMode === 'petab') {
        try {
          const petab = hasRequiredPetabFiles
            ? parsePEtab(buildPetabFileMap())
            : parsePEtabCombined(petabText);

          if (petab.warnings.length > 0) {
            console.warn('[PEtab]', petab.warnings.join('; '));
          }

          if (petab.measurements.length === 0) {
            setError('PEtab parse error: no measurements were parsed.');
            return;
          }
          if (petab.paramBounds.length === 0) {
            setError('PEtab parse error: no estimated parameters found (estimate=1).');
            return;
          }

          effectiveData = petab.measurements;
          effectiveParamBounds = petab.paramBounds;
          setSelectedParams(petab.paramBounds.map((p) => p.name));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          setError(`PEtab parse error: ${message}`);
          return;
        }
      }

      const paramsSnapshot = effectiveParamBounds.map((p) => p.name);
      const priorMeansSnapshot = effectiveParamBounds.map((p) => p.initial);

      const fitResult = await fitParameters({
        model,
        modelId,
        paramBounds: effectiveParamBounds,
        experimentalData: effectiveData,
        algorithm,
        maxEval,
        bpslConstraints: bpslText,
        bpslWeight: 1.0,
        regularization: regType !== 'none' ? {
          type: regType,
          lambda: parseFloat(regLambda) || 0.01,
        } : undefined,
        signal: controller.signal,
        onProgress: (p) => {
          if (isMountedRef.current) {
            setProgress({ current: p.nEval, total: maxEval, elbo: p.sse });
          }
        },
      });

      if (isMountedRef.current) {
        setFitInputData(effectiveData);
        const credibleIntervals = fitResult.confidenceIntervals;
        const posteriorStd = credibleIntervals.map(ci =>
          (ci.upper - ci.lower) / 2
        );
        const percentilesPerParam = fitResult.params.map((v, i) => ({
          q1:     v - posteriorStd[i] * 0.675,
          median: v,
          q3:     v + posteriorStd[i] * 0.675,
        }));

        setResult({
          parameters:        fitResult.paramNames,
          posteriorMean:     fitResult.params,
          posteriorStd,
          elbo:              fitResult.sseHistory,
          convergence:       fitResult.converged,
          iterations:        fitResult.iterations,
          rmse:              fitResult.rmse,
          sse:               fitResult.sse,
          rSquared:          fitResult.rSquared,
          bestPredictions:   fitResult.bestPredictions,
          credibleIntervals,
          percentiles:       percentilesPerParam,
          priorMeans:        priorMeansSnapshot,
          algorithm:         fitResult.algorithm,
          bpslResults:       fitResult.bpslResults,
        });

        // Initialize visible series for results
        const obsNames = Array.from(fitResult.bestPredictions?.keys() || []);
        const initialVisible = new Set<string>();
        obsNames.forEach(obs => {
          initialVisible.add(`${obs} (Exp)`);
          initialVisible.add(`${obs} (Fit)`);
        });
        setVisibleFitSeries(initialVisible);
      }

    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (isMountedRef.current) setError('Estimation cancelled');
      } else {
        const message = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) setError(`Estimation failed: ${message}`);
      }
    } finally {
      if (isMountedRef.current) setIsRunning(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Format results for chart
  const posteriorChartData = useMemo(() => {
    if (!result) return [];

    return result.parameters.map((name, i) => {
      const mean  = result.posteriorMean[i] ?? 0;
      const lower = result.credibleIntervals[i]?.lower ?? mean;
      const upper = result.credibleIntervals[i]?.upper ?? mean;
      const safeMean = Math.max(mean, 1e-15);
      const safeLower = Math.max(lower, 1e-15);
      const safeUpper = Math.max(upper, 1e-15);
      
      return {
        name,
        mean: safeMean,
        lower: safeLower,
        upper: safeUpper,
        // Range for floating bar [min, max]
        range: [safeLower, safeUpper],
        prior: Math.max(result.priorMeans[i] ?? safeMean, 1e-15),
        ciHalfWidth: result.posteriorStd[i] ?? 0,
      };
    });
  }, [result]);

  const elboChartData = useMemo(() => {
    if (!result?.elbo) return [];
    return result.elbo.map((value, i) => ({ iteration: i, elbo: Math.max(value, 1e-15) }));
  }, [result]);

  const fitComparisonData = useMemo(() => {
    if (!result?.bestPredictions) return [];

    const sourceData = fitInputData.length > 0 ? fitInputData : parsedData;
    if (sourceData.length === 0) return [];

    return sourceData.map((d, i) => {
      const entry: any = { time: d.time };
      for (const [obsName, expVal] of Object.entries(d.values)) {
        entry[`${obsName} (Exp)`] = expVal;
      }
      for (const [obsName, predData] of result.bestPredictions!) {
        entry[`${obsName} (Fit)`] = predData[i] ?? 0;
      }
      return entry;
    });
  }, [result, fitInputData, parsedData]);

  const fitComparisonSeries = useMemo<TimeSeriesSeries[]>(() => {
    if (!result?.bestPredictions) return [];
    
    const obsNames = Array.from(result.bestPredictions.keys());
    return obsNames.flatMap((obs, idx) => {
      const color = CHART_COLORS[idx % CHART_COLORS.length];
      return [
        {
          name: `${obs} (Exp)`,
          color,
          type: 'scatter'
        },
        {
          name: `${obs} (Fit)`,
          color,
          type: 'line',
          strokeWidth: 2,
          dot: false
        }
      ];
    });
  }, [result]);

  if (!model) {
    return <EmptyState title="No Model Loaded" description="Parse a model to perform parameter estimation." />;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">
      {/* Sidebar - Configuration */}
      <div className="lg:w-80 flex-shrink-0 space-y-4 overflow-y-auto pr-2">
        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            1. Select Parameters
          </h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {parameterNames.map(name => (
              <label key={name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-800 p-1 rounded transition-colors text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={selectedParams.includes(name)}
                  onChange={() => handleParamToggle(name)}
                  className="rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500"
                />
                <span className="truncate flex-1 font-mono text-xs" title={name}>{name}</span>
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-700 px-1 rounded">
                  {formatValue(model.parameters[name])}
                </span>
              </label>
            ))}
          </div>
          {selectedParams.length === 0 && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
              ⚠️ At least one parameter must be selected.
            </p>
          )}
        </Card>

        {selectedParams.length > 0 && (
          <Card className="p-4 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              2. Prior Distributions
            </h3>
            <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
              {priors.map(prior => (
                <div key={prior.name} className="space-y-2 p-2 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 rounded-md border border-slate-100 dark:border-slate-700">
                  <div className="text-xs font-bold font-mono text-teal-700 dark:text-teal-400 truncate" title={prior.name}>
                    {prior.name}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Mean</label>
                      <Input
                        type="number"
                        step="any"
                        value={prior.mean}
                        onChange={e => updatePrior(prior.name, 'mean', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs px-1.5"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Std</label>
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        value={prior.std}
                        onChange={e => updatePrior(prior.name, 'std', parseFloat(e.target.value) || 0.1)}
                        className="h-7 text-xs px-1.5"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Min</label>
                      <Input
                        type="number"
                        step="any"
                        value={prior.min}
                        onChange={e => updatePrior(prior.name, 'min', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs px-1.5"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Max</label>
                      <Input
                        type="number"
                        step="any"
                        value={prior.max}
                        onChange={e => updatePrior(prior.name, 'max', parseFloat(e.target.value) || 10)}
                        className="h-7 text-xs px-1.5"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            3. Estimation Settings
          </h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Algorithm</label>
              <select 
                value={algorithm} 
                onChange={e => setAlgorithm(e.target.value as FitAlgorithm)}
                className="w-full h-8 text-xs bg-white dark:bg-slate-900 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-md px-2 focus:ring-2 focus:ring-teal-500 outline-none"
              >
                <option value="nelder-mead">Nelder-Mead (Local)</option>
                <option value="sbplx">Subplex (Robust Local)</option>
                <option value="bobyqa">BOBYQA (Derivative-free)</option>
                <option value="projected-nm">Projected NM (Bounded)</option>
                <option value="de">Differential Evolution (Global)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Max Iterations</label>
              <Input
                type="number"
                min={50}
                max={5000}
                value={nIterations}
                onChange={e => setNIterations(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex gap-2 items-center mt-2">
              <label className="text-xs text-slate-600 dark:text-slate-400">Regularization:</label>
              <select
                className="text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1"
                value={regType}
                onChange={e => setRegType(e.target.value as 'none' | 'l1' | 'l2' | 'elastic-net')}
              >
                <option value="none">None</option>
                <option value="l1">L1 / Lasso (sparsity)</option>
                <option value="l2">L2 / Ridge (shrinkage)</option>
                <option value="elastic-net">Elastic Net (both)</option>
              </select>
              {regType !== 'none' && (
                <Input
                  className="w-20 text-xs"
                  type="number"
                  step="0.001"
                  value={regLambda}
                  onChange={e => setRegLambda(e.target.value)}
                  placeholder="lambda"
                />
              )}
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Qualitative Constraints (BPSL)
              </label>
              <textarea
                className="w-full h-20 text-xs font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-2"
                placeholder={`# One constraint per line\nmonotone_increasing B\nsteady_state A 0.01\npeak_before B 50`}
                value={bpslText}
                onChange={e => setBpslText(e.target.value)}
                spellCheck={false}
              />
              <p className="text-[10px] text-slate-500 mt-0.5">
                PyBioNetFit-compatible BPSL constraints. See{' '}
                <a href="https://pybnf.readthedocs.io" target="_blank" rel="noopener noreferrer" className="underline">docs</a>.
              </p>
            </div>
          </div>
          
          <Button 
            className="w-full mt-4" 
            variant="primary"
            onClick={handleRunEstimation}
            disabled={!canRun}
          >
            {isRunning ? 'Running Estimation...' : 'Run Estimation'}
          </Button>
          {!isRunning && importMode === 'csv' && parsedData.length > 0 && sharedObsNames.length === 0 && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 font-medium">
              ⚠️ Cannot run: The experimental data has no observables that match the current model. Check the column names!
            </p>
          )}

          {isRunning && (
            <Button variant="danger" onClick={handleCancel} className="w-full border-red-200 text-red-700 bg-red-50 hover:bg-red-100 h-8 text-xs">
              Cancel
            </Button>
          )}
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 space-y-6 overflow-y-auto">
        {/* Experimental Data Editor - show when not results or as collapsible */}
        {(!result || isRunning) && (
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Experimental Data Editor
              </h3>
              <div className="flex gap-2">
                <Button 
                  variant="subtle" 
                  className="h-6 px-2 text-[10px]" 
                  onClick={handleAutoGenerateInput}
                >
                  Auto-Generate
                </Button>
                <Button variant="subtle" className="h-6 px-2 text-[10px]" onClick={clearCurrentInput}>Clear</Button>
              </div>
            </div>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                className={`text-xs px-2 py-1 rounded ${importMode === 'csv' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
                onClick={() => setImportMode('csv')}
              >
                CSV
              </button>
              <button
                type="button"
                className={`text-xs px-2 py-1 rounded ${importMode === 'petab' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
                onClick={() => setImportMode('petab')}
              >
                PEtab
              </button>
            </div>

            {importMode === 'csv' ? (
              <textarea
                value={dataInput}
                onChange={e => setDataInput(e.target.value)}
                className="w-full h-32 p-3 font-mono text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                spellCheck={false}
                placeholder="# time, Obs1, Obs2..."
              />
            ) : (
              <div className="space-y-2">
                <textarea
                  className="w-full h-32 text-xs font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-2"
                  placeholder={`[parameters]\nparameterId\tlowerBound\tupperBound\tnominalValue\testimate\tparameterScale\nkf\t1e-5\t1e3\t0.1\t1\tlog10\nkr\t1e-5\t1e3\t0.01\t1\tlog10\n\n[measurements]\nobservableId\ttime\tmeasurement\nA\t0\t100\nA\t10\t67\nB\t0\t0\nB\t10\t33`}
                  value={petabText}
                  onChange={e => setPetabText(e.target.value)}
                  spellCheck={false}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
                  <div className="space-y-1">
                    <div className="text-slate-600 dark:text-slate-400">Parameters TSV</div>
                    <div className="flex items-center gap-2">
                      <input id="petab-parameters-upload" type="file" accept=".tsv,.txt" className="sr-only" onChange={(e) => handlePetabFileUpload('parameters', e)} />
                      <label htmlFor="petab-parameters-upload" className="inline-flex h-7 items-center rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-2 text-[10px] font-semibold text-slate-700 dark:text-slate-100 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                        Choose File
                      </label>
                      <span className="truncate text-slate-500 dark:text-slate-400">{petabFiles.parameters?.name ?? 'No file selected'}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-slate-600 dark:text-slate-400">Measurements TSV</div>
                    <div className="flex items-center gap-2">
                      <input id="petab-measurements-upload" type="file" accept=".tsv,.txt" className="sr-only" onChange={(e) => handlePetabFileUpload('measurements', e)} />
                      <label htmlFor="petab-measurements-upload" className="inline-flex h-7 items-center rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-2 text-[10px] font-semibold text-slate-700 dark:text-slate-100 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                        Choose File
                      </label>
                      <span className="truncate text-slate-500 dark:text-slate-400">{petabFiles.measurements?.name ?? 'No file selected'}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-slate-600 dark:text-slate-400">Conditions TSV (optional)</div>
                    <div className="flex items-center gap-2">
                      <input id="petab-conditions-upload" type="file" accept=".tsv,.txt" className="sr-only" onChange={(e) => handlePetabFileUpload('conditions', e)} />
                      <label htmlFor="petab-conditions-upload" className="inline-flex h-7 items-center rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-2 text-[10px] font-semibold text-slate-700 dark:text-slate-100 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                        Choose File
                      </label>
                      <span className="truncate text-slate-500 dark:text-slate-400">{petabFiles.conditions?.name ?? 'No file selected'}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-slate-600 dark:text-slate-400">Observables TSV (optional)</div>
                    <div className="flex items-center gap-2">
                      <input id="petab-observables-upload" type="file" accept=".tsv,.txt" className="sr-only" onChange={(e) => handlePetabFileUpload('observables', e)} />
                      <label htmlFor="petab-observables-upload" className="inline-flex h-7 items-center rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-2 text-[10px] font-semibold text-slate-700 dark:text-slate-100 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                        Choose File
                      </label>
                      <span className="truncate text-slate-500 dark:text-slate-400">{petabFiles.observables?.name ?? 'No file selected'}</span>
                    </div>
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <div className="text-slate-600 dark:text-slate-400">problem.yaml (optional)</div>
                    <div className="flex items-center gap-2">
                      <input id="petab-problem-upload" type="file" accept=".yaml,.yml,.txt" className="sr-only" onChange={(e) => handlePetabFileUpload('problem', e)} />
                      <label htmlFor="petab-problem-upload" className="inline-flex h-7 items-center rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-2 text-[10px] font-semibold text-slate-700 dark:text-slate-100 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                        Choose File
                      </label>
                      <span className="truncate text-slate-500 dark:text-slate-400">{petabFiles.problem?.name ?? 'No file selected'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-[10px]">
              {importMode === 'csv' ? (
                <>
                  <span className="text-slate-500 dark:text-slate-400">Observables: {observableNames.join(', ')}</span>
                  {dataError ? (
                    <span className="text-red-500 font-bold">{dataError}</span>
                  ) : parsedData.length > 0 ? (
                    <span className={`font-bold ${sharedObsNames.length > 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
                      {sharedObsNames.length > 0 ? `✓ ${parsedData.length} TP | ${sharedObsNames.length} Matching Obs` : `⚠️ No matching observables!`}
                    </span>
                  ) : <span className="text-slate-400">No data parsed</span>}
                </>
              ) : (
                <>
                  <span className="text-slate-500 dark:text-slate-400">
                    PEtab mode ({hasRequiredPetabFiles ? 'using uploaded files' : 'using combined text'})
                  </span>
                  <span className="text-slate-400">
                    {petabPreview?.error
                      ? `Parse error: ${petabPreview.error}`
                      : petabPreview
                        ? `${petabPreview.timePoints} TP | ${petabPreview.observableCount} Obs`
                        : Object.values(petabFiles).filter(Boolean).length > 0
                          ? `${Object.values(petabFiles).filter(Boolean).length} file(s) loaded`
                          : 'Parsed at run time'}
                  </span>
                </>
              )}
            </div>
          </Card>
        )}

        {!result && !isRunning && !error && (
          <EmptyState 
            title="Ready to Estimate" 
            description="Select parameters and priors, then upload experimental data to begin the inference process."
          />
        )}

        {/* Progress & Error */}
        {isRunning && (
          <Card className="p-6">
            <div className="space-y-4 text-center">
              <LoadingSpinner className="mx-auto w-12 h-12 text-teal-600" />
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Executing Global Optimization
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Fitting model {model.name || 'current'} to experimental data using {algorithm}...
                </p>
                <div className="flex items-center justify-between text-xs font-mono px-4 pt-2">
                  <span>Eval {progress.current} / {progress.total}</span>
                  <span>SSE: {formatValue(progress.elbo)}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800/50 rounded-full h-3 relative overflow-hidden">
                  <div 
                    className="absolute inset-y-0 left-0 bg-teal-500 transition-all duration-300 shadow-[0_0_8px_rgba(20,184,166,0.5)]" 
                    style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {error && <StatusMessage status={{ type: 'error', message: error }} onClose={() => setError(null)} />}

        {result && (
          <div className="space-y-6">
            {/* Summary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 border-l-4 border-teal-500 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-10">
                  <div className="w-12 h-12 rounded-full border-4 border-teal-500" />
                </div>
                <h4 className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Root Mean Square Error</h4>
                <div className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {formatValue(result.rmse)}
                </div>
                <div className="text-[10px] text-teal-600 font-medium mt-1">Lower is better</div>
              </Card>
              <Card className="p-4 border-l-4 border-sky-500">
                <h4 className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Pearson R² Score</h4>
                <div className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {result.rSquared.toFixed(4)}
                </div>
                <div className="text-[10px] text-sky-600 font-medium mt-1">Target: high (near 1.0)</div>
              </Card>
              <Card className="p-4 border-l-4 border-indigo-500">
                <h4 className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Total Iterations</h4>
                <div className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {result.iterations}
                </div>
                <div className="text-[10px] text-indigo-600 font-medium mt-1">using {result.algorithm}</div>
              </Card>
            </div>

            {/* Results Table */}
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Optimizer State / Parameter Statistics
                </h3>
              </div>
              <DataTable
                headers={['Parameter', 'Best Estimate', '95% Confidence Interval', 'Initial (Prior)']}
                rows={result.parameters.map((p, i) => [
                  <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400" key={p}>{p}</span>,
                  <span className="font-mono text-xs" key={p}>{formatValue(result.posteriorMean[i])}</span>,
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400" key={p}>
                    [{formatValue(result.credibleIntervals[i]?.lower)} , {formatValue(result.credibleIntervals[i]?.upper)}]
                  </span>,
                  <span className="font-mono text-xs text-slate-400" key={p}>{formatValue(result.priorMeans[i])}</span>,
                ])}
              />
            </Card>

            {result.bpslResults && result.bpslResults.details.length > 0 && (
              <Card className="p-4 space-y-2">
                <h4 className="text-xs font-semibold">Qualitative Constraints (BPSL)</h4>
                <div className="space-y-1">
                  {result.bpslResults.details.map((d, i) => (
                    <div
                      key={i}
                      className={`text-xs px-2 py-1 rounded ${
                        d.satisfied
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}
                    >
                      <span className="font-mono">{d.constraint.source}</span>
                      <span className="ml-2">-&gt; {d.message}</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs mt-2 text-slate-500">
                  Total BPSL penalty: {result.bpslResults.totalPenalty.toExponential(3)}
                </div>
              </Card>
            )}

            {/* Confidence Intervals Plot */}
            <Card className="p-4 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Posterior Estimates Map (Hessian-based 95% CI)
              </h3>
              <div className="h-[320px] w-full">
                <ResponsiveContainer>
                  <ComposedChart 
                    data={posteriorChartData} 
                    layout="vertical"
                    margin={{ top: 20, right: 30, left: 30, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(128,128,128,0.1)" />
                    <XAxis 
                      type="number" 
                      scale="log" 
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => formatValue(v)}
                      tick={{ fontSize: 10 }}
                      label={{ value: 'Parameter Value (log scale)', position: 'bottom', offset: 15, fontSize: 11, fontWeight: 'bold' }}
                    />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <Tooltip 
                      formatter={(v: any, name?: string | number) => {
                        // Filter out 'name' keys and other internal Recharts properties that might leak into tooltip
                        if (name === 'name' || name === 'Parameter' || name === 'range') return [];
                        
                        if (Array.isArray(v)) {
                          return [`${formatValue(v[0])} - ${formatValue(v[1])}`, '95% CI'];
                        }
                        return [formatValue(v), String(name)];
                      }}
                      contentStyle={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                        borderRadius: '8px', 
                        border: 'none', 
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                        fontSize: '12px',
                        padding: '10px'
                      }}
                    />
                    {/* Legend matches the components below */}
                    <Legend verticalAlign="top" height={36} />
                    
                    {/* The "Region" - floating bar from lower to upper */}
                    <Bar dataKey="range" fill="#0d9488" fillOpacity={0.15} radius={[2, 2, 2, 2]} name="95% Confidence Region" />
                    
                    {/* Prior Mean - placed behind Best Fit, diamond shape */}
                    <Scatter 
                      dataKey="prior" 
                      fill="#94a3b8" 
                      name="Prior Mean" 
                      shape={(props: any) => {
                        const { cx, cy, fill, stroke, strokeWidth } = props;
                        const size = 6; // Half-width
                        return (
                          <path 
                            d={`M${cx},${cy-size} L${cx+size},${cy} L${cx},${cy+size} L${cx-size},${cy} Z`} 
                            fill={fill} 
                            stroke={stroke} 
                            strokeWidth={strokeWidth} 
                          />
                        );
                      }}
                      stroke="#fff" 
                      strokeWidth={1} 
                    />
                    
                    {/* Best Fit Estimate - primary point, circle with white border to pop */}
                    <Scatter 
                      dataKey="mean" 
                      fill="#0d9488" 
                      name="Best Fit Estimate" 
                      shape={(props: any) => {
                        const { cx, cy, fill, stroke, strokeWidth } = props;
                        return (
                          <circle 
                            cx={cx} 
                            cy={cy} 
                            r={5} 
                            fill={fill} 
                            stroke={stroke} 
                            strokeWidth={strokeWidth} 
                          />
                        );
                      }}
                      stroke="#fff" 
                      strokeWidth={1.5} 
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card className="p-4 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Time-Course Fit Comparison
                </h3>
                <div className="h-[480px] w-full mb-2">
                  <TimeSeriesChart
                    data={fitComparisonData}
                    series={fitComparisonSeries}
                    visibleSeries={visibleFitSeries}
                    onSeriesToggle={(name) => {
                      const next = new Set(visibleFitSeries);
                      if (next.has(name)) next.delete(name);
                      else next.add(name);
                      setVisibleFitSeries(next);
                    }}
                    onSeriesIsolate={(name) => {
                      if (visibleFitSeries.size === 1 && visibleFitSeries.has(name)) {
                        const allNames = new Set<string>(fitComparisonSeries.map(s => s.name));
                        setVisibleFitSeries(allNames);
                      } else {
                        setVisibleFitSeries(new Set([name]));
                      }
                    }}
                    yAxisLabel="Amount"
                    animationDuration={1500}
                  />
                </div>
              </Card>

              {/* SSE Convergence */}
              <Card className="p-4 space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Optimization Path (Residual Convergence)
                </h3>
                <div className="h-[480px] w-full mb-2 text-slate-700 dark:text-slate-300">
                  <ResponsiveContainer>
                    <LineChart
                      data={elboChartData.map(d => ({ ...d, logElbo: d.elbo > 0 ? Math.log10(d.elbo) : null }))}
                      margin={{ top: 10, right: 20, left: 10, bottom: 36 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                      <XAxis
                        dataKey="iteration"
                        type="number"
                        domain={[0, 'dataMax']}
                        label={{ value: 'Iteration', position: 'bottom', offset: 15, fill: 'currentColor', fontSize: 13, fontWeight: 'bold' }}
                        tickCount={6}
                        tickMargin={6}
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        tickLine={{ stroke: 'currentColor', strokeOpacity: 0.5 }}
                        axisLine={{ stroke: 'currentColor', strokeOpacity: 0.5 }}
                      />
                      <YAxis
                        dataKey="logElbo"
                        label={{ value: 'log₁₀(SSE)', angle: -90, position: 'insideLeft', fill: 'currentColor', fontSize: 13, fontWeight: 'bold', offset: -10, style: { textAnchor: 'middle' } }}
                        tickCount={5}
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        tickLine={{ stroke: 'currentColor', strokeOpacity: 0.5 }}
                        axisLine={{ stroke: 'currentColor', strokeOpacity: 0.5 }}
                        tickFormatter={(v) => {
                          if (!Number.isFinite(v)) return '';
                          const exp = Math.round(v);
                          const mantissa = Math.pow(10, v - exp);
                          return mantissa >= 1.05 ? `${mantissa.toFixed(1)}e${exp}` : `1e${exp}`;
                        }}
                      />
                      <Tooltip
                        labelFormatter={(label) => `Iteration: ${label}`}
                        formatter={(v: any) => [formatValue(Math.pow(10, Number(v))), 'SSE']}
                        contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="logElbo"
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                        animationDuration={1500}
                        animationEasing="ease-out"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex justify-center">
                  <div className="flex items-center gap-1.5">
                    <div style={{ width: 14, height: 2, backgroundColor: '#ef4444' }} />
                    <span className="text-[10px] text-slate-600 dark:text-slate-400">SSE (log scale)</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
