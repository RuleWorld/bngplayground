import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ErrorBar, Cell } from 'recharts';
import { BNGLModel } from '../../types';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Card } from '../ui/Card';
import { DataTable } from '../ui/DataTable';
import { CHART_COLORS } from '../../constants';

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

interface ExperimentalDataPoint {
  time: number;
  values: Record<string, number>;
}

interface EstimationResult {
  posteriorMean: number[];
  posteriorStd: number[];
  elbo: number[];
  convergence: boolean;
  iterations: number;
  credibleIntervals: { lower: number; upper: number }[];
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
  const [learningRate, setLearningRate] = useState('0.01');
  const [nSamples, setNSamples] = useState('5');
  
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
    if (!input.trim()) {
      setParsedData([]);
      setDataError(null);
      return;
    }
    
    try {
      const lines = input.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
      if (lines.length === 0) {
        setParsedData([]);
        setDataError(null);
        return;
      }
      
      const data: ExperimentalDataPoint[] = [];
      const headers: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.trim());
        
        if (i === 0 && isNaN(parseFloat(parts[0]))) {
          // Header row
          headers.push(...parts.slice(1));
          continue;
        }
        
        const time = parseFloat(parts[0]);
        if (isNaN(time)) {
          throw new Error(`Invalid time value on line ${i + 1}`);
        }
        
        const values: Record<string, number> = {};
        for (let j = 1; j < parts.length; j++) {
          const value = parseFloat(parts[j]);
          if (isNaN(value)) {
            throw new Error(`Invalid value on line ${i + 1}, column ${j + 1}`);
          }
          const key = headers[j - 1] || `Observable${j}`;
          values[key] = value;
        }
        
        data.push({ time, values });
      }
      
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
  
  const handleRunEstimation = async () => {
    if (!canRun || !model) return;
    
    setError(null);
    setResult(null);
    setIsRunning(true);
    setProgress({ current: 0, total: parseInt(nIterations), elbo: 0 });
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    try {
      // Dynamically import TensorFlow.js and estimation module
      const [tf, { VariationalParameterEstimator }] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('../../src/services/ParameterEstimation')
      ]);
      
      // Prepare data
      const timePoints = parsedData.map(d => d.time);
      const observables = new Map<string, number[]>();
      
      // Get observable names from data
      const obsNames = Object.keys(parsedData[0]?.values || {});
      for (const obsName of obsNames) {
        observables.set(obsName, parsedData.map(d => d.values[obsName] || 0));
      }
      
      const simulationData = { timePoints, observables };
      
      // Prepare priors
      const priorsMap = new Map<string, { mean: number; std: number; min?: number; max?: number }>();
      for (const prior of priors) {
        priorsMap.set(prior.name, {
          mean: prior.mean,
          std: prior.std,
          min: prior.min,
          max: prior.max
        });
      }
      
      // Create estimator
      const estimator = new VariationalParameterEstimator(
        model,
        simulationData,
        selectedParams,
        priorsMap
      );
      
      // Run estimation with progress updates
      const iterations = parseInt(nIterations);
      const lr = parseFloat(learningRate);
      
      const result = await estimator.fit({
        nIterations: iterations,
        learningRate: lr,
        verbose: false
      });
      
      // Compute credible intervals from posterior
      const posteriorSamples = await estimator.samplePosterior(1000);
      const credibleIntervals = selectedParams.map((_, i) => {
        const values = posteriorSamples.map(s => s[i]).sort((a, b) => a - b);
        return {
          lower: values[Math.floor(0.025 * values.length)],
          upper: values[Math.floor(0.975 * values.length)]
        };
      });
      
      if (isMountedRef.current) {
        setResult({
          ...result,
          credibleIntervals
        });
      }
      
      // Cleanup
      estimator.dispose();
      
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
    
    return selectedParams.map((name, i) => ({
      name,
      mean: result.posteriorMean[i],
      std: result.posteriorStd[i],
      lower: result.credibleIntervals[i]?.lower ?? result.posteriorMean[i] - 2 * result.posteriorStd[i],
      upper: result.credibleIntervals[i]?.upper ?? result.posteriorMean[i] + 2 * result.posteriorStd[i],
      prior: priors.find(p => p.name === name)?.mean ?? 0
    }));
  }, [result, selectedParams, priors]);
  
  const elboChartData = useMemo(() => {
    if (!result?.elbo) return [];
    return result.elbo.map((value, i) => ({ iteration: i, elbo: value }));
  }, [result]);
  
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
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Iterations
                </label>
                <Input
                  type="number"
                  min={100}
                  max={10000}
                  value={nIterations}
                  onChange={e => setNIterations(e.target.value)}
                />
              </div>
              
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Learning Rate
                </label>
                <Input
                  type="number"
                  step="0.001"
                  min={0.0001}
                  max={1}
                  value={learningRate}
                  onChange={e => setLearningRate(e.target.value)}
                />
              </div>
              
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  MC Samples
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={nSamples}
                  onChange={e => setNSamples(e.target.value)}
                />
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
                <span>Running variational inference... {progress.current} / {progress.total}</span>
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
              <Card className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    Estimation Results
                  </h3>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    result.convergence 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                  }`}>
                    {result.convergence ? '✓ Converged' : '⚠ May not have converged'}
                  </span>
                </div>
                
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Completed {result.iterations} iterations
                </div>
                
                <DataTable
                  headers={['Parameter', 'Posterior Mean', 'Posterior Std', '95% CI Lower', '95% CI Upper', 'Prior Mean']}
                  rows={selectedParams.map((name, i) => [
                    name,
                    result.posteriorMean[i].toExponential(4),
                    result.posteriorStd[i].toExponential(4),
                    result.credibleIntervals[i].lower.toExponential(4),
                    result.credibleIntervals[i].upper.toExponential(4),
                    (priors.find(p => p.name === name)?.mean ?? 0).toExponential(4)
                  ])}
                />
              </Card>
              
              {/* Posterior Visualization */}
              <Card className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  Posterior Estimates with 95% Credible Intervals
                </h3>
                
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={posteriorChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.3)" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={80}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis 
                      scale="log" 
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => v.toExponential(1)}
                    />
                    <Tooltip 
                      formatter={(value: number) => value.toExponential(4)}
                      labelFormatter={(label) => `Parameter: ${label}`}
                    />
                    <Bar dataKey="mean" fill={CHART_COLORS[0]} name="Posterior Mean">
                      <ErrorBar 
                        dataKey="std" 
                        width={4} 
                        strokeWidth={2}
                        stroke={CHART_COLORS[1]}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              
              {/* ELBO Convergence Plot */}
              {elboChartData.length > 0 && (
                <Card className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    ELBO Convergence
                  </h3>
                  
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={elboChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.3)" />
                      <XAxis dataKey="iteration" label={{ value: 'Iteration', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'ELBO', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="elbo" stroke={CHART_COLORS[2]} strokeWidth={1.5} dot={false} />
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
                      ...selectedParams.map((name, i) => 
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
                      parameters: selectedParams,
                      posteriorMean: result.posteriorMean,
                      posteriorStd: result.posteriorStd,
                      credibleIntervals: result.credibleIntervals,
                      elbo: result.elbo,
                      convergence: result.convergence,
                      iterations: result.iterations,
                      priors: priors
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
