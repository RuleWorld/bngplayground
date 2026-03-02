import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ComposedChart, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ErrorBar, Scatter } from 'recharts';
import { BNGLModel } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Card } from '../ui/Card';
import { DataTable } from '../ui/DataTable';
import { CHART_COLORS } from '../../constants';
import { parseExperimentalData, ExperimentalDataPoint } from '../../src/services/data/experimentalData';
import { fitParameters, FitAlgorithm } from '../../services/optimization/paramFitter';
import { bnglService } from '../../services/bnglService';

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
}

const EXAMPLE_DATA = `# Example experimental data format:
# time, Observable1, Observable2
0, 100, 0
10, 75, 25
20, 55, 45
30, 42, 58
50, 28, 72
100, 15, 85`;

// Default data for testing - uses typical BNGL observable names
const DEFAULT_TEST_DATA = `# Default test data (A → B reaction)
# time, A, B
0, 100, 0
5, 82, 18
10, 67, 33
15, 55, 45
20, 45, 55
30, 30, 70
50, 13, 87
75, 5, 95
100, 2, 98`;

export const ParameterEstimationTab: React.FC<ParameterEstimationTabProps> = ({ model }) => {
  // Parameter selection
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [priors, setPriors] = useState<ParameterPrior[]>([]);

  // Experimental data - initialize with default test data
  const [dataInput, setDataInput] = useState<string>(DEFAULT_TEST_DATA);
  const [parsedData, setParsedData] = useState<ExperimentalDataPoint[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  // Estimation settings
  const [nIterations, setNIterations] = useState('500');
  const [algorithm, setAlgorithm] = useState<FitAlgorithm>('nelder-mead');

  // Results
  const [result, setResult] = useState<EstimationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, elbo: 0 });
  const [error, setError] = useState<string | null>(null);

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

  const canRun = selectedParams.length > 0 && parsedData.length > 0 && !isRunning;

  const formatNumber = (value: unknown): string => {
    const n = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs !== 0 && (abs < 1e-3 || abs >= 1e4)) return n.toExponential(4);
    return n.toPrecision(6);
  };

  const handleRunEstimation = async () => {
    if (!canRun || !model) return;

    setError(null);
    setResult(null);
    setIsRunning(true);
    setProgress({ current: 0, total: parseInt(nIterations), elbo: 0 });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const paramsSnapshot = [...selectedParams];
    const priorMeansSnapshot = paramsSnapshot.map(
      (name) => priors.find((p) => p.name === name)?.mean ?? 0
    );

    try {
      const maxEval = parseInt(nIterations);
      setProgress({ current: 0, total: maxEval, elbo: 0 });

      // Prepare cached model in worker to avoid re-parsing on every eval.
      const modelId = await bnglService.prepareModel(model);

      const paramBounds = priors.map(p => ({
        name:    p.name,
        initial: p.mean,
        min:     p.min,
        max:     p.max,
      }));

      const fitResult = await fitParameters({
        model,
        modelId,
        paramBounds,
        experimentalData: parsedData,
        algorithm,
        maxEval,
        signal: controller.signal,
        onProgress: (p) => {
          if (isMountedRef.current) {
            setProgress({ current: p.nEval, total: maxEval, elbo: p.sse });
          }
        },
      });

      if (isMountedRef.current) {
        const credibleIntervals = fitResult.confidenceIntervals;
        const posteriorStd = credibleIntervals.map(ci =>
          (ci.upper - ci.lower) / 2
        );
        // Derive percentile-like ranges from CI for the boxplot.
        const percentiles = credibleIntervals.map(ci => ({
          q1:     fitResult.params[0] + (ci.lower - fitResult.params[0]) * 0.5,
          median: fitResult.params[0],
          q3:     fitResult.params[0] + (ci.upper - fitResult.params[0]) * 0.5,
        }));
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
        });
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
      // For log-scale bar chart, bars must be positive
      const safeMean = Math.max(mean, 1e-15);
      return {
        name,
        mean: safeMean,
        prior: Math.max(result.priorMeans[i] ?? safeMean, 1e-15),
        // Recharts ErrorBar asymmetric format: { plus, minus }
        ciError: {
          plus:  Math.max(0, upper - mean),
          minus: Math.max(0, mean - Math.max(lower, 1e-15)),
        },
      };
    });
  }, [result]);

  const elboChartData = useMemo(() => {
    if (!result?.elbo) return [];
    return result.elbo.map((value, i) => ({ iteration: i, elbo: value }));
  }, [result]);

  const fitComparisonData = useMemo(() => {
    if (!result?.bestPredictions || !parsedData) return [];

    return parsedData.map((d, i) => {
      const entry: any = { time: d.time };
      // Add experimental values
      for (const [obsName, expVal] of Object.entries(d.values)) {
        entry[`${obsName}_exp`] = expVal;
      }
      // Add predicted values
      for (const [obsName, predData] of result.bestPredictions!) {
        entry[`${obsName}_pred`] = predData[i] ?? 0;
      }
      return entry;
    });
  }, [result, parsedData]);

  const guardMessage = !model
    ? 'Parse a model to set up parameter estimation.'
    : parameterNames.length === 0
      ? 'The current model does not declare any parameters to estimate.'
      : null;

  return (
    <div className="space-y-6">
      {guardMessage ? (
        <div className="text-slate-500 dark:text-slate-400">{guardMessage}</div>
      ) : (
        <>
          {/* Parameter Selection Card */}
          <Card className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Select Parameters to Estimate
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
              {parameterNames.map(name => (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedParams.includes(name)}
                    onChange={() => handleParamToggle(name)}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="truncate" title={name}>{name}</span>
                  <span className="text-xs text-slate-500">
                    ({model?.parameters[name]?.toFixed(4) ?? 'N/A'})
                  </span>
                </label>
              ))}
            </div>

            <div className="text-sm text-slate-500">
              Selected: {selectedParams.length} parameter{selectedParams.length !== 1 ? 's' : ''}
            </div>
          </Card>

          {/* Prior Specification Card */}
          {selectedParams.length > 0 && (
            <Card className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Prior Distributions
              </h3>

              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 px-1">
                  <span>Parameter</span>
                  <span>Prior Mean</span>
                  <span>Prior Std</span>
                  <span>Min Bound</span>
                  <span>Max Bound</span>
                </div>

                {priors.map(prior => (
                  <div key={prior.name} className="grid grid-cols-5 gap-2 items-center">
                    <span className="text-sm font-medium truncate" title={prior.name}>{prior.name}</span>
                    <Input
                      type="number"
                      step="any"
                      value={prior.mean}
                      onChange={e => updatePrior(prior.name, 'mean', parseFloat(e.target.value) || 0)}
                      className="text-sm"
                    />
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      value={prior.std}
                      onChange={e => updatePrior(prior.name, 'std', parseFloat(e.target.value) || 0.1)}
                      className="text-sm"
                    />
                    <Input
                      type="number"
                      step="any"
                      value={prior.min}
                      onChange={e => updatePrior(prior.name, 'min', parseFloat(e.target.value) || 0)}
                      className="text-sm"
                    />
                    <Input
                      type="number"
                      step="any"
                      value={prior.max}
                      onChange={e => updatePrior(prior.name, 'max', parseFloat(e.target.value) || 10)}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Experimental Data Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Experimental Data
              </h3>
              <div className="flex gap-2">
                <Button
                  variant="subtle"
                  onClick={() => setDataInput(DEFAULT_TEST_DATA)}
                >
                  Load A→B Data
                </Button>
                <Button
                  variant="subtle"
                  onClick={() => setDataInput(EXAMPLE_DATA)}
                >
                  Load Generic Example
                </Button>
                <Button
                  variant="subtle"
                  onClick={() => setDataInput('')}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="text-sm text-slate-600 dark:text-slate-400">
              Enter time-course data in CSV format. First column should be time, subsequent columns are observables.
              <br />
              Model observables: {observableNames.join(', ') || 'None defined'}
            </div>

            <textarea
              value={dataInput}
              onChange={e => setDataInput(e.target.value)}
              placeholder={EXAMPLE_DATA}
              className="w-full h-40 p-3 font-mono text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
              spellCheck={false}
            />

            {dataError && (
              <div className="text-sm text-red-600 dark:text-red-400">{dataError}</div>
            )}

            {parsedData.length > 0 && (
              <div className="text-sm text-green-600 dark:text-green-400">
                ✓ Parsed {parsedData.length} data points with {Object.keys(parsedData[0]?.values || {}).length} observables
              </div>
            )}
          </Card>

          {/* Estimation Settings Card */}
          <Card className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Estimation Settings
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Max Evaluations
                </label>
                <Input
                  type="number"
                  min={50}
                  max={5000}
                  value={nIterations}
                  onChange={e => setNIterations(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Algorithm
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(['nelder-mead', 'sbplx', 'projected-nm', 'bobyqa'] as FitAlgorithm[]).map(alg => (
                    <Button
                      key={alg}
                      variant={algorithm === alg ? 'primary' : 'subtle'}
                      className="text-xs h-7 px-3"
                      onClick={() => setAlgorithm(alg)}
                    >
                      {alg === 'bobyqa' ? 'bobyqa (uses sbplx)' : alg === 'projected-nm' ? 'projected-nm' : alg}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              {isRunning && (
                <Button variant="danger" onClick={handleCancel}>
                  Cancel
                </Button>
              )}
              <Button onClick={handleRunEstimation} disabled={!canRun}>
                {isRunning ? 'Estimating...' : 'Run Estimation'}
              </Button>
            </div>
          </Card>

          {/* Progress */}
          {isRunning && (
            <div className="w-full">
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                <LoadingSpinner className="w-5 h-5" />
                <span>Optimizing parameters ({algorithm})... eval {progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 dark:bg-slate-700 mt-3">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30 text-red-700 dark:text-red-200 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Summary Card */}
              <Card className="p-4 border-l-4 border-l-blue-500">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Estimation Results</h3>
                    <p className="text-sm text-slate-500">Completed {result.iterations} iterations</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md border border-blue-100 dark:border-blue-800 text-center min-w-[100px]">
                      <div className="text-[10px] uppercase font-bold text-blue-500 dark:text-blue-400">RMSE</div>
                      <div className="text-xl font-mono font-bold text-blue-700 dark:text-blue-300">{result.rmse.toExponential(3)}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-center min-w-[100px]">
                      <div className="text-[10px] uppercase font-bold text-slate-500">SSE</div>
                      <div className="text-xl font-mono font-bold text-slate-700 dark:text-slate-300">{result.sse.toExponential(3)}</div>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-md border border-emerald-100 dark:border-emerald-800 text-center min-w-[100px]">
                      <div className="text-[10px] uppercase font-bold text-emerald-500 dark:text-emerald-400">R² Score</div>
                      <div className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-300">{result.rSquared.toFixed(4)}</div>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md p-3 space-y-1">
                  <div className="font-medium text-slate-700 dark:text-slate-200">What this means</div>
                  <div>
                    <span className="font-medium">Best estimate / CI half-width</span>: optimized parameter value and approximate 95% confidence interval half-width from finite-difference Hessian.
                  </div>
                  <div>
                    <span className="font-medium">95% credible interval</span>: range that contains ~95% of the posterior probability (Bayesian uncertainty interval).
                  </div>
                  <div>
                    <span className="font-medium">SSE history</span>: sum-of-squared-errors at each function evaluation. Should decrease and then plateau when the optimizer converges. "May not have converged" means the maximum evaluations was reached before the tolerance was met.
                  </div>
                </div>

                <DataTable
                  headers={['Parameter', 'Best Estimate', 'CI Half-Width (±)', '95% CI Lower', '95% CI Upper', 'Initial Value']}
                  rows={result.parameters.map((name, i) => [
                    name,
                    formatNumber(result.posteriorMean[i]),
                    formatNumber(result.posteriorStd[i]),
                    formatNumber(result.credibleIntervals[i]?.lower),
                    formatNumber(result.credibleIntervals[i]?.upper),
                    formatNumber(result.priorMeans[i])
                  ])}
                />
              </Card>

              {/* Posterior Visualization */}
              <Card className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  Posterior Estimates (Best Estimate ± 95% CI)
                </h3>
                <div className="text-xs text-slate-500">
                  Blue bars: optimized value. Error bars: 95% confidence interval from finite-difference Hessian.
                  Gray triangles: initial (prior) value.
                </div>

                <ResponsiveContainer width="100%" height={Math.max(250, posteriorChartData.length * 60 + 80)}>
                  <BarChart
                    data={posteriorChartData}
                    layout="vertical"
                    margin={{ top: 10, right: 60, left: 80, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" horizontal={false} />
                    <XAxis
                      type="number"
                      scale="log"
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => v.toExponential(1)}
                      tick={{ fontSize: 10, fill: '#334155' }}
                      tickLine={{ stroke: '#334155' }}
                      axisLine={{ stroke: '#334155' }}
                      label={{ value: 'Estimated Value (log scale)', position: 'insideBottom', offset: -5, fill: '#334155', fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={75}
                      tick={{ fontSize: 11, fill: '#1e293b' }}
                      tickLine={{ stroke: '#1e293b' }}
                      axisLine={{ stroke: '#1e293b' }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatNumber(value),
                        name === 'mean' ? 'Best Estimate' : name === 'prior' ? 'Initial Value' : name,
                      ]}
                    />
                    <Legend />
                    {/* Prior value as a secondary bar */}
                    <Bar dataKey="prior" fill="#cbd5e1" barSize={8} name="Initial Value" />
                    {/* Best estimate with asymmetric CI error bars */}
                    <Bar dataKey="mean" fill="#3b82f6" barSize={18} name="Best Estimate">
                      <ErrorBar
                        dataKey="ciError"
                        width={6}
                        strokeWidth={2}
                        stroke="#1e3a5f"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Fit Comparison Plot */}
              {result.bestPredictions?.size === 0 && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  <span>
                    <strong>No matching observables.</strong> The data column headers ({Object.keys(parsedData[0]?.values ?? {}).join(', ')}) don’t match any model observable names ({observableNames.join(', ') || 'none defined'}).
                    Rename your data headers to match observable names exactly, or add observables to your model.
                  </span>
                </div>
              )}
              {fitComparisonData.length > 0 && result.bestPredictions && result.bestPredictions.size > 0 && (
                <Card className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        Fit Comparison (Experimental vs. Predicted)
                      </h3>
                      <div className="text-xs text-blue-600 font-medium">RMSE: {typeof result.rmse === 'number' ? result.rmse.toExponential(3) : 'N/A'}</div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Circles: Experimental | Lines: Best Estimate
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={350}>
                    <ComposedChart data={fitComparisonData} margin={{ top: 10, right: 10, left: 60, bottom: 35 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.1)" vertical={false} />
                      <XAxis
                        dataKey="time"
                        type="number"
                        tick={{ fontSize: 11, fill: '#334155' }}
                        label={{ value: 'Time', position: 'bottom', offset: 0, fill: '#334155', fontSize: 13, fontWeight: 'bold' }}
                      />
                      <YAxis
                        width={65}
                        tick={{ fontSize: 11, fill: '#334155' }}
                        label={{ 
                          value: 'Concentration/Amount', 
                          angle: -90, 
                          position: 'insideLeft', 
                          offset: -45, 
                          fill: '#334155', 
                          fontSize: 13, 
                          fontWeight: 'bold',
                          style: { textAnchor: 'middle' }
                        }}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === 'time') return [null, null];
                          return [value.toFixed(2), name];
                        }}
                        labelFormatter={(label) => `Time: ${label}`}
                      />
                      <Legend verticalAlign="top" height={40} />

                      {/* Plot each observable: Scatter for experimental, Line for predicted */}
                      {Array.from(result.bestPredictions?.keys() || []).map((obsName, idx) => (
                        <React.Fragment key={obsName}>
                          <Scatter
                            name={`${obsName} (Exp)`}
                            dataKey={`${obsName}_exp`}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                            stroke="#ffffff"
                            strokeWidth={1}
                            shape="circle"
                            isAnimationActive={false}
                          />
                          <Line
                            name={`${obsName} (Pred)`}
                            type="monotone"
                            dataKey={`${obsName}_pred`}
                            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </React.Fragment>
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* ELBO Convergence Plot */}
              {elboChartData.length > 0 && (
                <Card className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    SSE Convergence (Optimization Progress)
                  </h3>

                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={elboChartData} margin={{ top: 10, right: 30, left: 55, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.15)" vertical={false} />
                      <XAxis
                        dataKey="iteration"
                        tick={{ fontSize: 11, fill: 'black' }}
                        tickLine={{ stroke: 'black' }}
                        axisLine={{ stroke: 'black' }}
                        label={{ value: 'Iteration', position: 'bottom', offset: 12, fill: '#334155', fontSize: 13, fontWeight: 'bold' }}
                      />
                      <YAxis
                        width={40}
                        tick={{ fontSize: 11, fill: 'black' }}
                        tickLine={{ stroke: 'black' }}
                        axisLine={{ stroke: 'black' }}
                        label={{ 
                          value: 'SSE', 
                          angle: -90, 
                          position: 'insideLeft', 
                          offset: -20, 
                          fill: '#334155', 
                          fontSize: 13, 
                          fontWeight: 'bold',
                          style: { textAnchor: 'middle' } 
                        }}
                      />
                      <Tooltip formatter={(value: number, name: string) => [value.toFixed(4), name]} />
                      <Line type="monotone" dataKey="elbo" stroke={CHART_COLORS[2]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Export Buttons */}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="subtle"
                  onClick={() => {
                    const csv = [
                      ['Parameter', 'Posterior Mean', 'Posterior Std', '95% CI Lower', '95% CI Upper'].join(','),
                      ...result.parameters.map((name, i) =>
                        [name, result.posteriorMean[i], result.posteriorStd[i], result.credibleIntervals[i].lower, result.credibleIntervals[i].upper].join(',')
                      )
                    ].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'parameter_estimation_results.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export CSV
                </Button>
                <Button
                  variant="subtle"
                  onClick={() => {
                    const exportData = {
                      parameters: result.parameters,
                      posteriorMean: result.posteriorMean,
                      posteriorStd: result.posteriorStd,
                      credibleIntervals: result.credibleIntervals,
                      elbo: result.elbo,
                      convergence: result.convergence,
                      iterations: result.iterations,
                      priors: result.parameters.map((name, i) => ({
                        name,
                        mean: result.priorMeans[i]
                      }))
                    };
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'parameter_estimation_results.json';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export JSON
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
