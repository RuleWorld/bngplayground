import React, { useEffect, useMemo, useRef, useState } from 'react';

interface HeatmapDatum {
  x: number;
  y: number;
  value: number;
}

interface HeatmapChartProps {
  data: HeatmapDatum[];
  xAxisLabel: string;
  yAxisLabel: string;
  zAxisLabel?: string;
  width?: number;
  height?: number;
  cellSize?: number;
}

export const HeatmapChart: React.FC<HeatmapChartProps> = ({
  data,
  xAxisLabel,
  yAxisLabel,
  zAxisLabel,
  width = 480,
  height = 360,
  cellSize,
}) => {
  if (!data || data.length === 0) {
    return <div className="text-sm text-slate-500">No data to render</div>;
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  // If the caller didn't pass width/height, fill the container.
  // We treat the defaults as fallbacks only when a container isn't measurable.
  const wantsResponsiveSizing = width === 480 && height === 360;

  useEffect(() => {
    if (!wantsResponsiveSizing) return;
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const next = {
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      };
      setContainerSize((prev) => {
        if (prev && prev.width === next.width && prev.height === next.height) return prev;
        return next;
      });
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [wantsResponsiveSizing]);

  // Unique sorted x and y
  const xs = useMemo(() => Array.from(new Set(data.map((d) => d.x))).sort((a, b) => a - b), [data]);
  const ys = useMemo(() => Array.from(new Set(data.map((d) => d.y))).sort((a, b) => a - b), [data]);

  const cols = xs.length;
  const rows = ys.length;

  const computedWidth = wantsResponsiveSizing && containerSize?.width ? containerSize.width : width;
  const computedHeight = wantsResponsiveSizing && containerSize?.height ? containerSize.height : height;

  const leftMargin = 90;
  const topMargin = 20;
  const rightMargin = 20;
  const bottomMargin = 40;

  const availableWidth = Math.max(0, computedWidth - leftMargin - rightMargin);
  const availableHeight = Math.max(0, computedHeight - topMargin - bottomMargin);

  // Scale cells to *fill* the available area for small grids, but keep
  // practical bounds so big grids remain usable.
  const cell = cellSize ?? Math.max(10, Math.min(120, Math.floor(Math.min(
    availableWidth / Math.max(cols, 1),
    availableHeight / Math.max(rows, 1),
  ))));

  const plotWidth = cols * cell;
  const plotHeight = rows * cell;

  const svgWidth = leftMargin + plotWidth + rightMargin;
  const svgHeight = topMargin + plotHeight + bottomMargin;

  let min = Infinity;
  let max = -Infinity;
  data.forEach((d) => {
    if (d.value < min) min = d.value;
    if (d.value > max) max = d.value;
  });
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 0;
  }

  // Color interpolation: light-blue -> dark-blue for non-negative values; diverging with red for negative
  const colorFor = (v: number) => {
    if (min < 0 && max > 0) {
      // Diverging: negative -> blue, positive -> red, 0 -> white
      const pos = v > 0 ? (v / max) : 0;
      const neg = v < 0 ? (v / min) : 0;
      if (v >= 0) {
        const intensity = Math.min(1, pos);
        return `rgba(220, 38, 38, ${intensity})`; // red
      }
      const intensity = Math.min(1, Math.abs(neg));
      return `rgba(37, 99, 235, ${intensity})`; // blue
    }
    // Single sign values -> bluescale
    const denom = Math.max(Math.abs(max - min), Number.EPSILON);
    const ratio = (v - min) / denom;
    const alpha = 0.15 + 0.8 * Math.min(Math.max(ratio, 0), 1);
    return `rgba(37, 99, 235, ${alpha.toFixed(2)})`;
  };

  // Map x, y values to column/row indices
  const xIndex = useMemo(() => {
    const m = new Map<number, number>();
    xs.forEach((v, i) => m.set(v, i));
    return m;
  }, [xs]);
  const yIndex = useMemo(() => {
    const m = new Map<number, number>();
    ys.forEach((v, i) => m.set(v, i));
    return m;
  }, [ys]);

  type TooltipState = {
    x: number;
    y: number;
    value: number;
    left: number;
    top: number;
    pinned: boolean;
  } | null;

  const [tooltip, setTooltip] = useState<TooltipState>(null);

  const setHoverTooltip = (d: HeatmapDatum, clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    const left = Math.max(0, clientX - rect.left + scrollLeft + 12);
    const top = Math.max(0, clientY - rect.top + scrollTop + 12);

    setTooltip((prev) => {
      if (prev?.pinned) return prev;
      return { x: d.x, y: d.y, value: d.value, left, top, pinned: false };
    });
  };

  const togglePinTooltip = (d: HeatmapDatum, clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const left = Math.max(0, clientX - rect.left + scrollLeft + 12);
    const top = Math.max(0, clientY - rect.top + scrollTop + 12);

    setTooltip((prev) => {
      if (prev && prev.pinned && prev.x === d.x && prev.y === d.y) return null;
      return { x: d.x, y: d.y, value: d.value, left, top, pinned: true };
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-auto"
      onMouseLeave={() => {
        setTooltip((prev) => (prev?.pinned ? prev : null));
      }}
      onClick={(e) => {
        // Click empty space to clear a pinned tooltip
        if ((e.target as HTMLElement)?.tagName?.toLowerCase() !== 'rect') {
          setTooltip(null);
        }
      }}
    >
      <div className="w-fit mx-auto">
        <svg width={svgWidth} height={svgHeight}>
          <g transform={`translate(${leftMargin}, ${topMargin})`}>
          {data.map((d, i) => {
            const cx = xIndex.get(d.x) ?? -1;
            const cy = yIndex.get(d.y) ?? -1;
            if (cx < 0 || cy < 0) return null;
            return (
              <g key={`cell-${i}`}>
                <rect
                  x={cx * cell}
                  y={cy * cell}
                  width={cell}
                  height={cell}
                  fill={colorFor(d.value)}
                  stroke="#eee"
                  onMouseMove={(e) => setHoverTooltip(d, e.clientX, e.clientY)}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinTooltip(d, e.clientX, e.clientY);
                  }}
                />
                <title>{`${xAxisLabel}: ${d.x}, ${yAxisLabel}: ${d.y}, ${zAxisLabel ?? 'value'}: ${d.value}`}</title>
              </g>
            );
          })}

          {/* x ticks */}
          {xs.map((xVal, j) => (
            <text key={`x-tick-${j}`} x={j * cell + cell / 2} y={-6} fontSize={10} textAnchor="middle">
              {xVal}
            </text>
          ))}

          {/* y ticks */}
          {ys.map((yVal, i) => (
            <text key={`y-tick-${i}`} x={-8} y={i * cell + cell / 2} fontSize={10} textAnchor="end" dominantBaseline="middle">
              {yVal}
            </text>
          ))}

          {/* Axis labels */}
          <text x={plotWidth / 2} y={plotHeight + 30} fontSize={12} textAnchor="middle">
            {xAxisLabel}
          </text>
          <text x={-60} y={plotHeight / 2} fontSize={12} textAnchor="middle" transform={`rotate(-90 -60 ${plotHeight / 2})`}>
            {yAxisLabel}
          </text>

          </g>
        </svg>
      </div>

      {tooltip && (
        <div
          className="absolute z-10 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 shadow-sm"
          style={{ left: tooltip.left, top: tooltip.top, maxWidth: 320 }}
        >
          <div className="font-semibold text-slate-900 dark:text-slate-100">
            {zAxisLabel ?? 'Value'}: {Number.isFinite(tooltip.value) ? tooltip.value : String(tooltip.value)}
          </div>
          <div className="mt-1 text-slate-600 dark:text-slate-300">
            {xAxisLabel}: {tooltip.x}
          </div>
          <div className="text-slate-600 dark:text-slate-300">
            {yAxisLabel}: {tooltip.y}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {tooltip.pinned ? 'Pinned (click cell to unpin, click empty area to clear)' : 'Click cell to pin'}
          </div>
        </div>
      )}
    </div>
  );
};

export default HeatmapChart;
