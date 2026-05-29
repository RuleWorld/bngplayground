import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BNGLModel } from '../../types';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Card } from '../ui/Card';
import { DataTable } from '../ui/DataTable';
import { bnglService } from '../../services/bnglService';
import { CHART_COLORS } from '../../src/utils/chartColors';
import HeatmapChart from '../HeatmapChart';


// reusable helpers for parameter scanning logic and formatting
import {
  roundForInput,
  computeDefaultBounds,
  generateRange,
  formatNumber,
} from '@bngplayground/engine';
import { TimeSeriesChart, TimeSeriesSeries } from '../charts/TimeSeriesChart';

interface ParameterScanTabProps {
  model: BNGLModel | null;
}

type ScanMode = '1d' | '2d';

interface OneDPoint {
  parameterValue: number;
  observables: Record<string, number>;
}

interface OneDResult {
  parameterName: string;
  values: OneDPoint[];
}

interface TwoDResult {
  parameterNames: [string, string];
  xValues: number[];
  yValues: number[];
  grid: Record<string, number[][]>;
}


export const ParameterScanTab: React.FC<ParameterScanTabProps> = ({ model }) => {
  const [scanType, setScanType] = useState<ScanMode>('1d');
  const [parameter1, setParameter1] = useState('');
  const [parameter2, setParameter2] = useState('');
  const [param1Start, setParam1Start] = useState('');
  const [param1End, setParam1End] = useState('');
  const [param1Steps, setParam1Steps] = useState('5');
  const [param2Start, setParam2Start] = useState('');
  const [param2End, setParam2End] = useState('');
  const [param2Steps, setParam2Steps] = useState('5');
  const [method, setMethod] = useState<'ode' | 'ssa'>('ode');
  const [solver, setSolver] = useState<'auto' | 'cvode' | 'cvode_sparse' | 'rosenbrock23' | 'rk45' | 'rk4' | 'webgpu_rk4'>('auto');
  const [tEnd, setTEnd] = useState('100');
  const [nSteps, setNSteps] = useState('100');
  const [selectedObservable, setSelectedObservable] = useState('');
  const [oneDResult, setOneDResult] = useState<OneDResult | null>(null);
  const [twoDResult, setTwoDResult] = useState<TwoDResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isLogScale, setIsLogScale] = useState(false);

  // Series visibility for 1D chart
  const [visibleObservables, setVisibleObservables] = useState<Set<string>>(new Set());

  // Neural ODE Surrogate state
  const [useSurrogate, setUseSurrogate] = useState(false);
  const [surrogateStatus, setSurrogateStatus] = useState<'none' | 'training' | 'ready' | 'error'>('none');
  const [surrogateProgress, setSurrogateProgress] = useState<{
    phase: 'data' | 'train';
    current: number;
    total: number;
    loss: number;
  }>({ phase: 'data', current: 0, total: 0, loss: 0 });
  const [surrogateMetrics, setSurrogateMetrics] = useState<{ mse: number; mae: number; r2: number[] } | null>(null);
  const [activeBackend, setActiveBackend] = useState<string>('');
  const surrogateRef = useRef<any>(null); // Will hold NeuralODESurrogate instance

  // Surrogate training controls (defaults enabled)
  const [surrogateTrainingSims, setSurrogateTrainingSims] = useState('200');
  const [surrogateTrainingEpochs, setSurrogateTrainingEpochs] = useState('100');
  // Network size: 'auto' | 'light' | 'standard' | 'full'
  const [surrogateNetworkSize, setSurrogateNetworkSize] = useState<'auto' | 'light' | 'standard' | 'full'>('auto');

  // Use refs for lifecycle-bound cancellers and mounts to avoid setState-after-unmount races
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const cachedModelIdRef = useRef<number | null>(null);

  const previousModelRef = useRef<BNGLModel | null>(null);
  const previousParameter1 = useRef<string | null>(null);
  const previousParameter2 = useRef<string | null>(null);

  // keep track of whether each entry is a parameter or a species so we can
  // show appropriate hints and compute default bounds correctly.
  const parameterTypeMap = useMemo(() => {
    const map: Record<string, 'parameter' | 'species'> = {};
    if (!model) return map;
    Object.keys(model.parameters).forEach((p) => (map[p] = 'parameter'));
    model.species.forEach((s) => (map[s.name] = 'species'));
    return map;
  }, [model]);

  const parameterNames = useMemo(() => Object.keys(parameterTypeMap), [parameterTypeMap]);
  const observableNames = useMemo(() => (model ? model.observables.map((obs) => obs.name) : []), [model]);

  const speciesMap = useMemo(() => {
    const map = new Map<string, NonNullable<BNGLModel['species']>[number]>();
    if (model) {
      model.species.forEach(s => map.set(s.name, s));
    }
    return map;
  }, [model]);

  // map from a parameter name to any species whose initialExpression references it
  const paramToSpecies = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    if (!model) return map;
    model.species.forEach((s) => {
      if (s.initialExpression) {
        const tokens = s.initialExpression.match(/\b[A-Za-z_]\w*\b/g) || [];
        tokens.forEach((tok) => {
          if (tok in model.parameters) {
            map[tok] = map[tok] || [];
            if (!map[tok].includes(s.name)) map[tok].push(s.name);
          }
        });
      }
    });
    return map;
  }, [model]);

  useEffect(() => {
    if (!model) {
      setParameter1('');
      setParameter2('');
      setSelectedObservable('');
      setOneDResult(null);
      setTwoDResult(null);
      setParam1Start('');
      setParam1End('');
      setParam2Start('');
      setParam2End('');
      previousModelRef.current = null;
      previousParameter1.current = null;
      previousParameter2.current = null;
      return;
    }

    if (previousModelRef.current !== model) {
      setParam1Start('');
      setParam1End('');
      setParam2Start('');
      setParam2End('');
      previousParameter1.current = null;
      previousParameter2.current = null;
      previousModelRef.current = model;
    }

    if (!parameterNames.includes(parameter1)) {
      setParameter1(parameterNames[0] ?? '');
    }

    if (!parameterNames.includes(parameter2) || parameter2 === parameter1) {
      const secondChoice = parameterNames.find((name) => name !== parameter1);
      setParameter2(secondChoice ?? parameterNames[0] ?? '');
    }

    if (!selectedObservable || !observableNames.includes(selectedObservable)) {
      setSelectedObservable(observableNames[0] ?? '');
    }
  }, [model, parameter1, parameter2, parameterNames, observableNames, selectedObservable]);

  useEffect(() => {
    if (!model) return;
    if (parameter1 && previousParameter1.current !== parameter1) {
      previousParameter1.current = parameter1;
      setParam1Start('');
      setParam1End('');
    }
  }, [model, parameter1]);

  useEffect(() => {
    if (!model) return;
    if (parameter2 && previousParameter2.current !== parameter2) {
      previousParameter2.current = parameter2;
      setParam2Start('');
      setParam2End('');
    }
  }, [model, parameter2]);

  useEffect(() => {
    setOneDResult(null);
    setTwoDResult(null);
  }, [scanType]);

  // Cleanup surrogate when model changes
  useEffect(() => {
    if (surrogateRef.current) {
      surrogateRef.current.dispose?.();
      surrogateRef.current = null;
      setSurrogateStatus('none');
      setSurrogateMetrics(null);
    }
  }, [model]);

  const cancelActiveScan = useCallback((reason?: string) => {
    const controller = scanAbortControllerRef.current;
    if (controller) {
      controller.abort(reason ?? 'Parameter scan cancelled.');
      scanAbortControllerRef.current = null;
    }
  }, []);

  // Train Neural ODE Surrogate
  const handleTrainSurrogate = useCallback(async () => {
    if (!model || !parameter1) return;

    const nTrainingSamples = Math.max(5, Math.min(2000, Math.floor(Number(surrogateTrainingSims) || 200)));
    const trainingEpochs = Math.max(1, Math.min(500, Math.floor(Number(surrogateTrainingEpochs) || 100)));

    setSurrogateStatus('training');
    setSurrogateProgress({ phase: 'data', current: 0, total: nTrainingSamples, loss: 0 });
    setError(null);

    try {
      // Dynamically import TensorFlow.js and surrogate module
      const [tf, { NeuralODESurrogate, SurrogateDatasetGenerator }] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('../../src/services/NeuralODESurrogate')
      ]);

      if (isMountedRef.current) {
        setActiveBackend(tf.getBackend());
      }

      const maybeSwitchBackend = async (backend: string): Promise<boolean> => {
        try {
          const current = tf.getBackend();
          if (current === backend) return true;
          const ok = await tf.setBackend(backend);
          await tf.ready();
          if (ok && isMountedRef.current) {
            setActiveBackend(backend);
          }
          return ok;
        } catch {
          return false;
        }
      };

      const isWebglBackendError = (err: unknown): boolean => {
        const msg = err instanceof Error ? err.message : String(err);
        // Cover a broader set of TFJS/WebGL failures observed in the wild:
        // - shader linking failures
        // - context creation failures
        // - exhausted driver options / ANGLE errors
        // - backend initialization failures
        return /(?:Failed to link vertex and fragment shaders|Failed to create WebGL context|Could not get context for WebGL|Exhausted GL driver options|Initialization of backend webgl failed|webgl creation failed|ANGLE|Exhausted GL driver)/i.test(msg);
      };

      // Determine parameters to vary
      const paramsToVary = scanType === '2d' && parameter2 ? [parameter1, parameter2] : [parameter1];
      const paramRanges: [number, number][] = paramsToVary.map(p => {
        const baseValue = model.parameters[p] ?? 1;
        return [baseValue * 0.1, baseValue * 10];
      });

      // Generate training data using ODE solver
      const timePoints = Array.from({ length: 51 }, (_, i) => i * 2); // 0 to 100

      // Create sample parameter sets.
      // If ranges are strictly positive and span orders of magnitude, sample in log-space.
      const shouldLogSample = paramRanges.every(([min, max]) => min > 0 && max / Math.max(min, 1e-12) >= 50);
      const parameterSets = shouldLogSample
        ? SurrogateDatasetGenerator
          .latinHypercubeSample(paramRanges.map(([min, max]) => [Math.log(min), Math.log(max)]), nTrainingSamples)
          .map((row) => row.map((v) => Math.exp(v)))
        : SurrogateDatasetGenerator.latinHypercubeSample(paramRanges, nTrainingSamples);

      // Run simulations for training data
      const concentrations: number[][][] = [];
      const modelId = await bnglService.prepareModel(model, {});

      for (let i = 0; i < parameterSets.length; i++) {
        const overrides: Record<string, number> = {};
        paramsToVary.forEach((p, idx) => {
          overrides[p] = parameterSets[i][idx];
        });

        const simResult = await bnglService.simulateCached(modelId, overrides, {
          method: 'ode',
          t_end: 100,
          n_steps: 50,
          solver: 'cvode'
        } as any, {});

        // Extract observable values at each time point
        const trajectory: number[][] = simResult.data.map(point =>
          observableNames.map(obs => point[obs] as number ?? 0)
        );
        concentrations.push(trajectory);

        if (isMountedRef.current) {
          setSurrogateProgress((prev) => ({
            ...prev,
            phase: 'data',
            current: i + 1,
            total: nTrainingSamples
          }));
        }

        // Yield occasionally to keep the browser responsive.
        if (i % 2 === 0) {
          await tf.nextFrame();
        }
      }

      await bnglService.releaseModel(modelId);

      // Create training dataset
      const trainingData = {
        parameters: parameterSets,
        timePoints,
        concentrations
      };

      // Create and train surrogate
      let surrogate = new NeuralODESurrogate(paramsToVary.length, observableNames.length);

      const trainWithRetry = async (): Promise<void> => {
        if (isMountedRef.current) {
          setSurrogateProgress((prev) => ({
            ...prev,
            phase: 'train',
            current: 0,
            total: trainingEpochs
          }));
        }

        try {
          await surrogate.train(trainingData, {
            epochs: trainingEpochs,
            batchSize: 16,
            validationSplit: 0.1,
            learningRate: 0.001,
            earlyStopping: true,
            patience: Math.max(10, Math.floor(trainingEpochs / 10)),
            verbose: false,
            onEpochEnd: async (epoch, logs) => {
              if (!isMountedRef.current) return;
              const loss = typeof logs?.loss === 'number' ? (logs.loss as number) : undefined;
              setSurrogateProgress((prev) => ({
                ...prev,
                phase: 'train',
                current: Math.max(prev.current, epoch + 1),
                total: trainingEpochs,
                loss: loss ?? prev.loss
              }));
            }
          });
          return;
        } catch (err) {
          console.error('Surrogate training error (attempting fallback):', err);
          // Some GPUs/drivers fail TFJS WebGL shader compilation/linking.
          // Retry once on CPU backend for robustness (slower but typically reliable).
          // If the error looks like a WebGL/backend initialization failure, fall back to CPU and retry.
          if (!isWebglBackendError(err)) {
            throw err;
          }

          const switched = await maybeSwitchBackend('cpu');
          console.info('maybeSwitchBackend returned', switched, 'current backend after setBackend:', tf.getBackend());
          if (!switched) {
            throw err;
          }

          console.warn('TFJS WebGL shader link failed; falling back to CPU backend for training.');
          if (isMountedRef.current) {
            // Include a short excerpt of the original error to help debugging without flooding the UI
            setError(`WebGL backend failed on this device. Falling back to CPU for surrogate training (slower). Error: ${String(err).slice(0, 300)}`);
          }

          // Dispose of the old surrogate/model and create a fresh one for the new backend
          surrogate.dispose();
          surrogate = new NeuralODESurrogate(paramsToVary.length, observableNames.length);

          // Reset progress for retry
          if (isMountedRef.current) {
            setSurrogateProgress((prev) => ({
              ...prev,
              phase: 'train',
              current: 0,
              total: trainingEpochs
            }));
          }

          await surrogate.train(trainingData, {
            epochs: trainingEpochs,
            batchSize: 16,
            validationSplit: 0.1,
            learningRate: 0.001,
            earlyStopping: true,
            patience: Math.max(10, Math.floor(trainingEpochs / 10)),
            verbose: false,
            onEpochEnd: async (epoch, logs) => {
              if (!isMountedRef.current) return;
              const loss = typeof logs?.loss === 'number' ? (logs.loss as number) : undefined;
              setSurrogateProgress((prev) => ({
                ...prev,
                phase: 'train',
                current: Math.max(prev.current, epoch + 1),
                total: trainingEpochs,
                loss: loss ?? prev.loss
              }));
            }
          });
        }
      };

      try {
        await trainWithRetry();
      } catch (err) {
        console.error('Error after trainWithRetry, will attempt outer CPU retry if applicable:', err);
        // If fallback inside trainWithRetry didn't cover a backend initialization error,
        // attempt one more explicit retry on CPU (covers errors thrown before training loop).
        if (isWebglBackendError(err)) {
          const switched = await maybeSwitchBackend('cpu');
          console.info('Outer retry maybeSwitchBackend returned', switched, 'backend now:', tf.getBackend());
          if (switched) {
            surrogate.dispose();
            surrogate = new NeuralODESurrogate(paramsToVary.length, observableNames.length);
            await trainWithRetry();
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      // Evaluate surrogate
      const testData = {
        parameters: shouldLogSample
          ? SurrogateDatasetGenerator
            .latinHypercubeSample(paramRanges.map(([min, max]) => [Math.log(min), Math.log(max)]), 20)
            .map((row) => row.map((v) => Math.exp(v)))
          : SurrogateDatasetGenerator.latinHypercubeSample(paramRanges, 20),
        timePoints,
        concentrations: [] as number[][][]
      };

      // Generate test data
      const testModelId = await bnglService.prepareModel(model, {});
      for (const params of testData.parameters) {
        const overrides: Record<string, number> = {};
        paramsToVary.forEach((p, idx) => {
          overrides[p] = params[idx];
        });

        const simResult = await bnglService.simulateCached(testModelId, overrides, {
          method: 'ode',
          t_end: 100,
          n_steps: 50,
          solver: 'cvode'
        } as any, {});

        const trajectory = simResult.data.map(point =>
          observableNames.map(obs => point[obs] as number ?? 0)
        );
        testData.concentrations.push(trajectory);
      }
      await bnglService.releaseModel(testModelId);

      const metrics = surrogate.evaluate(testData);

      surrogateRef.current = surrogate;
      if (isMountedRef.current) {
        setSurrogateStatus('ready');
        setSurrogateMetrics(metrics);
      }

    } catch (err) {
      console.error('Surrogate training failed:', err);
      if (isMountedRef.current) {
        setSurrogateStatus('error');
        setError(`Surrogate training failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [model, parameter1, parameter2, scanType, observableNames, surrogateTrainingSims, surrogateTrainingEpochs]);


  const oneDChartData = useMemo(() => {
    if (!oneDResult) return [];
    return oneDResult.values.map((entry) => ({
      [oneDResult.parameterName]: entry.parameterValue,
      ...entry.observables,
    }));
  }, [oneDResult]);

  const oneDChartSeries = useMemo<TimeSeriesSeries[]>(() => {
    return observableNames.map((obs, i) => ({
      name: obs,
      color: CHART_COLORS[i % CHART_COLORS.length]
    }));
  }, [observableNames]);

  // Update visible observables when results arrive
  useEffect(() => {
    if (oneDResult && visibleObservables.size === 0) {
      setVisibleObservables(new Set([selectedObservable]));
    }
  }, [oneDResult, selectedObservable]);

  const heatmapData = useMemo(() => {
    if (!twoDResult || !selectedObservable) return null;
    const matrix = twoDResult.grid[selectedObservable];
    if (!matrix) return null;
    let min = Infinity;
    let max = -Infinity;
    matrix.forEach((row) => {
      row.forEach((value) => {
        if (value < min) min = value;
        if (value > max) max = value;
      });
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 0;
    }
    return { matrix, min, max };
  }, [twoDResult, selectedObservable]);

  const heatmapPoints = useMemo(() => {
    if (!twoDResult || !selectedObservable) return [] as { x: number; y: number; value: number }[];
    const grid = twoDResult.grid[selectedObservable];
    const points: { x: number; y: number; value: number }[] = [];
    for (let yi = 0; yi < twoDResult.yValues.length; yi += 1) {
      for (let xi = 0; xi < twoDResult.xValues.length; xi += 1) {
        points.push({ x: twoDResult.xValues[xi], y: twoDResult.yValues[yi], value: grid[yi][xi] });
      }
    }
    return points;
  }, [twoDResult, selectedObservable]);

  // Do not early-return here; use `guardMessage` in the JSX so hook order stays stable across renders.

  const baseParam1 = useMemo(() => {
    if (!parameter1 || !model) return undefined;
    if (parameter1 in model.parameters) {
      // if scanning a parameter that drives one or more species, use the
      // species' initial concentration as the base value for defaults (makes
      // more sense to the user). fall back to the raw parameter value.
      const deps = paramToSpecies[parameter1];
      if (deps && deps.length > 0) {
        const sp = speciesMap.get(deps[0]);
        if (sp) return sp.initialConcentration;
      }
      return model.parameters[parameter1];
    }
    return speciesMap.get(parameter1)?.initialConcentration;
  }, [parameter1, model, paramToSpecies, speciesMap]);

  const baseParam2 = useMemo(() => {
    if (!parameter2 || !model) return undefined;
    if (parameter2 in model.parameters) {
      const deps = paramToSpecies[parameter2];
      if (deps && deps.length > 0) {
        const sp = speciesMap.get(deps[0]);
        if (sp) return sp.initialConcentration;
      }
      return model.parameters[parameter2];
    }
    return speciesMap.get(parameter2)?.initialConcentration;
  }, [parameter2, model, paramToSpecies, speciesMap]);

  const [defaultParam1Lower, defaultParam1Upper] = useMemo(() => {
    if (baseParam1 === undefined) return [0, 0];
    return computeDefaultBounds(baseParam1);
  }, [baseParam1]);

  const [defaultParam2Lower, defaultParam2Upper] = useMemo(() => {
    if (baseParam2 === undefined) return [0, 0];
    return computeDefaultBounds(baseParam2);
  }, [baseParam2]);

  const defaultParam1Start = baseParam1 !== undefined ? roundForInput(defaultParam1Lower) : '';
  const defaultParam1End = baseParam1 !== undefined ? roundForInput(defaultParam1Upper) : '';
  const defaultParam2Start = baseParam2 !== undefined ? roundForInput(defaultParam2Lower) : '';
  const defaultParam2End = baseParam2 !== undefined ? roundForInput(defaultParam2Upper) : '';

  const effectiveParam1Start = param1Start !== '' ? param1Start : defaultParam1Start;
  const effectiveParam1End = param1End !== '' ? param1End : defaultParam1End;
  const effectiveParam2Start = param2Start !== '' ? param2Start : defaultParam2Start;
  const effectiveParam2End = param2End !== '' ? param2End : defaultParam2End;

  const canRunScan = () => {
    if (!parameter1 || !effectiveParam1Start || !effectiveParam1End || !param1Steps) return false;
    if (isLogScale && (Number(effectiveParam1Start) <= 0 || Number(effectiveParam1End) <= 0)) return false;
    if (scanType === '2d' && (!parameter2 || parameter2 === parameter1 || !effectiveParam2Start || !effectiveParam2End || !param2Steps)) {
      return false;
    }
    if (scanType === '2d' && isLogScale && (Number(effectiveParam2Start) <= 0 || Number(effectiveParam2End) <= 0)) return false;
    return true;
  };

  const handleRunScan = async () => {
    if (!canRunScan()) return;
    if (!model) {
      setError('No model is loaded to run the scan.');
      return;
    }

    cancelActiveScan('Parameter scan replaced by a new request.');

    const start1 = Number(effectiveParam1Start);
    const end1 = Number(effectiveParam1End);
    const steps1 = Math.max(1, Math.floor(Number(param1Steps)));
    if (!Number.isFinite(start1) || !Number.isFinite(end1) || Number.isNaN(steps1) || steps1 < 1) {
      setError('Please provide valid numeric settings for the primary parameter.');
      return;
    }

    const tEndValue = Number(tEnd);
    const nStepsValue = Math.max(1, Math.floor(Number(nSteps)));
    if (!Number.isFinite(tEndValue) || tEndValue <= 0 || Number.isNaN(nStepsValue) || nStepsValue < 1) {
      setError('Simulation settings must have positive numeric values for t_end and steps.');
      return;
    }

    const range1 = generateRange(start1, end1, steps1, isLogScale);
    let totalRuns = range1.length;
    let range2: number[] = [];

    if (scanType === '2d') {
      const start2 = Number(effectiveParam2Start);
      const end2 = Number(effectiveParam2End);
      const steps2 = Math.max(1, Math.floor(Number(param2Steps)));
      if (!Number.isFinite(start2) || !Number.isFinite(end2) || Number.isNaN(steps2) || steps2 < 1) {
        setError('Please provide valid numeric settings for the second parameter.');
        return;
      }
      if (parameter2 === parameter1) {
        setError('Select two different parameters for a 2D scan.');
        return;
      }
      range2 = generateRange(start2, end2, steps2, isLogScale);
      totalRuns = range1.length * range2.length;
    }

    if (totalRuns > 400) {
      setError('Please reduce the number of combinations (limit 400) to keep the scan responsive.');
      return;
    }

    setError(null);
    setIsRunning(true);
    setProgress({ current: 0, total: totalRuns });
    setOneDResult(null);
    setTwoDResult(null);

    const simulationOptions = {
      method,
      t_end: tEndValue,
      n_steps: nStepsValue,
      ...(method === 'ode' ? { solver } : {}),
    } as const;

    const controller = new AbortController();
    scanAbortControllerRef.current = controller;

    // Ensure modelId is visible in finally for best-effort release
    let modelId: number | null = null;

    try {
      // Cache the base model in the worker to avoid serializing the full model for every run.
      modelId = await bnglService.prepareModel(model, { signal: controller.signal });
      cachedModelIdRef.current = modelId;

      if (scanType === '1d') {
        const result: OneDResult = { parameterName: parameter1, values: [] };
        const speciesDeps = paramToSpecies[parameter1] || [];
        let completed = 0;
        for (const value of range1) {
          const overrides: Record<string, number> = { [parameter1]: value };
          // if we're scanning a parameter that also feeds species initial
          // concentrations, make sure the override updates the species too
          speciesDeps.forEach((sname) => {
            overrides[sname] = value;
          });

          const simResults = await bnglService.simulateCached(modelId, overrides, simulationOptions, {
            signal: controller.signal,
            description: `Parameter scan (${parameter1}=${value})`,
          });
          const lastPoint = simResults.data.at(-1) ?? {};
          const observables = observableNames.reduce<Record<string, number>>((acc, name) => {
            const raw = lastPoint[name];
            const numeric = typeof raw === 'number' ? raw : Number(raw ?? 0);
            acc[name] = Number.isFinite(numeric) ? numeric : 0;
            return acc;
          }, {});
          result.values.push({ parameterValue: value, observables });
          completed += 1;
          if (isMountedRef.current) setProgress({ current: completed, total: totalRuns });
        }
        if (isMountedRef.current) setOneDResult(result);
      } else {
        const grid: Record<string, number[][]> = {};
        observableNames.forEach((name) => {
          grid[name] = range2.map(() => new Array(range1.length).fill(0));
        });
        let completed = 0;
        const deps1 = paramToSpecies[parameter1] || [];
        const deps2 = paramToSpecies[parameter2] || [];
        for (let yi = 0; yi < range2.length; yi += 1) {
          for (let xi = 0; xi < range1.length; xi += 1) {
            const overrides: Record<string, number> = {
              [parameter1]: range1[xi],
              [parameter2]: range2[yi],
            };
            deps1.forEach((s) => (overrides[s] = range1[xi]));
            deps2.forEach((s) => (overrides[s] = range2[yi]));
            const simResults = await bnglService.simulateCached(modelId, overrides, simulationOptions, {
              signal: controller.signal,
              description: `2D parameter scan (${parameter1}, ${parameter2})`,
            });
            const lastPoint = simResults.data.at(-1) ?? {};
            observableNames.forEach((name) => {
              const raw = lastPoint[name];
              const numeric = typeof raw === 'number' ? raw : Number(raw ?? 0);
              grid[name][yi][xi] = Number.isFinite(numeric) ? numeric : 0;
            });
            completed += 1;
            if (isMountedRef.current) setProgress({ current: completed, total: totalRuns });
          }
        }
        if (isMountedRef.current) setTwoDResult({
          parameterNames: [parameter1, parameter2],
          xValues: range1,
          yValues: range2,
          grid,
        });
      }
    } catch (scanError) {
      if (scanError instanceof DOMException && scanError.name === 'AbortError') {
        const cancelledByUser = scanError.message?.includes('cancelled by user');
        if (isMountedRef.current) setError(cancelledByUser ? 'Parameter scan was cancelled.' : null);
      } else {
        const message = scanError instanceof Error ? scanError.message : String(scanError);
        if (isMountedRef.current) setError(`Parameter scan failed: ${message}`);
        if (isMountedRef.current) setOneDResult(null);
        if (isMountedRef.current) setTwoDResult(null);
      }
    } finally {
      if (isMountedRef.current) setIsRunning(false);
      const wasAborted = controller.signal.aborted;
      if (scanAbortControllerRef.current === controller) scanAbortControllerRef.current = null;

      // Best-effort release of the prepared model to avoid leaking cached worker state.
      if (typeof modelId === 'number') {
        bnglService.releaseModel(modelId).catch((err) => {

          console.warn('Failed to release cached model after parameter scan', modelId, err);
        });
        if (cachedModelIdRef.current === modelId) cachedModelIdRef.current = null;
      }

      if (!wasAborted) {
        if (isMountedRef.current) setProgress((current) => ({ ...current, current: current.total }));
      }
    }
  };

  // Release any cached model when this component unmounts or when the model changes.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Abort any running scan promptly
      const controller = scanAbortControllerRef.current;
      if (controller) {
        try {
          controller.abort('Component unmounted: aborting parameter scan.');
        } catch (e) {
          // ignore
        }
        scanAbortControllerRef.current = null;
      }

      const id = cachedModelIdRef.current;
      if (typeof id === 'number') {
        bnglService.releaseModel(id).catch((err) => {

          console.warn('Failed to release cached model on ParameterScanTab unmount', id, err);
        });
        cachedModelIdRef.current = null;
      }
    };
  }, [model]);

  const downloadFile = (content: string, fileName: string, mime = 'text/csv') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    // Long-form CSV: param1_name, param1_value, [param2_name, param2_value], observable_name, value
    if (!oneDResult && !twoDResult) return;
    const rows: string[] = [];
    if (oneDResult) {
      const p1Name = oneDResult.parameterName;
      const header = ['param1_name', 'param1_value', 'observable', 'value'];
      rows.push(header.join(','));
      oneDResult.values.forEach((entry) => {
        Object.entries(entry.observables).forEach(([obs, val]) => {
          rows.push([p1Name, entry.parameterValue, obs, val].join(','));
        });
      });
    } else if (twoDResult) {
      const [p1Name, p2Name] = twoDResult.parameterNames;
      const header = ['param1_name', 'param1_value', 'param2_name', 'param2_value', 'observable', 'value'];
      rows.push(header.join(','));
      // iterate y (rows) and x (cols)
      twoDResult.yValues.forEach((yVal, yi) => {
        twoDResult.xValues.forEach((xVal, xi) => {
          Object.keys(twoDResult.grid).forEach((obs) => {
            const val = twoDResult.grid[obs][yi][xi];
            rows.push([p1Name, xVal, p2Name, yVal, obs, val].join(','));
          });
        });
      });
    }

    downloadFile(rows.join('\n'), 'parameter_scan.csv', 'text/csv');
  };

  const handleExportJSON = () => {
    const exportObj = oneDResult ?? twoDResult ?? null;
    if (!exportObj) return;
    downloadFile(JSON.stringify(exportObj, null, 2), 'parameter_scan.json', 'application/json');
  };

  const guardMessage = !model
    ? 'Parse a model to set up a parameter scan.'
    : parameterNames.length === 0
      ? 'The current model does not declare any parameters to scan.'
      : null;

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div>
          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <input type="radio" value="1d" checked={scanType === '1d'} onChange={() => setScanType('1d')} />
              1D Scan
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <input type="radio" value="2d" checked={scanType === '2d'} onChange={() => setScanType('2d')} />
              2D Scan
            </label>
            <label className="flex items-center gap-2 ml-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={isLogScale}
                onChange={(evt) => setIsLogScale(evt.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary"
              />
              Log scale
            </label>
            {isLogScale && (Number(effectiveParam1Start) <= 0 || Number(effectiveParam1End) <= 0) && (
              <div className="text-xs text-red-600 dark:text-red-400 ml-3">Log scale requires positive start/end values for parameter 1.</div>
            )}
            {scanType === '2d' && isLogScale && (Number(effectiveParam2Start) <= 0 || Number(effectiveParam2End) <= 0) && (
              <div className="text-xs text-red-600 dark:text-red-400 ml-3">Log scale requires positive start/end values for parameter 2.</div>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Parameter 1</h4>
            <Select value={parameter1} onChange={(event) => setParameter1(event.target.value)}>
              {parameterNames.map((param) => {
                const isSpecies = parameterTypeMap[param] === 'species';
                let label = param;
                if (isSpecies && model) {
                  const sp = speciesMap.get(param);
                  const expr = sp?.initialExpression || param;
                  label = `${expr} (initial amount for ${param})`;
                }
                return (
                  <option key={param} value={param}>
                    {label}
                  </option>
                );
              })}
            </Select>
            <div className="text-xs text-slate-500 dark:text-slate-300">
              {parameterTypeMap[parameter1] === 'species'
                ? `Numbers correspond to the initial concentration/amount of the selected species. This value is injected directly into the simulator; changing the underlying parameter (${speciesMap.get(parameter1)?.initialExpression || parameter1}) outside of the scan UI will not automatically update the species.`
                : 'Numbers correspond to the value of the selected model parameter.'}
            </div>
            {parameterTypeMap[parameter1] !== 'species' && paramToSpecies[parameter1] && paramToSpecies[parameter1].length > 0 && (
              <div className="text-xs text-yellow-600">
                Scanning this parameter will also update the initial amount of species: {paramToSpecies[parameter1].join(', ')}.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input type="number" value={param1Start} onChange={(event) => setParam1Start(event.target.value)} placeholder={defaultParam1Start || "Start"} />
              <Input type="number" value={param1End} onChange={(event) => setParam1End(event.target.value)} placeholder={defaultParam1End || "End"} />
              <Input type="number" value={param1Steps} min={1} onChange={(event) => setParam1Steps(event.target.value)} placeholder="Steps" />
            </div>
          </div>

          {scanType === '2d' && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Parameter 2</h4>
              <Select value={parameter2} onChange={(event) => setParameter2(event.target.value)}>
                {parameterNames.map((param) => {
                  const isSpecies = parameterTypeMap[param] === 'species';
                  let label = param;
                  if (isSpecies && model) {
                    const sp = speciesMap.get(param);
                    const expr = sp?.initialExpression || param;
                    label = `${expr} (initial amount for ${param})`;
                  }
                  return (
                    <option key={param} value={param}>
                      {label}
                    </option>
                  );
                })}
              </Select>
              <div className="text-xs text-slate-500 dark:text-slate-300">
                {parameterTypeMap[parameter2] === 'species'
                  ? `Numbers correspond to the initial concentration/amount of the selected species. This value is injected directly into the simulator; changing the underlying parameter (${speciesMap.get(parameter2)?.initialExpression || parameter2}) outside of the scan UI will not automatically update the species.`
                  : 'Numbers correspond to the value of the selected model parameter.'}
              </div>
              {parameterTypeMap[parameter2] !== 'species' && paramToSpecies[parameter2] && paramToSpecies[parameter2].length > 0 && (
                <div className="text-xs text-yellow-600">
                  Scanning this parameter will also update the initial amount of species: {paramToSpecies[parameter2].join(', ')}.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input type="number" value={param2Start} onChange={(event) => setParam2Start(event.target.value)} placeholder={defaultParam2Start || "Start"} />
                <Input type="number" value={param2End} onChange={(event) => setParam2End(event.target.value)} placeholder={defaultParam2End || "End"} />
                <Input type="number" value={param2Steps} min={1} onChange={(event) => setParam2Steps(event.target.value)} placeholder="Steps" />
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Method</label>
            <Select value={method} onChange={(event) => setMethod(event.target.value as 'ode' | 'ssa')}>
              <option value="ode">ODE</option>
              <option value="ssa">SSA (Stochastic)</option>
            </Select>
          </div>
          {method === 'ode' && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Solver</label>
              <Select value={solver} onChange={(event) => setSolver(event.target.value as typeof solver)}>
                <option value="cvode">CVODE (Recommended)</option>
                <option value="cvode_sparse">CVODE Sparse</option>
                <option value="rosenbrock23">Rosenbrock23</option>
                <option value="rk45">RK45 (Dormand-Prince)</option>
                <option value="rk4">RK4 (Fixed-step)</option>
                <option value="webgpu_rk4">WebGPU RK4 (Experimental)</option>
                <option value="auto">Auto</option>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">t_end</label>
            <Input type="number" value={tEnd} min={0} onChange={(event) => setTEnd(event.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Steps</label>
            <Input type="number" value={nSteps} min={1} onChange={(event) => setNSteps(event.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span>Select an observable:</span>
            <Select
              value={selectedObservable}
              onChange={(event) => setSelectedObservable(event.target.value)}
              className="w-48"
            >
              {observableNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="subtle" onClick={() => {
              cancelActiveScan('Parameter scan cancelled by user.');
              setOneDResult(null);
              setTwoDResult(null);
              setError(null);
              setProgress({ current: 0, total: 0 });
            }}>
              Clear Results
            </Button>
            {isRunning && (
              <Button variant="danger" onClick={() => cancelActiveScan('Parameter scan cancelled by user.')}>Cancel Scan</Button>
            )}
            <Button onClick={handleRunScan} disabled={isRunning || !canRunScan()}>
              {isRunning ? 'Running…' : 'Run Scan'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Neural ODE Surrogate Card */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              🚀 Neural ODE Surrogate (Beta)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">
              Train a neural network to approximate ODE simulations for 100x faster parameter sweeps
            </p>
          </div>
          <div className="flex items-center gap-2">
            {surrogateStatus === 'ready' && (
              <div className="flex flex-col items-end">
                <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  ✓ Surrogate Ready
                </span>
                {activeBackend && (
                  <span className="text-[10px] text-slate-400 mt-0.5 uppercase">
                    Backend: {activeBackend}
                  </span>
                )}
              </div>
            )}
            {surrogateStatus === 'training' && (
              <div className="flex flex-col items-end">
                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1">
                  <LoadingSpinner className="w-3 h-3" />
                  Training...
                </span>
                {activeBackend && (
                  <span className="text-[10px] text-slate-400 mt-0.5 uppercase">
                    Backend: {activeBackend}
                  </span>
                )}
              </div>
            )}
            {surrogateStatus === 'error' && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                ✗ Training Failed
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={useSurrogate}
              onChange={(e) => setUseSurrogate(e.target.checked)}
              disabled={surrogateStatus !== 'ready'}
              className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary disabled:opacity-50"
            />
            Use surrogate for scans
          </label>

          <div className="grid grid-cols-2 gap-3 items-end">
            <label className="text-xs text-slate-600 dark:text-slate-300">
              Training sims
              <Input
                type="number"
                min={20}
                max={2000}
                step={10}
                value={surrogateTrainingSims}
                onChange={(e) => setSurrogateTrainingSims(e.target.value)}
                disabled={surrogateStatus === 'training'}
                className="mt-1"
              />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-300">
              Epochs
              <Input
                type="number"
                min={10}
                max={500}
                step={10}
                value={surrogateTrainingEpochs}
                onChange={(e) => setSurrogateTrainingEpochs(e.target.value)}
                disabled={surrogateStatus === 'training'}
                className="mt-1"
              />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-300">
              Network Size
              <select
                value={surrogateNetworkSize}
                onChange={(e) => setSurrogateNetworkSize(e.target.value as typeof surrogateNetworkSize)}
                disabled={surrogateStatus === 'training'}
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-600 shadow-sm focus:border-primary focus:ring-primary text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200"
              >
                <option value="auto">Auto (based on species)</option>
                <option value="light">Light [32,32] ~2K params</option>
                <option value="standard">Standard [64,64] ~8K params</option>
                <option value="full">Full [128,128,64] ~25K params</option>
              </select>
            </label>
          </div>

          <Button
            variant="subtle"
            onClick={handleTrainSurrogate}
            disabled={surrogateStatus === 'training' || !model || !parameter1}
          >
            {surrogateStatus === 'training' ? 'Training...' :
              surrogateStatus === 'ready' ? 'Retrain Surrogate' : 'Train Surrogate'}
          </Button>

          {surrogateRef.current && (
            <Button
              variant="subtle"
              onClick={() => {
                surrogateRef.current?.dispose();
                surrogateRef.current = null;
                setSurrogateStatus('none');
                setSurrogateMetrics(null);
                setUseSurrogate(false);
              }}
            >
              Clear Surrogate
            </Button>
          )}
        </div>

        {surrogateStatus === 'training' && (
          <div className="w-full">
            <div className="text-xs text-slate-500 dark:text-slate-300 mb-1">
              {surrogateProgress.phase === 'data'
                ? `Generating training data: ${surrogateProgress.current} / ${surrogateProgress.total}`
                : `Training surrogate: Epoch ${surrogateProgress.current} / ${surrogateProgress.total}`}
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 dark:bg-slate-700">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(surrogateProgress.current / Math.max(1, surrogateProgress.total)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {surrogateMetrics && surrogateStatus === 'ready' && (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 rounded p-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">MSE</div>
              <div className="text-sm font-medium">{surrogateMetrics.mse.toExponential(2)}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 rounded p-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">MAE</div>
              <div className="text-sm font-medium">{surrogateMetrics.mae.toExponential(2)}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 rounded p-2">
              <div className="text-xs text-slate-500 dark:text-slate-300">Mean R²</div>
              <div className="text-sm font-medium">
                {(surrogateMetrics.r2.reduce((a, b) => a + b, 0) / surrogateMetrics.r2.length).toFixed(3)}
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-slate-500 dark:text-slate-300">
          💡 Tip: Train a surrogate once, then run unlimited parameter sweeps instantly.
          Best for exploring large parameter spaces.
        </div>
        {activeBackend === 'cpu' && surrogateStatus !== 'none' && (
          <div className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
            ⚠️ Running on CPU (slow). Use a GPU-enabled browser (Chrome/Edge with WebGL) for 10-50x faster training.
          </div>
        )}
        <div className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400 mt-2">
          🖥️ For best performance, use Chrome or Edge with GPU acceleration enabled. Training uses WebGL when available.
        </div>
      </Card>

      {error && (
        <div className="border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30 text-red-700 dark:text-red-200 px-4 py-3 rounded-md">
          {error}
        </div>
      )}



      {isRunning && (
        <div className="w-full">
          <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
            <LoadingSpinner className="w-5 h-5" />
            <span>
              Running simulations… {progress.current} / {progress.total}
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2.5 dark:bg-slate-700 mt-3">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {guardMessage ? (
        <div className="text-slate-500 dark:text-slate-300">{guardMessage}</div>
      ) : oneDResult && oneDResult.values.length > 0 && (
        <Card className="space-y-6">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">1D Scan Results</h3>
          {selectedObservable && oneDChartData.length > 0 ? (
            <div className="h-[450px]">
              <TimeSeriesChart
                data={oneDChartData}
                series={oneDChartSeries}
                xAxisKey={oneDResult.parameterName}
                xAxisLabel={oneDResult.parameterName}
                yAxisLabel="Observable Value"
                visibleSeries={visibleObservables}
                onSeriesToggle={(name) => {
                  const next = new Set(visibleObservables);
                  if (next.has(name)) next.delete(name);
                  else next.add(name);
                  setVisibleObservables(next);
                }}
                onSeriesIsolate={(name) => {
                  if (visibleObservables.size === 1 && visibleObservables.has(name)) {
                    setVisibleObservables(new Set(observableNames));
                  } else {
                    setVisibleObservables(new Set([name]));
                  }
                }}
                allowZoom={true}
                allowScale={true}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-300">Select an observable to visualize the scan.</p>
          )}

          <div className="text-center text-xs text-slate-500 dark:text-slate-300">
            Drag on the chart to zoom. Double-click to reset view.
          </div>

          <DataTable
            headers={[oneDResult.parameterName, ...observableNames]}
            rows={oneDResult.values.map((entry) => [
              formatNumber(entry.parameterValue),
              ...observableNames.map((name) => formatNumber(entry.observables[name] ?? 0)),
            ])}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="subtle" onClick={handleExportCSV}>Export CSV</Button>
            <Button variant="subtle" onClick={handleExportJSON}>Export JSON</Button>
            <Button
              variant="subtle"
              onClick={() => {
                setVisibleObservables(new Set([selectedObservable]));
              }}
            >
              Reset view
            </Button>
          </div>
        </Card>
      )}

      {twoDResult && heatmapData && (
        <Card className="space-y-6">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">2D Scan Heatmap</h3>
          <div>
            <div className="mb-3 text-sm text-slate-500 dark:text-slate-300">Heatmap of {selectedObservable} across {twoDResult.parameterNames[0]} and {twoDResult.parameterNames[1]}</div>
            <div className="w-full h-[520px]">
              <HeatmapChart
                data={heatmapPoints}
                xAxisLabel={twoDResult.parameterNames[0]}
                yAxisLabel={twoDResult.parameterNames[1]}
                zAxisLabel={selectedObservable}
              />
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-300">
            Range: {formatNumber(heatmapData.min)} – {formatNumber(heatmapData.max)} ({selectedObservable})
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="subtle" onClick={handleExportCSV}>Export CSV</Button>
            <Button variant="subtle" onClick={handleExportJSON}>Export JSON</Button>
          </div>
        </Card>
      )}
    </div>
  );
};
