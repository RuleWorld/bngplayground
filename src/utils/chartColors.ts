export const OKABE_ITO = [
  '#E69F00', '#56B4E9', '#009E73', '#F0E442',
  '#0072B2', '#D55E00', '#CC79A7', '#000000',
];

export const CHART_COLORS = [
  ...OKABE_ITO,
  '#7F7F7F',
  '#BCBD22',
];

export const DEFAULT_PALETTE = OKABE_ITO;

export const CHART_FONT_DEFAULTS = {
    // Axis titles (e.g., "Time (s)", "Concentration (μM)")
    axisTitleSize: 11,        // pt — legible at single-column width
    axisTitleWeight: 600,
    axisTitleFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",

    // Tick labels (e.g., "0", "100", "200")
    tickLabelSize: 9,         // pt — legible at single-column width
    tickLabelWeight: 400,
    tickLabelFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",

    // Legend labels
    legendSize: 9,
    legendWeight: 400,

    // Chart title (if used)
    titleSize: 12,
    titleWeight: 700,

    // Colors
    axisColor: '#1a1a1a',     // Near-black for print
    tickColor: '#333333',
    gridColor: '#cbd5e1',     // Subtle when enabled
};
