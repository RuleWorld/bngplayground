/**
 * Shared Recharts styling constants to ensure visual consistency
 * across all analysis tabs. Matches TimeSeriesChart.tsx defaults.
 */

export const CHART_GRID = {
  strokeDasharray: '2 4',
  vertical: false,
  stroke: '#cbd5e1',
  strokeOpacity: 0.45,
} as const;

export const CHART_AXIS_LINE = {
  stroke: '#94a3b8',
  strokeWidth: 1,
} as const;

export const CHART_TICK_LINE = {
  stroke: '#94a3b8',
} as const;

export const CHART_TICK = {
  fill: '#334155',
  fontSize: 12,
  fontWeight: 500,
} as const;

export const CHART_AXIS_LABEL_STYLE = {
  fill: '#0f172a',
  fontSize: 13,
  fontWeight: 700,
} as const;

export const CHART_TOOLTIP_CURSOR = {
  stroke: '#94a3b8',
  strokeWidth: 1,
  strokeDasharray: '5 5',
} as const;

export const CHART_LINE_WIDTH = 2.25;

export const CHART_MARGIN = {
  top: 10,
  right: 20,
  bottom: 30,
  left: 50,
} as const;
