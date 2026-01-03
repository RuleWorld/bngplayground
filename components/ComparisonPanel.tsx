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
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '../constants';
import {
  ExternalLegend,
  formatTooltipNumber,
  formatYAxisTick,
} from './charts/InteractiveLegend';

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
      
      // Add base results with "_base" suffix
      Object.keys(point).forEach(key => {
        if (key !== 'time') {
          merged[`${key}_base`] = point[key];
        }
      });
      
      // Add comparison results with "_comp" suffix
      if (compData[i]) {
        Object.keys(compData[i]).forEach(key => {
          if (key !== 'time') {
            merged[`${key}_comp`] = compData[i][key];
          }
        });
      }
      
      return merged;
    });
  }, [baseResults, comparisonResults]);

  const observablesToPlot = useMemo(() => {
    if (!mergedData || mergedData.length === 0) return [] as string[];
    const keys = new Set(Object.keys(mergedData[0] ?? {}));
    return observableNames.filter((name) => keys.has(`${name}_base`) || keys.has(`${name}_comp`));
  }, [mergedData, observableNames]);

  const observablesToPlotKey = useMemo(() => observablesToPlot.join('|'), [observablesToPlot]);

  useEffect(() => {
    // Initialize visibility when chart becomes available / model changes
    if (observablesToPlot.length > 0) {
      setVisibleObservables(new Set(observablesToPlot));
    } else {
      setVisibleObservables(new Set());
    }
  }, [observablesToPlotKey]);

  const legendEntries = useMemo(() => {
    return observablesToPlot.map((name, index) => ({
      name,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [observablesToPlot]);

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
      // If already isolated, restore all
      if (prev.size === 1 && prev.has(name)) return new Set(observablesToPlot);
      return new Set([name]);
    });
  };

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
            className="w-full rounded border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-sm bg-white dark:bg-slate-800"
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
            className="w-full rounded border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-sm bg-white dark:bg-slate-800"
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
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded text-center text-slate-500">
          Run a simulation first to enable comparison.
        </div>
      )}
      
      {mergedData && (
        <div className="mt-4">
          <div className="flex items-center gap-4 mb-2 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-8 h-0.5 bg-blue-500"></span>
              Base (solid)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-8 h-0.5 bg-blue-500 border-dashed" style={{ borderBottom: '2px dashed' }}></span>
              Modified (dashed)
            </span>
          </div>
          
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={mergedData}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.3)" />
              <XAxis
                dataKey="time"
                label={{ value: 'Time', position: 'insideBottom', offset: -5 }}
                type="number"
                domain={['dataMin', 'dataMax']}
              />
              <YAxis
                label={{ value: 'Concentration', angle: -90, position: 'insideLeft' }}
                domain={[0, 'dataMax']}
                allowDataOverflow={true}
                tickFormatter={formatYAxisTick}
              />
              <Tooltip
                formatter={(value: any, name: any) => {
                  const label = String(name)
                    .replace(/_base$/, ' (base)')
                    .replace(/_comp$/, ` (${comparisonFactor}×)`);
                  return [formatTooltipNumber(value, 2), label];
                }}
                labelFormatter={(label) => `Time: ${typeof label === 'number' ? label.toFixed(2) : label}`}
              />

              {observablesToPlot.map((name, i) => {
                const color = CHART_COLORS[i % CHART_COLORS.length];
                const isVisible = visibleObservables.has(name);
                return (
                  <React.Fragment key={name}>
                    <Line
                      type="monotone"
                      dataKey={`${name}_base`}
                      stroke={color}
                      strokeWidth={1.75}
                      dot={false}
                      hide={!isVisible}
                      name={`${name}_base`}
                    />
                    <Line
                      type="monotone"
                      dataKey={`${name}_comp`}
                      stroke={color}
                      strokeWidth={1.75}
                      strokeDasharray="5 3"
                      dot={false}
                      hide={!isVisible}
                      name={`${name}_comp`}
                    />
                  </React.Fragment>
                );
              })}
            </LineChart>
          </ResponsiveContainer>

          {legendEntries.length > 0 && (
            <ExternalLegend
              entries={legendEntries}
              visible={visibleObservables}
              onToggle={handleToggleObservable}
              onIsolate={handleIsolateObservable}
            />
          )}

          <div className="text-center text-xs text-slate-500 mt-2">
            Click legend to toggle series. Double-click legend to isolate/restore.
          </div>
        </div>
      )}
    </Card>
  );
};
