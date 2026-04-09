/**
 * Side-by-side comparison panel for "what-if" analysis.
 * Runs two simulations with different parameters and shows results together.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { BNGLModel, SimulationResults } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { bnglService } from '../services/bnglService';
import { CHART_COLORS } from '../src/utils/chartColors';
import { TimeSeriesChart, TimeSeriesSeries } from './charts/TimeSeriesChart';

interface ComparisonPanelProps {
  model: BNGLModel | null;
  baseResults: SimulationResults | null;
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({ model, baseResults }) => {
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResults, setComparisonResults] = useState<SimulationResults | null>(null);
  const [selectedParam, setSelectedParam] = useState<string>('');
  const [comparisonFactor, setComparisonFactor] = useState<number>(2);
  const [error, setError] = useState<string | null>(null);
  const [visibleObservables, setVisibleObservables] = useState<Set<string>>(new Set());

  // Convert parameters Record to array for easier UI handling
  const parameterEntries = model ? Object.entries(model.parameters) : [];

  const observableNames = useMemo(() => {
    return model?.observables?.map((o) => o.name) ?? [];
  }, [model]);

  const runComparison = useCallback(async () => {
    if (!model || !selectedParam) return;

    setIsComparing(true);
    setError(null);

    try {
      // Find the parameter value
      const originalValue = model.parameters[selectedParam];
      if (originalValue === undefined) throw new Error('Parameter not found');

      const newValue = originalValue * comparisonFactor;

      // Create modified model with new parameter value
      const modifiedModel = {
        ...model,
        parameters: {
          ...model.parameters,
          [selectedParam]: newValue,
        },
      };

      // Run simulation with modified model
      const results = await bnglService.simulate(modifiedModel, {
        method: 'ode',
        t_end: 100,
        n_steps: 100,
        solver: 'auto',
      }, { description: `Comparison: ${selectedParam} × ${comparisonFactor}` });

      setComparisonResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
      setComparisonResults(null);
    } finally {
      setIsComparing(false);
    }
  }, [model, selectedParam, comparisonFactor]);

  // Merge base and comparison results for plotting
  const mergedData = useMemo(() => {
    if (!baseResults?.data || !comparisonResults?.data) return null;

    const baseData = baseResults.data;
    const compData = comparisonResults.data;

    return baseData.map((point, i) => {
      const merged: Record<string, number> = { time: point.time };

      // ⚡ Bolt Performance Optimization:
      // Avoid Object.keys().forEach in inner loop over data arrays
      // to prevent large array allocations when processing simulation results.

      // Add base results
      for (const key in point) {
        if (key !== 'time' && Object.prototype.hasOwnProperty.call(point, key)) {
          merged[`${key} (base)`] = point[key];
        }
      }

      // Add comparison results
      if (compData[i]) {
        for (const key in compData[i]) {
          if (key !== 'time' && Object.prototype.hasOwnProperty.call(compData[i], key)) {
            merged[`${key} (${comparisonFactor}×)`] = compData[i][key];
          }
        }
      }

      return merged;
    });
  }, [baseResults, comparisonResults, comparisonFactor]);

  const observablesToPlot = useMemo(() => {
    if (!mergedData || mergedData.length === 0) return [] as string[];
    const keys = new Set(Object.keys(mergedData[0] ?? {}));
    return observableNames.filter((name) => keys.has(`${name} (base)`) || keys.has(`${name} (${comparisonFactor}×)`));
  }, [mergedData, observableNames, comparisonFactor]);

  const chartSeries = useMemo<TimeSeriesSeries[]>(() => {
    return observablesToPlot.flatMap((name, index) => {
      const color = CHART_COLORS[index % CHART_COLORS.length];
      return [
        {
          name: `${name} (base)`,
          color,
          strokeWidth: 2
        },
        {
          name: `${name} (${comparisonFactor}×)`,
          color,
          strokeWidth: 2,
          strokeDasharray: '5 3'
        }
      ];
    });
  }, [observablesToPlot, comparisonFactor]);

  const handleToggleObservable = (name: string) => {
    setVisibleObservables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleIsolateObservable = (name: string) => {
    setVisibleObservables((prev) => {
      if (prev.size === 1 && prev.has(name)) return new Set(chartSeries.map(s => s.name));
      return new Set([name]);
    });
  };

  useEffect(() => {
    if (chartSeries.length > 0) {
      setVisibleObservables(new Set(chartSeries.map(s => s.name)));
    } else {
      setVisibleObservables(new Set());
    }
  }, [chartSeries]);

  if (!model) {
    return (
      <Card className="p-4">
        <p className="text-slate-500 dark:text-slate-400">
          Parse a model to use comparison features.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
        What-If Comparison
      </h3>

      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Compare simulation results with modified parameter values.
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Parameter to modify
          </label>
          <select
            value={selectedParam}
            onChange={(e) => setSelectedParam(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-2 py-1.5 text-sm bg-white dark:bg-slate-900 dark:bg-slate-800"
          >
            <option value="">Select parameter...</option>
            {parameterEntries.map(([name, value]) => (
              <option key={name} value={name}>
                {name} = {value}
              </option>
            ))}
          </select>
        </div>

        <div className="w-32">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Multiply by
          </label>
          <select
            value={comparisonFactor}
            onChange={(e) => setComparisonFactor(Number(e.target.value))}
            className="w-full rounded border border-slate-300 dark:border-slate-600 dark:border-slate-600 px-2 py-1.5 text-sm bg-white dark:bg-slate-900 dark:bg-slate-800"
          >
            <option value={0.1}>0.1×</option>
            <option value={0.5}>0.5×</option>
            <option value={2}>2×</option>
            <option value={5}>5×</option>
            <option value={10}>10×</option>
          </select>
        </div>

        <div className="flex items-end">
          <Button
            onClick={runComparison}
            disabled={!selectedParam || isComparing || !baseResults}
            variant="primary"
          >
            {isComparing && <LoadingSpinner className="w-4 h-4 mr-2" />}
            {isComparing ? 'Comparing...' : 'Compare'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded">
          {error}
        </div>
      )}

      {!baseResults && (
        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 rounded text-center text-slate-500 dark:text-slate-400">
          Run a simulation first to enable comparison.
        </div>
      )}

      {mergedData && (
        <div className="mt-4">
          <div className="flex items-center gap-4 mb-4 text-xs">
            <span className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700">
              <span className="w-6 h-0.5 bg-slate-400"></span>
              <span className="text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">Base Model</span>
            </span>
            <span className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700">
              <span className="w-6 h-0.5 bg-slate-400 border-dashed" style={{ borderBottom: '2px dashed' }}></span>
              <span className="text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">Modified ({comparisonFactor}×)</span>
            </span>
          </div>

          <div className="h-[450px] w-full">
            <TimeSeriesChart
              data={mergedData}
              series={chartSeries}
              visibleSeries={visibleObservables}
              onSeriesToggle={handleToggleObservable}
              onSeriesIsolate={handleIsolateObservable}
              yAxisLabel="Concentration"
              animationDuration={1500}
            />
          </div>
        </div>
      )}
    </Card>
  );
};
