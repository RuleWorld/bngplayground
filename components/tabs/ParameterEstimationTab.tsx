// components/tabs/ParameterEstimationTab.tsx
// Parameter Estimation Tab using Variational Inference

import React, { useState, useMemo, useEffect } from 'react';
import { BNGLModel } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

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
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<EstimationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get parameter names from model
  const parameterNames = useMemo(() => {
    if (!model?.parameters) return [];
    return Object.keys(model.parameters);
  }, [model]);

  // Get observable names from model
  const observableNames = useMemo(() => {
    if (!model?.observables) return [];
    return model.observables.map(o => o.name);
  }, [model]);

  // Update priors when selected params change
  useEffect(() => {
    const newPriors: ParameterPrior[] = selectedParams.map(name => {
      const existing = priors.find(p => p.name === name);
      if (existing) return existing;
      
      const currentValue = model?.parameters[name] ?? 1;
      return {
        name,
        mean: currentValue,
        std: Math.abs(currentValue) * 0.5 || 0.5,
        min: 0,
        max: currentValue * 10 || 10
      };
    });
    setPriors(newPriors);
  }, [selectedParams, model]);

  // Parse experimental data
  useEffect(() => {
    if (!dataInput.trim()) {
      setParsedData([]);
      setDataError(null);
      return;
    }

    try {
      const lines = dataInput.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      
      if (lines.length === 0) {
        setParsedData([]);
        setDataError(null);
        return;
      }

      // Parse header (first line with column names)
      const firstLine = lines[0];
      const headerMatch = firstLine.match(/^[a-zA-Z]/);
      
      let headers: string[];
      let dataLines: string[];
      
      if (headerMatch) {
        headers = firstLine.split(',').map(h => h.trim());
        dataLines = lines.slice(1);
      } else {
        // No header, use generic names
        const numCols = firstLine.split(',').length;
        headers = ['time', ...Array(numCols - 1).fill(0).map((_, i) => `Observable${i + 1}`)];
        dataLines = lines;
      }

      const parsed: ExperimentalDataPoint[] = dataLines.map((line, idx) => {
        const values = line.split(',').map(v => parseFloat(v.trim()));
        if (values.some(isNaN)) {
          throw new Error(`Invalid number on line ${idx + 1}`);
        }
        
        const dataPoint: ExperimentalDataPoint = {
          time: values[0],
          values: {}
        };
        
        for (let i = 1; i < values.length && i < headers.length; i++) {
          dataPoint.values[headers[i]] = values[i];
        }
        
        return dataPoint;
      });

      setParsedData(parsed);
      setDataError(null);
    } catch (e: any) {
      setDataError(e.message);
      setParsedData([]);
    }
  }, [dataInput]);

  const handleParamToggle = (name: string) => {
    setSelectedParams(prev => 
      prev.includes(name) 
        ? prev.filter(p => p !== name)
        : [...prev, name]
    );
  };

  const updatePrior = (name: string, field: keyof ParameterPrior, value: number) => {
    setPriors(prev => prev.map(p => 
      p.name === name ? { ...p, [field]: value } : p
    ));
  };

  const runEstimation = async () => {
    if (selectedParams.length === 0) {
      setError('Please select at least one parameter to estimate');
      return;
    }
    
    if (parsedData.length === 0) {
      setError('Please provide experimental data');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResults(null);

    try {
      // Import TensorFlow.js and the estimator dynamically
      const tf = await import('@tensorflow/tfjs');
      const { VariationalParameterEstimator } = await import('../../src/services/ParameterEstimation');

      // Prepare data for estimator
      const timePoints = parsedData.map(d => d.time);
      const observables = new Map<string, number[]>();
      
      // Collect all observable names from data
      const obsNames = Object.keys(parsedData[0]?.values || {});
      for (const obsName of obsNames) {
        observables.set(obsName, parsedData.map(d => d.values[obsName] || 0));
      }

      // Prepare priors map
      const priorsMap = new Map<string, { mean: number; std: number; min: number; max: number }>();
      for (const prior of priors) {
        priorsMap.set(prior.name, {
          mean: prior.mean,
          std: prior.std,
          min: prior.min,
          max: prior.max
        });
      }

      // Create and run estimator
      const estimator = new VariationalParameterEstimator(
        model!,
        { timePoints, observables },
        selectedParams,
        priorsMap
      );

      const result = await estimator.fit({
        nIterations: parseInt(nIterations) || 500,
        learningRate: parseFloat(learningRate) || 0.01,
        verbose: true
      });

      // Compute credible intervals (95%)
      const credibleIntervals = result.posteriorMean.map((mean, i) => {
        const std = result.posteriorStd[i];
        return {
          lower: mean - 1.96 * std,
          upper: mean + 1.96 * std
        };
      });

      setResults({
        ...result,
        credibleIntervals
      });

    } catch (e: any) {
      console.error('Estimation failed:', e);
      setError(`Estimation failed: ${e.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const exportResults = (format: 'csv' | 'json') => {
    if (!results) return;

    if (format === 'csv') {
      let csv = 'Parameter,Posterior Mean,Posterior Std,95% CI Lower,95% CI Upper\n';
      selectedParams.forEach((name, i) => {
        csv += `${name},${results.posteriorMean[i]},${results.posteriorStd[i]},${results.credibleIntervals[i].lower},${results.credibleIntervals[i].upper}\n`;
      });
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'parameter_estimation_results.csv';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const data = {
        parameters: selectedParams.map((name, i) => ({
          name,
          posteriorMean: results.posteriorMean[i],
          posteriorStd: results.posteriorStd[i],
          credibleInterval: results.credibleIntervals[i]
        })),
        elbo: results.elbo,
        convergence: results.convergence,
        iterations: results.iterations
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'parameter_estimation_results.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Guard: Show message if no model
  const guardMessage = !model
    ? 'Please parse a BNGL model first to use parameter estimation.'
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
                    <span className="text-sm truncate" title={prior.name}>{prior.name}</span>
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
                <label className="text-sm text-slate-600 dark:text-slate-400">Iterations</label>
                <Input
                  type="number"
                  value={nIterations}
                  onChange={e => setNIterations(e.target.value)}
                  min="100"
                  max="10000"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-600 dark:text-slate-400">Learning Rate</label>
                <Input
                  type="number"
                  value={learningRate}
                  onChange={e => setLearningRate(e.target.value)}
                  step="0.001"
                  min="0.0001"
                  max="0.1"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-600 dark:text-slate-400">MC Samples</label>
                <Input
                  type="number"
                  value={nSamples}
                  onChange={e => setNSamples(e.target.value)}
                  min="1"
                  max="20"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={runEstimation}
                disabled={isRunning || selectedParams.length === 0 || parsedData.length === 0}
              >
                {isRunning ? 'Running...' : 'Run Estimation'}
              </Button>
            </div>
          </Card>
          
          {/* Error Display */}
          {error && (
            <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
              <div className="text-red-600 dark:text-red-400">{error}</div>
            </Card>
          )}
          
          {/* Results Card */}
          {results && (
            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  Estimation Results
                </h3>
                <div className="flex gap-2">
                  <Button variant="subtle" onClick={() => exportResults('csv')}>
                    Export CSV
                  </Button>
                  <Button variant="subtle" onClick={() => exportResults('json')}>
                    Export JSON
                  </Button>
                </div>
              </div>
              
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {results.convergence ? '✓ Converged' : '⚠ May not have converged'} after {results.iterations} iterations
              </div>
              
              {/* Results Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-2 px-2">Parameter</th>
                      <th className="text-right py-2 px-2">Posterior Mean</th>
                      <th className="text-right py-2 px-2">Posterior Std</th>
                      <th className="text-right py-2 px-2">95% CI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedParams.map((name, i) => (
                      <tr key={name} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 px-2 font-mono">{name}</td>
                        <td className="text-right py-2 px-2">{results.posteriorMean[i].toExponential(4)}</td>
                        <td className="text-right py-2 px-2">{results.posteriorStd[i].toExponential(4)}</td>
                        <td className="text-right py-2 px-2">
                          [{results.credibleIntervals[i].lower.toExponential(2)}, {results.credibleIntervals[i].upper.toExponential(2)}]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* ELBO Plot */}
              <div className="mt-4">
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">ELBO Convergence</h4>
                <div className="h-32 bg-slate-50 dark:bg-slate-800 rounded flex items-end gap-px p-2">
                  {results.elbo.slice(-100).map((val, i) => {
                    const minElbo = Math.min(...results.elbo.slice(-100));
                    const maxElbo = Math.max(...results.elbo.slice(-100));
                    const range = maxElbo - minElbo || 1;
                    const height = ((val - minElbo) / range) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-primary rounded-t"
                        style={{ height: `${Math.max(1, height)}%` }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Iteration {Math.max(0, results.iterations - 100)}</span>
                  <span>Iteration {results.iterations}</span>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
