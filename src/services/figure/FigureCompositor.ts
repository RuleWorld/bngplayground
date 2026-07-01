// ---------------------------------------------------------------------------
// FigureCompositor.ts -- Compose multi-panel publication-quality SVG figures
// ---------------------------------------------------------------------------

import { OKABE_ITO } from '../../utils/chartColors';

export interface FigurePanel {
  id: string;
  label: string;         // (A), (B), (C)
  svgContent: string;
  width: number;          // mm
  height: number;         // mm
  caption?: string;
}

export interface FigureConfig {
  panels: FigurePanel[];
  layout: 'horizontal' | 'vertical' | 'grid';
  gridCols?: number;
  totalWidth?: number;    // mm, default: 178 (double column)
  figureNumber?: number;
  caption?: string;
  preset?: 'plos' | 'nature' | 'cell' | 'default';
}

export interface PanelLayout {
  x: number;    // px
  y: number;    // px
  w: number;    // px
  h: number;    // px
  panel: FigurePanel;
}

export interface FigureStyle {
  fontFamily: string;
  axisLabelSize: number;    // pt
  tickLabelSize: number;    // pt
  panelLabelSize: number;   // pt
  captionSize: number;      // pt
  dataLineWidth: number;    // px
  axisLineWidth: number;    // px
  palette: string[];
  backgroundColor: string;
  dpi: number;
  panelLabelBold: boolean;
  panelLabelPosition: 'top-left' | 'above';
  panelGap: number;         // mm
}

// ---------------------------------------------------------------------------
// Journal presets
// ---------------------------------------------------------------------------

export const FIGURE_PRESETS: Record<string, FigureStyle> = {
  plos: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    axisLabelSize: 10,
    tickLabelSize: 8,
    panelLabelSize: 14,
    captionSize: 9,
    dataLineWidth: 1.5,
    axisLineWidth: 0.75,
    palette: OKABE_ITO,
    backgroundColor: '#ffffff',
    dpi: 300,
    panelLabelBold: true,
    panelLabelPosition: 'top-left',
    panelGap: 5,
  },
  nature: {
    fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
    axisLabelSize: 7,
    tickLabelSize: 6,
    panelLabelSize: 8,
    captionSize: 7,
    dataLineWidth: 1.0,
    axisLineWidth: 0.5,
    palette: [
      '#E64B35', '#4DBBD5', '#00A087', '#3C5488',
      '#F39B7F', '#8491B4', '#91D1C2', '#DC0000',
    ],
    backgroundColor: '#ffffff',
    dpi: 300,
    panelLabelBold: true,
    panelLabelPosition: 'top-left',
    panelGap: 3,
  },
  cell: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    axisLabelSize: 8,
    tickLabelSize: 7,
    panelLabelSize: 10,
    captionSize: 8,
    dataLineWidth: 1.25,
    axisLineWidth: 0.5,
    palette: [
      '#3B4992', '#EE0000', '#008B45', '#631879',
      '#008280', '#BB0021', '#5F559B', '#A20056',
    ],
    backgroundColor: '#ffffff',
    dpi: 300,
    panelLabelBold: true,
    panelLabelPosition: 'top-left',
    panelGap: 4,
  },
  default: {
    fontFamily: 'Arial, sans-serif',
    axisLabelSize: 12,
    tickLabelSize: 10,
    panelLabelSize: 16,
    captionSize: 10,
    dataLineWidth: 2.0,
    axisLineWidth: 1.0,
    palette: OKABE_ITO,
    backgroundColor: '#ffffff',
    dpi: 300,
    panelLabelBold: true,
    panelLabelPosition: 'top-left',
    panelGap: 5,
  },
};

// ---------------------------------------------------------------------------
// Conversion constants
// ---------------------------------------------------------------------------

/** 1 mm = 3.7795275591 px at 96 dpi */
const MM_TO_PX = 3.7795275591;

/** Convert pt to px (1 pt = 1.333... px at 96 dpi) */
function ptToPx(pt: number): number {
  return pt * (96 / 72);
}

// ---------------------------------------------------------------------------
// SVG parsing helpers
// ---------------------------------------------------------------------------

interface ParsedSVG {
  viewBoxX: number;
  viewBoxY: number;
  viewBoxW: number;
  viewBoxH: number;
  innerContent: string;
}

/**
 * Parse an SVG string to extract viewBox dimensions and inner content.
 */
function parseSVG(svgStr: string): ParsedSVG {
  // Extract viewBox
  const vbMatch = svgStr.match(/viewBox\s*=\s*"([^"]+)"/);
  let vbX = 0, vbY = 0, vbW = 300, vbH = 200;
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4) {
      [vbX, vbY, vbW, vbH] = parts;
    }
  } else {
    // Try to get width/height attributes
    const wMatch = svgStr.match(/\bwidth\s*=\s*"(\d+(?:\.\d+)?)"/);
    const hMatch = svgStr.match(/\bheight\s*=\s*"(\d+(?:\.\d+)?)"/);
    if (wMatch) vbW = parseFloat(wMatch[1]);
    if (hMatch) vbH = parseFloat(hMatch[1]);
  }

  // Extract inner content (everything between <svg ...> and </svg>)
  const openTagEnd = svgStr.indexOf('>');
  const closeTagStart = svgStr.lastIndexOf('</svg>');
  let inner = '';
  if (openTagEnd !== -1 && closeTagStart !== -1 && closeTagStart > openTagEnd) {
    inner = svgStr.substring(openTagEnd + 1, closeTagStart);
  }

  return { viewBoxX: vbX, viewBoxY: vbY, viewBoxW: vbW, viewBoxH: vbH, innerContent: inner };
}

// ---------------------------------------------------------------------------
// Style application
// ---------------------------------------------------------------------------

/**
 * Apply publication style overrides to an SVG string.
 *
 * Replaces font-family, scales font-size values, overrides stroke-widths for
 * data lines, and removes Recharts tooltip/cursor elements.
 */
export function applyPublicationStyle(svgString: string, style: FigureStyle): string {
  let svg = svgString;

  // Remove Recharts tooltip and cursor elements
  svg = svg.replace(/<g\s+class="recharts-tooltip-wrapper"[^]*?<\/g>/gi, '');
  svg = svg.replace(/<g\s+class="recharts-cursor"[^]*?<\/g>/gi, '');
  svg = svg.replace(/<rect[^>]*class="recharts-tooltip[^"]*"[^>]*\/?>(<\/rect>)?/gi, '');
  svg = svg.replace(/<line[^>]*class="recharts-cursor[^"]*"[^>]*\/?>(<\/line>)?/gi, '');

  // Replace all font-family attributes
  svg = svg.replace(/font-family\s*=\s*"[^"]*"/g, `font-family="${style.fontFamily}"`);
  // Also in inline styles
  svg = svg.replace(/font-family\s*:\s*[^;"]+/g, `font-family: ${style.fontFamily}`);

  // Scale font-size attributes -- replace with axis label size as a reasonable default
  svg = svg.replace(/font-size\s*=\s*"(\d+(?:\.\d+)?)(?:px)?"/g, (_match, size) => {
    const original = parseFloat(size);
    // Heuristic: small sizes -> tick labels, medium -> axis labels, large -> titles
    let newSize: number;
    if (original <= 10) {
      newSize = ptToPx(style.tickLabelSize);
    } else if (original <= 14) {
      newSize = ptToPx(style.axisLabelSize);
    } else {
      newSize = ptToPx(style.panelLabelSize);
    }
    return `font-size="${newSize.toFixed(2)}px"`;
  });

  // Scale font-size in inline styles
  svg = svg.replace(/font-size\s*:\s*(\d+(?:\.\d+)?)(?:px)?/g, (_match, size) => {
    const original = parseFloat(size);
    let newSize: number;
    if (original <= 10) {
      newSize = ptToPx(style.tickLabelSize);
    } else if (original <= 14) {
      newSize = ptToPx(style.axisLabelSize);
    } else {
      newSize = ptToPx(style.panelLabelSize);
    }
    return `font-size: ${newSize.toFixed(2)}px`;
  });

  // Override stroke-width on path/line elements that look like data lines
  // (thick strokes, not axis lines)
  svg = svg.replace(
    /(<(?:path|line|polyline|circle)[^>]*?)stroke-width\s*=\s*"(\d+(?:\.\d+)?)"/g,
    (_match, prefix: string, widthStr: string) => {
      const w = parseFloat(widthStr);
      // Thin strokes (<=1) are likely axes/grid; thicker are data
      const newW = w > 1 ? style.dataLineWidth : style.axisLineWidth;
      return `${prefix}stroke-width="${newW}"`;
    },
  );

  return svg;
}

// ---------------------------------------------------------------------------
// Extract SVG from Recharts container
// ---------------------------------------------------------------------------

/**
 * Extract SVG from a Recharts container DOM element, clone it, serialise, and
 * apply publication style.
 */
export function extractRechartsSVG(
  containerRef: { current: HTMLElement | null },
  style?: FigureStyle,
): string {
  const container = containerRef.current;
  if (!container) {
    throw new Error('Container ref is null');
  }

  const svgEl = container.querySelector('svg');
  if (!svgEl) {
    throw new Error('No SVG element found inside container');
  }

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(clone);

  if (style) {
    svgString = applyPublicationStyle(svgString, style);
  }

  return svgString;
}

// ---------------------------------------------------------------------------
// Extract SVG from Cytoscape
// ---------------------------------------------------------------------------

/**
 * Extract SVG from a Cytoscape.js instance using cy.svg().
 */
export function extractCytoscapeSVG(cyInstance: { svg: (opts?: object) => string }): string {
  return cyInstance.svg({ full: true });
}

// ---------------------------------------------------------------------------
// composeFigure -- main entry point
// ---------------------------------------------------------------------------

/**
 * Compose multiple figure panels into a single publication-ready SVG.
 */
export function composeFigure(config: FigureConfig): string {
  const presetName = config.preset ?? 'default';
  const style = FIGURE_PRESETS[presetName] ?? FIGURE_PRESETS['default'];
  const totalWidthMm = config.totalWidth ?? 178;
  const totalWidthPx = totalWidthMm * MM_TO_PX;
  const gapPx = style.panelGap * MM_TO_PX;
  const panels = config.panels;
  const n = panels.length;

  if (n === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"></svg>';
  }

  // -----------------------------------------------------------------------
  // Calculate per-panel target dimensions and positions
  // -----------------------------------------------------------------------

  const layouts: PanelLayout[] = [];

  calculateLayouts(layouts, config, n, totalWidthPx, gapPx, panels);

  const { figW, figH, maxY } = computeDimensions(layouts, config, totalWidthPx, gapPx, style);

  // -----------------------------------------------------------------------
  // Build SVG
  // -----------------------------------------------------------------------

  const svgParts: string[] = [];
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${figW.toFixed(2)} ${figH.toFixed(2)}" ` +
    `width="${(figW / MM_TO_PX).toFixed(2)}mm" ` +
    `height="${(figH / MM_TO_PX).toFixed(2)}mm">`,
  );

  // Background
  svgParts.push(
    `<rect x="0" y="0" width="${figW.toFixed(2)}" height="${figH.toFixed(2)}" ` +
    `fill="${style.backgroundColor}" />`,
  );

  renderPanels(svgParts, layouts, style);

  renderCaption(svgParts, config, maxY, gapPx, style);

  svgParts.push('</svg>');
  return svgParts.join('\n');
}

function calculateLayouts(layouts: PanelLayout[], config: FigureConfig, n: number, totalWidthPx: number, gapPx: number, panels: FigurePanel[]) {
  if (config.layout === 'horizontal') {
    const availableW = totalWidthPx - (n - 1) * gapPx;
    const panelW = availableW / n;

    for (let i = 0; i < n; i++) {
      const p = panels[i];
      const aspect = p.height / p.width;
      const panelH = panelW * aspect;
      layouts.push({ x: i * (panelW + gapPx), y: 0, w: panelW, h: panelH, panel: p });
    }
  } else if (config.layout === 'vertical') {
    let yOffset = 0;
    for (let i = 0; i < n; i++) {
      const p = panels[i];
      const panelW = totalWidthPx;
      const aspect = p.height / p.width;
      const panelH = panelW * aspect;
      layouts.push({ x: 0, y: yOffset, w: panelW, h: panelH, panel: p });
      yOffset += panelH + gapPx;
    }
  } else {
    const cols = config.gridCols ?? 2;
    const availableW = totalWidthPx - (cols - 1) * gapPx;
    const cellW = availableW / cols;

    let maxAspect = 0;
    for (const p of panels) {
      const a = p.height / p.width;
      if (a > maxAspect) maxAspect = a;
    }
    const cellH = cellW * (maxAspect || 1);

    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      layouts.push({ x: col * (cellW + gapPx), y: row * (cellH + gapPx), w: cellW, h: cellH, panel: panels[i] });
    }
  }
}

function computeDimensions(layouts: PanelLayout[], config: FigureConfig, totalWidthPx: number, gapPx: number, style: FigureStyle) {
  let maxX = 0;
  let maxY = 0;
  for (const l of layouts) {
    const right = l.x + l.w;
    const bottom = l.y + l.h;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }

  const captionLineH = ptToPx(style.captionSize) * 1.4;
  const captionLines = config.caption ? Math.ceil(config.caption.length / 80) : 0;
  const captionBlockH = captionLines > 0 ? captionLines * captionLineH + gapPx : 0;

  const figW = Math.max(maxX, totalWidthPx);
  const figH = maxY + captionBlockH;

  return { figW, figH, maxY };
}

function renderPanels(svgParts: string[], layouts: PanelLayout[], style: FigureStyle) {
  for (const layout of layouts) {
    const { panel } = layout;
    const parsed = parseSVG(panel.svgContent);

    const styledContent = applyPublicationStyle(parsed.innerContent, style);

    const labelFontPx = ptToPx(style.panelLabelSize);
    const labelYOffset = style.panelLabelPosition === 'above' ? -labelFontPx * 0.4 : labelFontPx;
    const labelXOffset = style.panelLabelPosition === 'above' ? 0 : labelFontPx * 0.3;
    const panelContentY = style.panelLabelPosition === 'above' ? labelFontPx * 1.2 : 0;

    svgParts.push(`<g transform="translate(${layout.x.toFixed(2)}, ${layout.y.toFixed(2)})">`);

    svgParts.push(
      `<svg x="0" y="${panelContentY.toFixed(2)}" ` +
      `width="${layout.w.toFixed(2)}" height="${(layout.h - panelContentY).toFixed(2)}" ` +
      `viewBox="${parsed.viewBoxX} ${parsed.viewBoxY} ${parsed.viewBoxW} ${parsed.viewBoxH}" ` +
      `preserveAspectRatio="xMidYMid meet">`,
    );
    svgParts.push(styledContent);
    svgParts.push('</svg>');

    svgParts.push(
      `<text x="${labelXOffset.toFixed(2)}" y="${labelYOffset.toFixed(2)}" ` +
      `font-family="${style.fontFamily}" ` +
      `font-size="${labelFontPx.toFixed(2)}px" ` +
      `font-weight="${style.panelLabelBold ? 'bold' : 'normal'}" ` +
      `fill="#000000">` +
      escapeXml(panel.label) +
      `</text>`,
    );

    svgParts.push('</g>');
  }
}

function renderCaption(svgParts: string[], config: FigureConfig, maxY: number, gapPx: number, style: FigureStyle) {
  if (!config.caption) return;

  const captionFontPx = ptToPx(style.captionSize);
  const captionY = maxY + gapPx + captionFontPx;
  const prefix = config.figureNumber != null ? `Figure ${config.figureNumber}. ` : '';
  svgParts.push(
    `<text x="0" y="${captionY.toFixed(2)}" ` +
    `font-family="${style.fontFamily}" ` +
    `font-size="${captionFontPx.toFixed(2)}px" ` +
    `fill="#000000">`,
  );

  if (prefix) {
    svgParts.push(
      `<tspan font-weight="bold">${escapeXml(prefix)}</tspan>`,
    );
  }

  const words = config.caption.split(/\s+/);
  let line = '';
  let lineIndex = 0;
  for (const word of words) {
    if (line.length + word.length + 1 > 80 && line.length > 0) {
      if (lineIndex === 0 && prefix) {
        svgParts.push(`<tspan>${escapeXml(line)}</tspan>`);
      } else {
        svgParts.push(
          `<tspan x="0" dy="${(captionFontPx * 1.4).toFixed(2)}">${escapeXml(line)}</tspan>`,
        );
      }
      line = word;
      lineIndex++;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) {
    if (lineIndex === 0 && prefix) {
      svgParts.push(`<tspan>${escapeXml(line)}</tspan>`);
    } else {
      svgParts.push(
        `<tspan x="0" dy="${(captionFontPx * 1.4).toFixed(2)}">${escapeXml(line)}</tspan>`,
      );
    }
  }
  svgParts.push('</text>');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
