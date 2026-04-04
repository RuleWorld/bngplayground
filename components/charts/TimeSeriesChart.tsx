import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import { formatValue } from '../../src/utils/formatValue';
import { InlineLegend } from './InteractiveLegend';
import { CHART_FONT_DEFAULTS } from '../../src/utils/chartColors';
import { downloadTextFile } from '../../src/utils/download';

export interface TimeSeriesSeries {
  name: string;
  color: string;
  type?: 'line' | 'scatter';
  strokeWidth?: number;
  strokeDasharray?: string;
  dot?: boolean;
}

interface TimeSeriesChartProps {
  data: any[];
  series: TimeSeriesSeries[];
  visibleSeries?: Set<string>;
  onSeriesToggle?: (name: string) => void;
  onSeriesIsolate?: (name: string) => void;
  xAxisLabel?: string;
  yAxisLabel?: string;
  xAxisKey?: string;
  height?: number | string;
  margin?: { top: number; right: number; left: number; bottom: number };
  syncId?: string;
  showGrid?: boolean;
  animationDuration?: number;
  allowZoom?: boolean;
  allowScale?: boolean;

  // Publication mode
  hideXAxisLabel?: boolean;    // For top panels in multi-row layout
  hideYAxisLabel?: boolean;    // For right panels in multi-column layout
  subfigureLabel?: string;     // e.g., "(A)", "(B)"
}

type ZoomDomain = {
  x1: number | 'dataMin';
  x2: number | 'dataMax';
  y1: number | 'dataMin';
  y2: number | 'dataMax';
}

/**
 * Standard TimeSeriesChart for BioNetGen simulation results.
 * Abstracted for UI consistency across the app.
 */
export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  series,
  visibleSeries,
  onSeriesToggle,
  onSeriesIsolate,
  xAxisLabel = 'Time',
  yAxisLabel = 'Concentration',
  xAxisKey = 'time',
  height = '100%',
  margin = { top: 20, right: 30, left: 30, bottom: 85 }, // Optimized bottom margin for legend
  syncId,
  showGrid = false,
  animationDuration = 300,
  allowZoom = true,
  allowScale = true,
  hideXAxisLabel = false,
  hideYAxisLabel = false,
  subfigureLabel,
}) => {
  const [zoomHistory, setZoomHistory] = useState<ZoomDomain[]>([]);
  const [selection, setSelection] = useState<ZoomDomain | null>(null);
  const [xAxisScale, setXAxisScale] = useState<'linear' | 'log'>('linear');
  const [yAxisScale, setYAxisScale] = useState<'linear' | 'log'>('linear');

  const chartRef = useRef<HTMLDivElement>(null);

  const exportChartSVG = useCallback(() => {
    if (!chartRef.current) return;
    const svgElement = chartRef.current.querySelector('svg');
    if (!svgElement) return;

    // Default column width for single column PLOS Comp Bio is 13.2cm
    const widthCm = 13.2;
    const widthInches = widthCm / 2.54;
    const widthPx = Math.round(widthInches * 300); // 300 DPI
    const aspectRatio = svgElement.viewBox.baseVal.height / svgElement.viewBox.baseVal.width;
    const heightPx = Math.round(widthPx * aspectRatio);

    const clone = svgElement.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', `${widthPx}`);
    clone.setAttribute('height', `${heightPx}`);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);

    // Add xml declaration if missing
    const finalSvg = svgString.startsWith('<?xml') ? svgString : `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;

    downloadTextFile(finalSvg, 'chart.svg', 'image/svg+xml');
  }, []);

  const exportChartRaster = useCallback(() => {
    if (!chartRef.current) return;
    const svgElement = chartRef.current.querySelector('svg');
    if (!svgElement) return;

    const widthCm = 13.2;
    const dpi = 300;
    const widthInches = widthCm / 2.54;
    const widthPx = Math.round(widthInches * dpi);
    const aspectRatio = svgElement.viewBox.baseVal.height / svgElement.viewBox.baseVal.width;
    const heightPx = Math.round(widthPx * aspectRatio);

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill background with white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, widthPx, heightPx);

    const img = new Image();
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, widthPx, heightPx);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = 'chart.png';
      a.click();
    };
    img.src = url;
  }, []);

  const handleLegendClick = (name: string) => {
    if (onSeriesToggle) {
      onSeriesToggle(name);
    }
  };

  const handleLegendDoubleClick = (name: string) => {
    if (onSeriesIsolate) {
      onSeriesIsolate(name);
    }
  };

  const handleMouseDown = (e: any) => {
    if (!allowZoom) return;
    if (e && e.activeLabel) {
      setSelection({
        x1: e.activeLabel, x2: e.activeLabel,
        y1: 'dataMin', y2: 'dataMax'
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
        setZoomHistory([...zoomHistory, {
          x1: Math.min(x1, x2),
          x2: Math.max(x1, x2),
          y1: 'dataMin',
          y2: 'dataMax'
        }]);
      }
      setSelection(null);
    }
  };

  const handleDoubleClick = () => {
    setZoomHistory([]);
  };

  const currentDomain = zoomHistory.length > 0 ? zoomHistory[zoomHistory.length - 1] : undefined;

  const plotData = useMemo(() => {
    if (xAxisScale === 'linear' && yAxisScale === 'linear') return data;
    
    return data.map(point => {
      const next: Record<string, any> = { ...point };
      if (xAxisScale === 'log' && typeof point[xAxisKey] === 'number' && point[xAxisKey] > 0) {
        next[`__${xAxisKey}`] = Math.log10(point[xAxisKey]);
      }
      if (yAxisScale === 'log') {
        series.forEach(s => {
          const val = point[s.name];
          if (typeof val === 'number' && val > 0) {
            next[`__${s.name}`] = Math.log10(val);
          } else {
            next[`__${s.name}`] = null;
          }
        });
      }
      return next;
    });
  }, [data, xAxisKey, xAxisScale, yAxisScale, series]);

  const displayXKey = xAxisScale === 'log' ? `__${xAxisKey}` : xAxisKey;
  const displayXLabel = xAxisScale === 'log' ? `log(${xAxisLabel})` : xAxisLabel;
  const displayYLabel = yAxisScale === 'log' ? `log(${yAxisLabel})` : yAxisLabel;

  // Manual legend payload to keep it outside the SVG coordinate space (avoids squishing)
  const legendPayload = useMemo(() => series.map(s => ({
    value: s.name,
    color: s.color,
    type: s.type,
    inactive: visibleSeries ? !visibleSeries.has(s.name) : false
  })), [series, visibleSeries]);

  return (
    <div 
      className="flex flex-col w-full overflow-hidden" 
      style={{ height: height || '100%' }}
    >
      {/* Main Chart Area */}
      <div className="flex-1 min-h-[160px] relative" ref={chartRef}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart 
            data={plotData} 
            margin={{ ...margin, bottom: 25 }} // Axis labels need some space but not legend anymore
            syncId={syncId}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          >
            {showGrid && <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#cbd5e1" strokeOpacity={0.45} />}
            <XAxis
              dataKey={displayXKey}
              type="number"
              tickFormatter={(v) => formatValue(xAxisScale === 'log' ? Math.pow(10, Number(v)) : Number(v))}
              axisLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
              tickLine={{ stroke: '#94a3b8' }}
              tick={{ fill: CHART_FONT_DEFAULTS.tickColor, fontSize: CHART_FONT_DEFAULTS.tickLabelSize, fontWeight: CHART_FONT_DEFAULTS.tickLabelWeight, fontFamily: CHART_FONT_DEFAULTS.tickLabelFamily }}
              domain={currentDomain ? [currentDomain.x1, currentDomain.x2] : ['auto', 'auto']}
              allowDataOverflow={true}
              label={hideXAxisLabel ? undefined : {
                value: displayXLabel,
                position: 'insideBottom',
                offset: -12,
                style: {
                  fontSize: CHART_FONT_DEFAULTS.axisTitleSize,
                  fontWeight: CHART_FONT_DEFAULTS.axisTitleWeight,
                  fontFamily: CHART_FONT_DEFAULTS.axisTitleFamily,
                  fill: CHART_FONT_DEFAULTS.axisColor,
                }
              }}
            />
            <YAxis
              scale="linear"
              tickFormatter={(v) => formatValue(yAxisScale === 'log' ? Math.pow(10, Number(v)) : Number(v))}
              axisLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
              tickLine={{ stroke: '#94a3b8' }}
              tick={{ fill: CHART_FONT_DEFAULTS.tickColor, fontSize: CHART_FONT_DEFAULTS.tickLabelSize, fontWeight: CHART_FONT_DEFAULTS.tickLabelWeight, fontFamily: CHART_FONT_DEFAULTS.tickLabelFamily }}
              domain={currentDomain ? [currentDomain.y1, currentDomain.y2] : [0, 'auto']}
              allowDataOverflow={true}
              label={hideYAxisLabel ? undefined : {
                value: displayYLabel,
                angle: -90,
                position: 'insideLeft',
                offset: -10,
                style: {
                  fontSize: CHART_FONT_DEFAULTS.axisTitleSize,
                  fontWeight: CHART_FONT_DEFAULTS.axisTitleWeight,
                  fontFamily: CHART_FONT_DEFAULTS.axisTitleFamily,
                  fill: CHART_FONT_DEFAULTS.axisColor,
                  textAnchor: 'middle'
                }
              }}
            />
            <RechartsTooltip
              content={<CustomTooltip xAxisLabel={xAxisLabel} xAxisScale={xAxisScale} yAxisScale={yAxisScale} />}
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '5 5' }}
            />
            {series.map((s, i) => {
              const isVisible = visibleSeries ? visibleSeries.has(s.name) : true;
              const dataKey = yAxisScale === 'log' ? `__${s.name}` : s.name;
              
              if (s.type === 'scatter') {
                return (
                  <Scatter
                    key={s.name}
                    name={s.name}
                    dataKey={dataKey}
                    fill={s.color}
                    hide={!isVisible}
                    animationDuration={animationDuration}
                  />
                );
              }
              return (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={dataKey}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={s.strokeWidth ?? 2.25}
                  strokeDasharray={s.strokeDasharray}
                  dot={s.dot ?? false}
                  animationDuration={animationDuration}
                  hide={!isVisible}
                  isAnimationActive={true}
                />
              );
            })}
            {selection && (
              <ReferenceArea
                x1={selection.x1}
                x2={selection.x2}
                strokeOpacity={0.3}
                fill="#3b82f6"
                fillOpacity={0.1}
              />
            )}

            {subfigureLabel && (
                <text
                    x={margin.left + 5}
                    y={margin.top + 15}
                    style={{
                        fontSize: CHART_FONT_DEFAULTS.axisTitleSize,
                        fontWeight: 700,
                        fontFamily: CHART_FONT_DEFAULTS.axisTitleFamily,
                        fill: CHART_FONT_DEFAULTS.axisColor,
                    }}
                >
                    {subfigureLabel}
                </text>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* External Legend - outside SVG avoids interaction bugs and plot squishing */}
      <div className="py-4 px-2 border-t border-slate-50 dark:border-slate-800/20">
        <InlineLegend
          payload={legendPayload}
          onToggle={handleLegendClick}
          onIsolate={handleLegendDoubleClick}
        />
      </div>

      {allowScale && (
        <div className="flex items-center gap-2 px-4 pb-2 shrink-0 opacity-80 hover:opacity-100 transition-opacity">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mr-2">Scale</span>
          <button
            onClick={() => { setXAxisScale(s => s === 'linear' ? 'log' : 'linear'); setZoomHistory([]); }}
            className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${xAxisScale === 'log' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
          >
            X: {xAxisScale.toUpperCase()}
          </button>
          <button
            onClick={() => { setYAxisScale(s => s === 'linear' ? 'log' : 'linear'); setZoomHistory([]); }}
            className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${yAxisScale === 'log' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
          >
            Y: {yAxisScale.toUpperCase()}
          </button>
          <div className="ml-auto text-[10px] text-slate-400 font-medium italic hidden sm:block">
            Drag to zoom • Double-click to reset
          </div>
          {zoomHistory.length > 0 && (
            <button
              onClick={() => setZoomHistory([])}
              className="ml-2 px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 underline underline-offset-2"
            >
              Reset View
            </button>
          )}
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            <button
              onClick={exportChartSVG}
              className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Download Plot as SVG (300 DPI equivalent)"
            >
              SVG
            </button>
            <button
              onClick={exportChartRaster}
              className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Download Plot as PNG (300 DPI equivalent)"
            >
              PNG
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const CustomTooltip = ({ active, payload, label, xAxisLabel, xAxisScale, yAxisScale }: any) => {
  if (active && payload && payload.length) {
    const displayLabel = xAxisScale === 'log' ? Math.pow(10, Number(label)) : Number(label);
    
    return (
      <div className="bg-white/95 dark:bg-slate-900/95 p-3 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl backdrop-blur-sm min-w-[160px]">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-100 dark:border-slate-800 pb-1">
          {xAxisLabel}: {formatValue(displayLabel)}
        </div>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => {
            const displayValue = yAxisScale === 'log' ? Math.pow(10, Number(entry.value)) : Number(entry.value);
            return (
              <div key={`item-${index}`} className="flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{entry.name}</span>
                </div>
                <span className="font-mono text-slate-900 dark:text-slate-100">
                  {formatValue(displayValue)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};
