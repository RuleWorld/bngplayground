import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import { BNGLModel, SimulationResults } from '../types';
import { CHART_COLORS } from '../constants';
import { Card } from './ui/Card';
import { CustomExpression, evaluateExpression } from './ExpressionInputPanel';
import { computeDynamicObservable } from '../src/utils/dynamicObservable';

interface ResultsChartProps {
  results: SimulationResults | null;
  model: BNGLModel | null;
  visibleSpecies: Set<string>;
  onVisibleSpeciesChange: (species: Set<string>) => void;
  highlightedSeries?: string[];
  expressions?: CustomExpression[];
}

type ZoomDomain = {
  x1: number | 'dataMin';
  x2: number | 'dataMax';
  y1: number | 'dataMin';
  y2: number | 'dataMax';
}

// Threshold for when to move legend below the chart
const LEGEND_THRESHOLD = 8;

// External legend component for when there are many series
const ExternalLegend: React.FC<{
  series: string[];
  visibleSpecies: Set<string>;
  onToggle: (name: string) => void;
  onHighlight: (name: string) => void;
  highlightedSeries: Set<string>;
}> = ({ series, visibleSpecies, onToggle, onHighlight, highlightedSeries }) => {
  return (
    <div className="mt-4 max-h-48 overflow-y-auto border-t border-slate-200 dark:border-slate-700 pt-4">
      <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 px-4">
        {series.map((name, index) => {
          const isVisible = visibleSpecies.has(name);
          const isHighlighted = highlightedSeries.size === 0 || highlightedSeries.has(name);
          return (
            <div
              key={name}
              onClick={() => onToggle(name)}
              onDoubleClick={(e) => {
                e.preventDefault();
                onHighlight(name);
              }}
              title="Double-click to isolate"
              className={`flex items-center cursor-pointer transition-opacity ${!isVisible ? 'opacity-40' : isHighlighted ? 'opacity-100' : 'opacity-60'} hover:bg-slate-50 dark:hover:bg-slate-800 rounded px-1 -ml-1`}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                  marginRight: 6,
                  borderRadius: '2px'
                }}
              />
              <span className="text-xs text-slate-700 dark:text-slate-300">{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const CustomLegend = (props: any) => {
  const { payload, onClick, onHighlight } = props;

  return (
    <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 mt-4 px-4">
      {payload.map((entry: any, index: number) => (
        <div
          key={`item-${index}`}
          onClick={() => onClick(entry)}
          onDoubleClick={(e) => {
            e.preventDefault();
            if (onHighlight) onHighlight(entry.value);
          }}
          title="Double-click to isolate"
          className={`flex items-center cursor-pointer transition-opacity ${entry.inactive ? 'opacity-50' : 'opacity-100'} hover:bg-slate-50 dark:hover:bg-slate-800 rounded px-1 -ml-1`}
        >
          <div style={{ width: 12, height: 12, backgroundColor: entry.color, marginRight: 6, borderRadius: '2px' }} />
          <span className="text-xs text-slate-700 dark:text-slate-300">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

// Helper: Export chart data as CSV
import { downloadCsv } from '../src/utils/download';

function exportAsCSV(data: Record<string, any>[], headers: string[]) {
  const filename = `simulation_results_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCsv(data, headers, filename);
}

// Helper: Export chart data as GDAT (BioNetGen format - observables)
function exportAsGDAT(data: Record<string, any>[], headers: string[]) {
  if (!data || data.length === 0) return;

  const gdatHeaders = ['time', ...headers.filter(h => h !== 'time')];
  // GDAT format: # header line with column names, then space-separated numeric values
  const headerLine = '#' + gdatHeaders.map(h => h.padStart(20)).join('');

  const dataRows = data.map(row =>
    gdatHeaders.map(h => {
      const val = row[h] ?? 0;
      // Format as scientific notation for consistency with BNG2.pl
      return typeof val === 'number' ? val.toExponential(12).padStart(22) : String(val).padStart(22);
    }).join('')
  );

  const gdat = [headerLine, ...dataRows].join('\n');

  const blob = new Blob([gdat], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `simulation_results_${new Date().toISOString().slice(0, 10)}.gdat`;
  a.click();
  URL.revokeObjectURL(url);
}

// Helper: Export species concentration data as CDAT (BioNetGen format - all species)
function exportAsCDAT(speciesData: Record<string, number>[] | undefined, speciesHeaders: string[] | undefined, timeData: Record<string, any>[]) {
  if (!speciesData || !speciesHeaders || speciesData.length === 0) {
    alert('Species concentration data not available. CDAT export requires species-level simulation data.');
    return;
  }

  const cdatHeaders = ['time', ...speciesHeaders];
  // CDAT format: # header line with column names, then space-separated numeric values
  const headerLine = '#' + cdatHeaders.map((h, i) => i === 0 ? h.padStart(20) : `S${i}`.padStart(20)).join('');

  const dataRows = speciesData.map((row, idx) => {
    const time = timeData[idx]?.time ?? (idx * (timeData[1]?.time ?? 1));
    const timeStr = (typeof time === 'number' ? time.toExponential(12) : String(time)).padStart(22);
    const speciesStr = speciesHeaders.map(name => {
      const val = row[name] ?? 0;
      return typeof val === 'number' ? val.toExponential(12).padStart(22) : String(val).padStart(22);
    }).join('');
    return timeStr + speciesStr;
  });

  const cdat = [headerLine, ...dataRows].join('\n');

  const blob = new Blob([cdat], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `simulation_species_${new Date().toISOString().slice(0, 10)}.cdat`;
  a.click();
  URL.revokeObjectURL(url);
}

export const ResultsChart: React.FC<ResultsChartProps> = ({ results, visibleSpecies, onVisibleSpeciesChange, highlightedSeries = [], expressions = [] }) => {
  const [zoomHistory, setZoomHistory] = useState<ZoomDomain[]>([]);
  const [selection, setSelection] = useState<ZoomDomain | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'search'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Reset zoom state when the results object changes to avoid carrying zoom across runs
  useEffect(() => {
    setZoomHistory([]);
    setSelection(null);
  }, [results]);

  // Compute chart data with expression values
  const chartData = useMemo(() => {
    if (!results || !results.data) return [];
    if (expressions.length === 0) return results.data;

    // Pre-compute BNGL expression values (once for all time points)
    const bnglExpressionValues: Map<string, number[]> = new Map();
    const bnglExpressions = expressions.filter(e => e.type === 'bngl');

    if (bnglExpressions.length > 0 && results.speciesData && results.speciesHeaders) {
      for (const expr of bnglExpressions) {
        try {
          const computed = computeDynamicObservable(
            { name: expr.name, pattern: expr.expression, type: 'molecules' },
            results,
            results.speciesHeaders
          );
          bnglExpressionValues.set(expr.name, computed.values);
        } catch (e) {
          console.warn(`Failed to compute BNGL expression "${expr.name}":`, e);
          // Fill with zeros on error
          bnglExpressionValues.set(expr.name, new Array(results.data.length).fill(0));
        }
      }
    } else if (bnglExpressions.length > 0) {
      console.warn('[ResultsChart] Cannot compute BNGL expressions - missing speciesData or speciesHeaders');
    }

    return results.data.map((point, index) => {
      const newPoint: Record<string, any> = { ...point };

      // Build variables for math expression evaluation
      const variables: Record<string, number> = { time: point.time ?? 0 };
      Object.keys(point).forEach((key) => {
        if (key !== 'time' && typeof point[key] === 'number') {
          variables[key] = point[key];
        }
      });

      // Evaluate each expression
      expressions.forEach((expr) => {
        if (expr.type === 'bngl') {
          // Use pre-computed BNGL values
          const values = bnglExpressionValues.get(expr.name);
          newPoint[expr.name] = values ? values[index] : 0;
        } else {
          // Math expression: evaluate using observable variables
          const value = evaluateExpression(expr.expression, variables);
          newPoint[expr.name] = value ?? 0;
        }
      });

      return newPoint;
    });
  }, [results, expressions]);

  if (!results || results.data.length === 0) {
    return (
      <Card className="flex h-96 max-w-full items-center justify-center overflow-hidden">
        <p className="text-slate-500">Run a simulation to see the results.</p>
      </Card>
    );
  }

  const handleLegendClick = (data: any) => {
    const newVisibleSpecies = new Set(visibleSpecies);
    // dataKey is for default legend, value is for custom legend payload
    const dataKey = data.dataKey || data.value;
    if (newVisibleSpecies.has(dataKey)) {
      newVisibleSpecies.delete(dataKey);
    } else {
      newVisibleSpecies.add(dataKey);
    }
    onVisibleSpeciesChange(newVisibleSpecies);
  };

  const handleMouseDown = (e: any) => {
    if (e && e.activeLabel) {
      setSelection({
        x1: e.activeLabel, x2: e.activeLabel,
        y1: e.activeCoordinate.y, y2: e.activeCoordinate.y // Placeholder
      });
    }
  };

  const handleMouseMove = (e: any) => {
    if (selection && e && e.activeLabel) {
      setSelection({ ...selection, x2: e.activeLabel });
    }
  };

  const handleMouseUp = () => {
    if (selection) {
      const { x1, x2 } = selection;
      if (typeof x1 === 'number' && typeof x2 === 'number' && Math.abs(x1 - x2) > 0.001) {
        const newDomain: ZoomDomain = {
          x1: Math.min(x1, x2),
          x2: Math.max(x1, x2),
          y1: 'dataMin',
          y2: 'dataMax'
        };
        setZoomHistory([...zoomHistory, newDomain]);
      }
      setSelection(null);
    }
  };

  const handleDoubleClick = () => {
    setZoomHistory([]);
  };

  const speciesToPlot = results.headers.filter(h => h !== 'time');
  const filterVisibleSpecies = (name: string) => {
    if (filterMode === 'all') return true;
    if (filterMode === 'search') return searchTerm.trim() === '' ? true : name.toLowerCase().includes(searchTerm.toLowerCase());
    return true;
  };
  const currentDomain = zoomHistory.length > 0 ? zoomHistory[zoomHistory.length - 1] : undefined;
  const highlightSet = new Set(highlightedSeries);

  // Use external legend when there are many series to keep chart size fixed
  const useExternalLegend = speciesToPlot.length > LEGEND_THRESHOLD;

  const handleToggleSeries = (name: string) => {
    const newVisibleSpecies = new Set(visibleSpecies);
    if (newVisibleSpecies.has(name)) {
      newVisibleSpecies.delete(name);
    } else {
      newVisibleSpecies.add(name);
    }
    onVisibleSpeciesChange(newVisibleSpecies);
  };

  const handleLegendHighlight = (name: string) => {
    // If only this one is currently visible, toggle back to showing all
    if (visibleSpecies.size === 1 && visibleSpecies.has(name)) {
      // Restore all from the current filtered list (or all available headers)
      onVisibleSpeciesChange(new Set(speciesToPlot));
    } else {
      // Isolate just this one
      onVisibleSpeciesChange(new Set([name]));
    }
  };

  return (
    <Card className="max-w-full overflow-hidden">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.3)" />
          <XAxis
            dataKey="time"
            label={{ value: 'Time', position: 'insideBottom', offset: -5 }}
            type="number"
            domain={currentDomain ? [currentDomain.x1, currentDomain.x2] : ['dataMin', 'dataMax']}
            allowDataOverflow={true}
          />
          <YAxis
            label={{ value: 'Concentration', angle: -90, position: 'insideLeft' }}
            domain={currentDomain ? [currentDomain.y1, currentDomain.y2] : [0, 'dataMax']}
            allowDataOverflow={true}
            tickFormatter={(value) => {
              if (typeof value !== 'number') return value;
              if (value === 0) return '0';
              const abs = Math.abs(value);
              if (abs >= 1e9) return (value / 1e9).toFixed(1) + 'B';
              if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
              if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
              if (abs < 0.01) return value.toExponential(1);
              if (abs < 10) return value.toFixed(2);  // Show 2 decimals for small values
              return value.toFixed(0);
            }}
          />
          <Tooltip
            formatter={(value: any) => {
              const num = typeof value === 'number' ? value : parseFloat(value);
              return num.toFixed(2);
            }}
            labelFormatter={(label) => `Time: ${typeof label === 'number' ? label.toFixed(2) : label}`}
          />
          {/* Only show in-chart legend when there are few series */}
          {!useExternalLegend && <Legend onClick={handleLegendClick} content={<CustomLegend onHighlight={handleLegendHighlight} />} />}
          {speciesToPlot.filter(filterVisibleSpecies).map((speciesName, i) => (
            <Line
              key={speciesName}
              type="monotone"
              dataKey={speciesName}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={highlightSet.has(speciesName) ? 3 : 1.5}
              dot={false}
              hide={!visibleSpecies.has(speciesName)}
              strokeOpacity={highlightSet.size === 0 || highlightSet.has(speciesName) ? 1 : 0.35}
            />
          ))}
          {/* Expression lines with dashed style to distinguish */}
          {expressions.map((expr) => (
            <Line
              key={expr.id}
              type="monotone"
              dataKey={expr.name}
              stroke={expr.color}
              strokeWidth={highlightSet.has(expr.name) ? 3 : 2}
              strokeDasharray="5 3"
              dot={false}
              hide={!visibleSpecies.has(expr.name)}
              strokeOpacity={highlightSet.size === 0 || highlightSet.has(expr.name) ? 1 : 0.35}
            />
          ))}
          {selection && (
            <ReferenceArea
              x1={selection.x1}
              x2={selection.x2}
              strokeOpacity={0.3}
              fill="#8884d8"
              fillOpacity={0.2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* External legend below the chart when there are many series */}
      {useExternalLegend && (
        <ExternalLegend
          series={speciesToPlot.filter(filterVisibleSpecies)}
          visibleSpecies={visibleSpecies}
          onToggle={handleToggleSeries}
          onHighlight={handleLegendHighlight}
          highlightedSeries={highlightSet}
        />
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex gap-2">
            <button className={`px-3 py-1 rounded ${filterMode === 'all' ? 'bg-primary text-white' : 'bg-slate-100'}`} onClick={() => setFilterMode('all')}>All</button>
            <button className={`px-3 py-1 rounded ${filterMode === 'search' ? 'bg-primary text-white' : 'bg-slate-100'}`} onClick={() => setFilterMode('search')}>Search</button>
          </div>
          {filterMode === 'search' && (
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Filter legends..." className="ml-2 border px-2 py-1 rounded text-sm" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportAsCDAT(results?.speciesData, results?.speciesHeaders, chartData)}
            className="px-3 py-1 rounded bg-purple-100 hover:bg-purple-200 dark:bg-purple-900 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-300 text-sm"
            title="Export as CDAT (species concentrations)"
          >
            📥 CDAT
          </button>
          <button
            onClick={() => exportAsGDAT(chartData, speciesToPlot)}
            className="px-3 py-1 rounded bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 text-sm"
            title="Export as GDAT (observables)"
          >
            📥 GDAT
          </button>
          <button
            onClick={() => exportAsCSV(chartData, speciesToPlot)}
            className="px-3 py-1 rounded bg-teal-100 hover:bg-teal-200 dark:bg-teal-900 dark:hover:bg-teal-800 text-teal-700 dark:text-teal-300 text-sm"
            title="Export as CSV (comma-separated values)"
          >
            📥 CSV
          </button>
          <button onClick={() => { setZoomHistory([]); setSelection(null); onVisibleSpeciesChange(new Set(speciesToPlot)); }} className="px-3 py-1 rounded bg-slate-100">Reset view</button>
        </div>
      </div>
      <div className="text-center text-xs text-slate-500 mt-2">
        Click to toggle series. Double-click legend to isolate/restore. Drag chart to zoom. Double-click chart to reset view.
      </div>
    </Card>
  );
};