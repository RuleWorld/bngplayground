import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import { BNGLModel, SimulationResults } from '../types';
import { CHART_COLORS } from '../constants';
import { Card } from './ui/Card';
import { CustomExpression, evaluateExpression } from './ExpressionInputPanel';
import { computeDynamicObservable } from '../src/utils/dynamicObservable';

import { Dropdown, DropdownItem } from './ui/Dropdown';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

interface ResultsChartProps {
  results: SimulationResults | null;
  model: BNGLModel | null;
  visibleSpecies: Set<string>;
  onVisibleSpeciesChange: (species: Set<string>) => void;
  highlightedSeries?: string[];
  expressions?: CustomExpression[];
  isNFsim?: boolean; // Flag to indicate if this is NFsim data (counts vs concentrations)
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
  series: Array<{ name: string; color: string }>;
  visibleSpecies: Set<string>;
  onToggle: (name: string) => void;
  onHighlight: (name: string) => void;
  highlightedSeries: Set<string>;
}> = ({ series, visibleSpecies, onToggle, onHighlight, highlightedSeries }) => {
  return (
    <div className="mt-4 max-h-48 overflow-y-auto border-t border-slate-200 dark:border-slate-700 pt-4">
      <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 px-4">
        {series.map((item) => {
          const isVisible = visibleSpecies.has(item.name);
          const isHighlighted = highlightedSeries.size === 0 || highlightedSeries.has(item.name);
          return (
            <div
              key={item.name}
              onClick={() => onToggle(item.name)}
              onDoubleClick={(e) => {
                e.preventDefault();
                onHighlight(item.name);
              }}
              title="Double-click to isolate"
              className={`flex items-center cursor-pointer transition-opacity ${!isVisible ? 'opacity-40' : isHighlighted ? 'opacity-100' : 'opacity-60'} hover:bg-slate-50 dark:hover:bg-slate-800 rounded px-1 -ml-1`}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: item.color,
                  marginRight: 6,
                  borderRadius: '2px'
                }}
              />
              <span className="text-xs text-slate-700 dark:text-slate-300">{item.name}</span>
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

function exportAsCSV(data: Record<string, any>[], headers: string[], suffixName?: string) {
  const sfx = !suffixName || suffixName === '__default__' ? '' : `_${suffixName}`;
  const filename = `simulation_results_${new Date().toISOString().slice(0, 10)}${sfx}.csv`;
  downloadCsv(data, headers, filename);
}

// Helper: Export chart data as GDAT (BioNetGen format - observables)
function exportAsGDAT(results: SimulationResults | null) {
  if (!results) return;
  const dataMap = (results.dataBySuffix && Object.keys(results.dataBySuffix).length > 0)
    ? results.dataBySuffix
    : { '__default__': results.data };
  
  const headers = results.headers || [];
  const gdatHeaders = ['time', ...headers.filter(h => h !== 'time')];
  const headerLine = '#' + gdatHeaders.map(h => h.padStart(20)).join('');

  for (const [suffix, data] of Object.entries(dataMap)) {
    if (!data || data.length === 0) continue;

    const dataRows = data.map(row =>
      gdatHeaders.map(h => {
        const val = row[h] ?? 0;
        return typeof val === 'number' ? val.toExponential(12).padStart(22) : String(val).padStart(22);
      }).join('')
    );

    const gdat = [headerLine, ...dataRows].join('\n');
    const blob = new Blob([gdat], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sfx = suffix === '__default__' ? '' : `_${suffix}`;
    a.download = `simulation_results_${new Date().toISOString().slice(0, 10)}${sfx}.gdat`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Helper: Export species concentration data as CDAT (BioNetGen format - all species)
function exportAsCDAT(results: SimulationResults | null) {
  if (!results || !results.speciesHeaders) {
    alert('Species concentration data not available. CDAT export requires species-level simulation data.');
    return;
  }
  const speciesDataMap = (results.speciesDataBySuffix && Object.keys(results.speciesDataBySuffix).length > 0)
    ? results.speciesDataBySuffix
    : { '__default__': results.speciesData };
  const timeDataMap = (results.dataBySuffix && Object.keys(results.dataBySuffix).length > 0)
    ? results.dataBySuffix
    : { '__default__': results.data };

  const cdatHeaders = ['time', ...results.speciesHeaders];
  const headerLine = '#' + cdatHeaders.map((h, i) => i === 0 ? h.padStart(20) : `S${i}`.padStart(20)).join('');

  for (const [suffix, speciesData] of Object.entries(speciesDataMap)) {
    if (!speciesData || speciesData.length === 0) continue;
    const timeData = timeDataMap[suffix] || timeDataMap['__default__'] || [];

    const dataRows = speciesData.map((row, idx) => {
      const time = timeData[idx]?.time ?? (idx * (timeData[1]?.time ?? 1));
      const timeStr = (typeof time === 'number' ? time.toExponential(12) : String(time)).padStart(22);
      const speciesStr = results.speciesHeaders!.map(name => {
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
    const sfx = suffix === '__default__' ? '' : `_${suffix}`;
    a.download = `simulation_species_${new Date().toISOString().slice(0, 10)}${sfx}.cdat`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const ResultsChart: React.FC<ResultsChartProps> = ({ results, model, isNFsim, visibleSpecies, onVisibleSpeciesChange, highlightedSeries = [], expressions = [] }) => {
  const [zoomHistory, setZoomHistory] = useState<ZoomDomain[]>([]);
  const [selection, setSelection] = useState<ZoomDomain | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'search'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [wrapperRef, setWrapperRef] = useState<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [xAxisScale, setXAxisScale] = useState<'linear' | 'log'>('linear');
  const [yAxisScale, setYAxisScale] = useState<'linear' | 'log'>('linear');
  const [selectedSuffix, setSelectedSuffix] = useState<string>('__default__');

  const availableSuffixes = useMemo(() => {
    if (!results?.dataBySuffix) return ['__default__'];
    const keys = Object.keys(results.dataBySuffix);
    return keys.length > 0 ? keys : ['__default__'];
  }, [results]);

  const isNFsimMode = useMemo(() => {
    if (typeof isNFsim === 'boolean') return isNFsim;
    const method = model?.simulationPhases?.[0]?.method;
    return method === 'nf' || method === 'nfsim';
  }, [isNFsim, model]);

  // Reset zoom when scale changes
  const handleXScaleChange = () => {
    setXAxisScale(prev => prev === 'linear' ? 'log' : 'linear');
    setZoomHistory([]);
    setSelection(null);
  };

  const handleYScaleChange = () => {
    setYAxisScale(prev => prev === 'linear' ? 'log' : 'linear');
    setZoomHistory([]);
    setSelection(null);
  };

  useEffect(() => {
    if (!wrapperRef) return;
    
    setDimensions({ 
      width: wrapperRef.offsetWidth, 
      height: wrapperRef.offsetHeight 
    });

    const observer = new ResizeObserver(entries => {
      window.requestAnimationFrame(() => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            setDimensions({ width, height });
          }
        }
      });
    });

    observer.observe(wrapperRef);
    return () => observer.disconnect();
  }, [wrapperRef]);

  const hasValidDimensions = dimensions.width > 0 && dimensions.height > 0;

  // Reset zoom state when the results object changes to avoid carrying zoom across runs
  useEffect(() => {
    setZoomHistory([]);
    setSelection(null);
    setSelectedSuffix(availableSuffixes[0] || '__default__');
  }, [results, availableSuffixes]);

  // Compute chart data with expression values
  const chartData = useMemo(() => {
    if (!results) return [];
    const sourceData = (results.dataBySuffix && results.dataBySuffix[selectedSuffix]) 
      || results.data;
    if (!sourceData) return [];
    if (expressions.length === 0) return sourceData;

    // Pre-compute BNGL expression values (once for all time points)
    const bnglExpressionValues: Map<string, number[]> = new Map();
    const bnglExpressions = expressions.filter(e => e.type === 'bngl');

    // 1. Prepare parameters map (filtering by seed species if bnglCode is available)
    const paramsMap = new Map<string, number>();
    if (model) {
      // Find seed parameters if we have access to the BNGL code
      // We'll prioritize the ones the user expects to see
      // Note: VisualizationPanel already computes this for autocomplete, 
      // but we re-derive here for the computation logic.
      const seedParams = model.parameters ? Object.keys(model.parameters) : [];
      
      for (const pName of seedParams) {
        paramsMap.set(pName, model.parameters[pName]);
      }
    }

    if (bnglExpressions.length > 0 && results.speciesData && results.speciesHeaders) {
      for (const expr of bnglExpressions) {
        try {
          const computed = computeDynamicObservable(
            { name: expr.name, pattern: expr.expression, type: 'molecules' },
            results,
            results.speciesHeaders,
            paramsMap
          );
          bnglExpressionValues.set(expr.name, computed.values);
        } catch (e) {
          console.warn(`Failed to compute BNGL expression "${expr.name}":`, e);
          // Fill with zeros on error
          bnglExpressionValues.set(expr.name, new Array(sourceData.length).fill(0));
        }
      }
    } else if (bnglExpressions.length > 0) {
      console.warn('[ResultsChart] Cannot compute BNGL expressions - missing speciesData or speciesHeaders');
    }

    return results.data.map((point, index) => {
      const newPoint: Record<string, any> = { ...point };

      // Build variables for math expression evaluation
      const variables: Record<string, number> = { 
        time: point.time ?? 0,
        ...(model?.parameters ?? {})
      };

      // Add observable data
      Object.keys(point).forEach((key) => {
        if (key !== 'time' && typeof point[key] === 'number') {
          variables[key] = point[key];
        }
      });

      // Add species concentration data if available
      const sourceSpeciesData = (results.speciesDataBySuffix && results.speciesDataBySuffix[selectedSuffix]) 
        || results.speciesData;
      const speciesPoint = sourceSpeciesData?.[index];
      if (speciesPoint) {
        Object.keys(speciesPoint).forEach(sName => {
          variables[sName] = speciesPoint[sName];
        });
      }

      // Evaluate each expression
      expressions.forEach((expr) => {
        if (expr.type === 'bngl') {
          // Use pre-computed BNGL values
          const values = bnglExpressionValues.get(expr.name);
          newPoint[expr.name] = values ? values[index] : 0;
        } else {
          // Math expression: evaluate using all variables (observables, params, species)
          const value = evaluateExpression(expr.expression, variables);
          newPoint[expr.name] = value ?? 0;
        }
      });

      return newPoint;
    });
  }, [results, expressions, selectedSuffix]);

  const speciesToPlot = (results?.headers ?? []).filter(h => h !== 'time');

  const plotSeriesKeys = useMemo(() => {
    const exprKeys = expressions.map(expr => expr.name);
    return [...speciesToPlot, ...exprKeys];
  }, [speciesToPlot, expressions]);

  const plotData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const useLogX = xAxisScale === 'log';
    const useLogY = yAxisScale === 'log';

    return chartData
      .filter(point => !useLogX || (typeof point.time === 'number' && point.time > 0))
      .map((point) => {
        const next: Record<string, any> = { ...point };

        if (useLogX && typeof point.time === 'number' && point.time > 0) {
          next.__time = Math.log10(point.time);
        }

        if (useLogY) {
          plotSeriesKeys.forEach((seriesKey) => {
            const val = point[seriesKey];
            if (typeof val === 'number' && val > 0) {
              next[`__${seriesKey}`] = Math.log10(val);
            } else {
              next[`__${seriesKey}`] = null;
            }
          });
        }

        return next;
      });
  }, [chartData, plotSeriesKeys, xAxisScale, yAxisScale]);

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
  const filterVisibleSpecies = (name: string) => {
    if (filterMode === 'all') return true;
    if (filterMode === 'search') return searchTerm.trim() === '' ? true : name.toLowerCase().includes(searchTerm.toLowerCase());
    return true;
  };
  const currentDomain = zoomHistory.length > 0 ? zoomHistory[zoomHistory.length - 1] : undefined;
  const highlightSet = new Set(highlightedSeries);

  // Use external legend for consistent layout and spacing
  const useExternalLegend = true;

  const chartMarginBottom = 36;

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



  const yAxisBaseLabel = isNFsimMode ? 'Counts' : 'Concentration';
  const yAxisLabel = yAxisScale === 'log' ? `log(${yAxisBaseLabel})` : yAxisBaseLabel;
  const xAxisLabel = xAxisScale === 'log' ? 'log(Time)' : 'Time';

  const formatAxisValue = (value: number, axis: 'x' | 'y') => {
    if (axis === 'x' && xAxisScale === 'log') {
      return Number.isFinite(value) ? value.toFixed(3) : String(value);
    }
    if (axis === 'y' && yAxisScale === 'log') {
      return Number.isFinite(value) ? value.toFixed(3) : String(value);
    }
    const abs = Math.abs(value);
    if (abs === 0) return '0';
    if (abs >= 1e9) return (value / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    if (abs < 0.01) return value.toPrecision(2);
    
    // Check if it's an integer to avoid 1.00 or 2.00, but keep 1.50
    if (Number.isInteger(value)) return value.toString();
    
    // For values between 0.01 and 1000, use up to 2 decimal places but trim unnecessary zeros
    const formatted = value.toFixed(2);
    return formatted.replace(/\.?0+$/, '');
  };


  const getTransformedDomain = (axis: 'time' | 'y') => {
    if (!plotData || plotData.length === 0) return ['dataMin', 'dataMax'] as const;

    let minVal = Infinity;
    let maxVal = -Infinity;

    if (axis === 'time') {
      const key = timeKey;
      plotData.forEach((point) => {
        const val = point[key];
        if (typeof val === 'number' && Number.isFinite(val)) {
          minVal = Math.min(minVal, val);
          maxVal = Math.max(maxVal, val);
        }
      });
    } else {
      plotData.forEach((point) => {
        plotSeriesKeys.forEach((seriesKey) => {
          if (!visibleSpecies.has(seriesKey)) return;
          const val = point[`__${seriesKey}`];
          if (typeof val === 'number' && Number.isFinite(val)) {
            minVal = Math.min(minVal, val);
            maxVal = Math.max(maxVal, val);
          }
        });
      });
    }

    if (minVal === Infinity || maxVal === -Infinity) {
      return ['dataMin', 'dataMax'] as const;
    }

    const span = Math.max(1e-6, maxVal - minVal);
    const padding = span * 0.08;
    if (axis === 'time') {
      // For log(Time), avoid pushing below the first data point
      return [minVal, maxVal + padding] as const;
    }
    return [minVal - padding, maxVal + padding] as const;
  };

  const timeKey = xAxisScale === 'log' ? '__time' : 'time';

  // Custom Glassy Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-lg shadow-lg text-xs">
          <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">
            {xAxisLabel}: {typeof label === 'number' ? formatAxisValue(label, 'x') : label}
          </p>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
            {payload.map((entry: any, idx: number) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-slate-500 dark:text-slate-400">{entry.name}:</span>
                <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                  {typeof entry.value === 'number' ? formatAxisValue(entry.value, 'y') : entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="max-w-full flex flex-col h-auto min-h-full">
      {/* Suffix Tabs (if multiple available) */}
      {availableSuffixes.length > 1 && (
        <div className="flex gap-2 p-2 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10">
          {availableSuffixes.map(sfx => (
            <button
              key={sfx}
              onClick={() => { setSelectedSuffix(sfx); setZoomHistory([]); setSelection(null); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                selectedSuffix === sfx
                  ? 'bg-white border-blue-200 text-blue-700 shadow-sm dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-300'
                  : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/50'
              }`}
            >
              {sfx === '__default__' ? 'Default Context' : sfx}
            </button>
          ))}
        </div>
      )}

      <div 
        ref={setWrapperRef}
        className="h-[500px] w-full relative" 
        style={{ width: '100%', height: 500, minHeight: 500 }}
      >
        {hasValidDimensions ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} debounce={50}>
          <LineChart
            data={plotData}
            margin={{ top: 10, right: 20, left: 10, bottom: chartMarginBottom }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.15)" vertical={false} />
            <XAxis
              dataKey={timeKey}
              label={{ value: xAxisLabel, position: 'bottom', offset: 12, fill: '#334155', fontSize: 13, fontWeight: 'bold' }}
              type="number"
              scale="linear"
              domain={currentDomain ? [currentDomain.x1, currentDomain.x2] : (xAxisScale === 'log' ? getTransformedDomain('time') : ['dataMin', 'dataMax'])}
              allowDataOverflow={true}
              allowDecimals={true}
              tickCount={7}
              tickMargin={6}
              tick={{ fontSize: 11, fill: 'black' }}
              tickLine={{ stroke: 'black' }}
              axisLine={{ stroke: 'black' }}
              tickFormatter={(value) => {
                if (typeof value !== 'number') return value;
                return formatAxisValue(value, 'x');
              }}
            />
            <YAxis
              label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', fill: '#334155', fontSize: 13, fontWeight: 'bold' }}
              scale="linear"
              domain={currentDomain ? [currentDomain.y1, currentDomain.y2] : (yAxisScale === 'log' ? getTransformedDomain('y') : [0, 'dataMax'])}
              allowDataOverflow={true}
              allowDecimals={true}
              tickCount={6}
              tick={{ fontSize: 11, fill: 'black' }}
              tickLine={{ stroke: 'black' }}
              axisLine={{ stroke: 'black' }}
              tickFormatter={(value) => {
                if (typeof value !== 'number') return value;
                return formatAxisValue(value, 'y');
              }}
            />
            <Tooltip content={<CustomTooltip />} />

            {!useExternalLegend && (
              <Legend
                onClick={handleLegendClick as any}
                content={<CustomLegend onHighlight={handleLegendHighlight} />}
                verticalAlign="bottom"
              />
            )}

            {speciesToPlot.filter(filterVisibleSpecies).map((speciesName, i) => (
              <Line
                key={speciesName}
                type="monotone"
                dataKey={yAxisScale === 'log' ? `__${speciesName}` : speciesName}
                name={speciesName}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={highlightSet.has(speciesName) ? 3 : 1.5}
                dot={false}
                hide={!visibleSpecies.has(speciesName)}
                strokeOpacity={highlightSet.size === 0 || highlightSet.has(speciesName) ? 1 : 0.15}
                animationDuration={1500}
                animationEasing="ease-out"
                isAnimationActive={true}
              />
            ))}
            {/* Expression lines */}
            {expressions.map((expr) => (
              <Line
                key={expr.id}
                type="monotone"
                dataKey={yAxisScale === 'log' ? `__${expr.name}` : expr.name}
                name={expr.name}
                stroke={expr.color}
                strokeWidth={highlightSet.has(expr.name) ? 3 : 2}
                strokeDasharray="5 3"
                dot={false}
                hide={!visibleSpecies.has(expr.name)}
                strokeOpacity={highlightSet.size === 0 || highlightSet.has(expr.name) ? 1 : 0.15}
                isAnimationActive={true}
                animationDuration={1500}
                animationEasing="ease-out"
              />
            ))}
            {selection && (
              <ReferenceArea
                x1={selection.x1}
                x2={selection.x2}
                strokeOpacity={0.3}
                fill="#3b82f6"
                fillOpacity={0.1}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            Initializing chart dimensions...
          </div>
        )}
      </div>

      {/* External legend */}
      {useExternalLegend && (
        <ExternalLegend
          series={[
            ...speciesToPlot.filter(filterVisibleSpecies).map((name, i) => ({ name, color: CHART_COLORS[i % CHART_COLORS.length] })),
            ...expressions.filter(expr => filterVisibleSpecies(expr.name)).map(expr => ({ name: expr.name, color: expr.color }))
          ]}
          visibleSpecies={visibleSpecies}
          onToggle={handleToggleSeries}
          onHighlight={handleLegendHighlight}
          highlightedSeries={highlightSet}
        />
      )}



      {/* Toolbar */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="inline-flex gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
            <button
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${filterMode === 'all' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
              onClick={() => setFilterMode('all')}
            >
              All
            </button>
            <button
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${filterMode === 'search' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
              onClick={() => setFilterMode('search')}
            >
              Search
            </button>
          </div>
          {filterMode === 'search' && (
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter series..."
              className="ml-1 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded text-xs bg-transparent dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          )}
          
          {/* Scale toggles */}
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Scale:</span>
            <button
              onClick={handleXScaleChange}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${xAxisScale === 'log' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              title="Toggle X-axis scale (resets zoom)"
            >
              X: {xAxisScale === 'log' ? 'Log' : 'Linear'}
            </button>
            <button
              onClick={handleYScaleChange}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${yAxisScale === 'log' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              title="Toggle Y-axis scale (resets zoom)"
            >
              Y: {yAxisScale === 'log' ? 'Log' : 'Linear'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Reset View Button */}
          <button
            onClick={() => { setZoomHistory([]); setSelection(null); onVisibleSpeciesChange(new Set(speciesToPlot)); }}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Reset View
          </button>

          {/* Export Dropdown */}
          <Dropdown
            direction="up"
            trigger={
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <span>📥 Export</span>
                <ChevronDownIcon className="w-3 h-3 text-slate-400" />
              </button>
            }
          >
            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Download Data</div>
            <DropdownItem onClick={() => exportAsCSV(chartData, speciesToPlot, selectedSuffix)}>
              Export as CSV (Current Plot)
            </DropdownItem>
            <DropdownItem onClick={() => exportAsCDAT(results)}>
              Export as CDAT (Species)
            </DropdownItem>
            <DropdownItem onClick={() => exportAsGDAT(results)}>
              Export as GDAT (Observables)
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
    </Card>
  );
};