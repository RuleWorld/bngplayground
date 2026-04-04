import React, { useEffect, useMemo, useState } from 'react';
import { BNGLModel } from '../../types';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Card } from '../ui/Card';
import { DataTable } from '../ui/DataTable';
import { CHART_COLORS } from '../../src/utils/chartColors';
import HeatmapChart from '../HeatmapChart';
import { downloadTextFile } from '../../src/utils/download';

import { formatNumber } from '@bngplayground/engine';
import { TimeSeriesChart, TimeSeriesSeries } from '../charts/TimeSeriesChart';

import { useParameterScanConfig } from '../../hooks/useParameterScanConfig';
import { useParameterScanExecution } from '../../hooks/useParameterScanExecution';
import { useSurrogateModel } from '../../hooks/useSurrogateModel';

interface ParameterScanTabProps {
  model: BNGLModel | null;
}

export const ParameterScanTab: React.FC<ParameterScanTabProps> = ({ model }) => {
  const {
    scanType, setScanType,
    parameter1, setParameter1,
    parameter2, setParameter2,
    param1Start, setParam1Start,
    param1End, setParam1End,
    param1Steps, setParam1Steps,
    param2Start, setParam2Start,
    param2End, setParam2End,
    param2Steps, setParam2Steps,
    method, setMethod,
    solver, setSolver,
    tEnd, setTEnd,
    nSteps, setNSteps,
    parameterTypeMap,
    parameterNames,
    observableNames,
    speciesMap,
    paramToSpecies,
    effectiveParam1Start,
    effectiveParam1End,
    effectiveParam2Start,
    effectiveParam2End,
    defaultParam1Start,
    defaultParam1End,
    defaultParam2Start,
    defaultParam2End,
    canRunScan
  } = useParameterScanConfig(model);

  const [isLogScale, setIsLogScale] = useState(false);

  const {
    oneDResult,
    twoDResult,
    isRunning,
    progress,
    error,
    runScan,
    cancelActiveScan,
    setOneDResult,
    setTwoDResult,
    setError,
    setProgress
  } = useParameterScanExecution({
    model, scanType, parameter1, parameter2,
    effectiveParam1Start, effectiveParam1End,
    effectiveParam2Start, effectiveParam2End,
    param1Steps, param2Steps,
    method, solver, tEnd, nSteps,
    observableNames, paramToSpecies, isLogScale
  });

  const {
    useSurrogate, setUseSurrogate,
    surrogateStatus, setSurrogateStatus,
    surrogateProgress, setSurrogateProgress,
    surrogateMetrics, setSurrogateMetrics,
    activeBackend, setActiveBackend,
    surrogateTrainingSims, setSurrogateTrainingSims,
    surrogateTrainingEpochs, setSurrogateTrainingEpochs,
    surrogateNetworkSize, setSurrogateNetworkSize,
    surrogateRef,
    trainSurrogate
  } = useSurrogateModel({
    model, scanType, parameter1, parameter2,
    observableNames, setError
  });

  const [selectedObservable, setSelectedObservable] = useState('');
  const [visibleObservables, setVisibleObservables] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedObservable || !observableNames.includes(selectedObservable)) {
      setSelectedObservable(observableNames[0] ?? '');
    }
  }, [observableNames, selectedObservable]);

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

  const handleExportCSV = () => {
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
      twoDResult.yValues.forEach((yVal, yi) => {
        twoDResult.xValues.forEach((xVal, xi) => {
          Object.keys(twoDResult.grid).forEach((obs) => {
            const val = twoDResult.grid[obs][yi][xi];
            rows.push([p1Name, xVal, p2Name, yVal, obs, val].join(','));
          });
        });
      });
    }

    downloadTextFile(rows.join('\n'), 'parameter_scan.csv', 'text/csv');
  };

  const handleExportJSON = () => {
    const exportObj = oneDResult ?? twoDResult ?? null;
    if (!exportObj) return;
    downloadTextFile(JSON.stringify(exportObj, null, 2), 'parameter_scan.json', 'application/json');
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
            <div className="text-xs text-slate-500 dark:text-slate-400">
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
              <div className="text-xs text-slate-500 dark:text-slate-400">
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
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
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
            <Button onClick={runScan} disabled={isRunning || !canRunScan(isLogScale)}>
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
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
            onClick={trainSurrogate}
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
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
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
              <div className="text-xs text-slate-500 dark:text-slate-400">MSE</div>
              <div className="text-sm font-medium">{surrogateMetrics.mse.toExponential(2)}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 rounded p-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">MAE</div>
              <div className="text-sm font-medium">{surrogateMetrics.mae.toExponential(2)}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 rounded p-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">Mean R²</div>
              <div className="text-sm font-medium">
                {(surrogateMetrics.r2.reduce((a, b) => a + b, 0) / surrogateMetrics.r2.length).toFixed(3)}
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-slate-500 dark:text-slate-400">
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
        <div className="text-slate-500 dark:text-slate-400">{guardMessage}</div>
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
            <p className="text-sm text-slate-500 dark:text-slate-400">Select an observable to visualize the scan.</p>
          )}

          <div className="text-center text-xs text-slate-500 dark:text-slate-400">
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
            <div className="mb-3 text-sm text-slate-500 dark:text-slate-400">Heatmap of {selectedObservable} across {twoDResult.parameterNames[0]} and {twoDResult.parameterNames[1]}</div>
            <div className="w-full h-[520px]">
              <HeatmapChart
                data={heatmapPoints}
                xAxisLabel={twoDResult.parameterNames[0]}
                yAxisLabel={twoDResult.parameterNames[1]}
                zAxisLabel={selectedObservable}
              />
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
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
