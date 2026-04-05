import { describe, it, expect } from 'vitest';
import {
  composeFigure,
  applyPublicationStyle,
  FIGURE_PRESETS,
  type FigurePanel,
  type FigureConfig,
} from '../../src/services/figure/FigureCompositor';
import {
  generateLatexSnippet,
  encodeTIFF,
} from '../../src/services/figure/FigureExporter';

// ---------------------------------------------------------------------------
// Helper: create a simple valid SVG panel
// ---------------------------------------------------------------------------

function makePanelSVG(w = 300, h = 200): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#eee" />` +
    `<text x="10" y="20" font-family="sans-serif" font-size="12">Test</text>` +
    `<path d="M10 100 L290 50" stroke="#E69F00" stroke-width="2" fill="none" />` +
    `</svg>`
  );
}

function makePanel(id: string, label: string, w = 80, h = 60): FigurePanel {
  return {
    id,
    label,
    svgContent: makePanelSVG(),
    width: w,
    height: h,
  };
}

// ---------------------------------------------------------------------------
// composeFigure tests
// ---------------------------------------------------------------------------

describe('composeFigure', () => {
  it('single panel produces valid SVG with viewBox', () => {
    const config: FigureConfig = {
      panels: [makePanel('p1', '(A)')],
      layout: 'horizontal',
    };
    const svg = composeFigure(config);

    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
    expect(svg).toContain('</svg>');
    // Panel label should be present
    expect(svg).toContain('(A)');
  });

  it('3 panels horizontal layout has correct total width', () => {
    const totalWidth = 178; // mm
    const config: FigureConfig = {
      panels: [
        makePanel('p1', '(A)'),
        makePanel('p2', '(B)'),
        makePanel('p3', '(C)'),
      ],
      layout: 'horizontal',
      totalWidth,
    };
    const svg = composeFigure(config);

    // The outer SVG should declare width in mm
    expect(svg).toMatch(new RegExp(`width="${totalWidth}\\.00mm"`));
    // All three labels should appear
    expect(svg).toContain('(A)');
    expect(svg).toContain('(B)');
    expect(svg).toContain('(C)');
  });

  it('grid layout 2x2 positions 4 panels', () => {
    const config: FigureConfig = {
      panels: [
        makePanel('p1', '(A)'),
        makePanel('p2', '(B)'),
        makePanel('p3', '(C)'),
        makePanel('p4', '(D)'),
      ],
      layout: 'grid',
      gridCols: 2,
    };
    const svg = composeFigure(config);

    // Should have 4 translated groups
    const translateMatches = svg.match(/transform="translate\(/g);
    expect(translateMatches).not.toBeNull();
    expect(translateMatches!.length).toBe(4);

    // All labels present
    expect(svg).toContain('(A)');
    expect(svg).toContain('(B)');
    expect(svg).toContain('(C)');
    expect(svg).toContain('(D)');
  });

  it('vertical layout stacks panels', () => {
    const config: FigureConfig = {
      panels: [makePanel('p1', '(A)'), makePanel('p2', '(B)')],
      layout: 'vertical',
    };
    const svg = composeFigure(config);

    // Both panels should exist
    expect(svg).toContain('(A)');
    expect(svg).toContain('(B)');

    // The second panel should be translated in y
    const translates = [...svg.matchAll(/translate\(([\d.]+),\s*([\d.]+)\)/g)];
    expect(translates.length).toBe(2);
    // First at y=0, second at y>0
    expect(parseFloat(translates[0][2])).toBe(0);
    expect(parseFloat(translates[1][2])).toBeGreaterThan(0);
  });

  it('includes figure caption when provided', () => {
    const config: FigureConfig = {
      panels: [makePanel('p1', '(A)')],
      layout: 'horizontal',
      caption: 'Time series of species concentrations.',
      figureNumber: 1,
    };
    const svg = composeFigure(config);

    expect(svg).toContain('Figure 1.');
    expect(svg).toContain('Time series of species concentrations.');
  });

  it('empty panels array produces minimal SVG', () => {
    const config: FigureConfig = { panels: [], layout: 'horizontal' };
    const svg = composeFigure(config);
    expect(svg).toContain('viewBox="0 0 0 0"');
  });
});

// ---------------------------------------------------------------------------
// FIGURE_PRESETS tests
// ---------------------------------------------------------------------------

describe('FIGURE_PRESETS', () => {
  it('PLOS preset has correct font sizes', () => {
    const plos = FIGURE_PRESETS['plos'];
    expect(plos).toBeDefined();
    expect(plos.fontFamily).toContain('Arial');
    expect(plos.axisLabelSize).toBe(10);
    expect(plos.tickLabelSize).toBe(8);
    expect(plos.panelLabelSize).toBe(14);
    expect(plos.dpi).toBe(300);
  });

  it('Nature preset has smaller font sizes than PLOS', () => {
    const nature = FIGURE_PRESETS['nature'];
    const plos = FIGURE_PRESETS['plos'];
    expect(nature.axisLabelSize).toBeLessThan(plos.axisLabelSize);
    expect(nature.tickLabelSize).toBeLessThan(plos.tickLabelSize);
  });

  it('Cell preset uses Cell-specific palette', () => {
    const cell = FIGURE_PRESETS['cell'];
    expect(cell.palette[0]).toBe('#3B4992');
    expect(cell.palette.length).toBe(8);
  });

  it('default preset exists and has standard values', () => {
    const def = FIGURE_PRESETS['default'];
    expect(def).toBeDefined();
    expect(def.axisLabelSize).toBe(12);
    expect(def.dataLineWidth).toBe(2.0);
  });

  it('all presets have 8 palette colors', () => {
    for (const [_name, style] of Object.entries(FIGURE_PRESETS)) {
      expect(style.palette.length).toBe(8);
    }
  });
});

// ---------------------------------------------------------------------------
// applyPublicationStyle tests
// ---------------------------------------------------------------------------

describe('applyPublicationStyle', () => {
  it('overrides font-family in SVG', () => {
    const svg =
      '<svg><text font-family="Times New Roman" font-size="12">Hello</text></svg>';
    const result = applyPublicationStyle(svg, FIGURE_PRESETS['nature']);
    expect(result).toContain('font-family="Helvetica Neue, Helvetica, Arial, sans-serif"');
    expect(result).not.toContain('Times New Roman');
  });

  it('overrides font-family in inline styles', () => {
    const svg =
      '<svg><text style="font-family: Courier; font-size: 12px">Hello</text></svg>';
    const result = applyPublicationStyle(svg, FIGURE_PRESETS['plos']);
    expect(result).toContain('font-family: Arial, Helvetica, sans-serif');
    expect(result).not.toContain('Courier');
  });

  it('scales font-size attributes', () => {
    const svg = '<svg><text font-size="12">Label</text></svg>';
    const result = applyPublicationStyle(svg, FIGURE_PRESETS['nature']);
    // Nature axis label = 7pt -> 7 * 96/72 = 9.33px
    expect(result).toMatch(/font-size="9\.3[0-9]+px"/);
  });

  it('overrides stroke-width for data lines', () => {
    const svg = '<svg><path stroke-width="3" d="M0 0 L100 100" /></svg>';
    const result = applyPublicationStyle(svg, FIGURE_PRESETS['nature']);
    // Nature data line width = 1.0
    expect(result).toContain('stroke-width="1"');
  });

  it('preserves thin stroke-width for axis lines', () => {
    const svg = '<svg><line stroke-width="0.5" x1="0" y1="0" x2="100" y2="0" /></svg>';
    const result = applyPublicationStyle(svg, FIGURE_PRESETS['nature']);
    // Thin lines treated as axis lines -> 0.5
    expect(result).toContain('stroke-width="0.5"');
  });

  it('removes Recharts tooltip wrapper elements', () => {
    const svg =
      '<svg><g class="recharts-tooltip-wrapper"><rect /></g><circle r="5" /></svg>';
    const result = applyPublicationStyle(svg, FIGURE_PRESETS['default']);
    expect(result).not.toContain('recharts-tooltip-wrapper');
    expect(result).toContain('circle');
  });
});

// ---------------------------------------------------------------------------
// Panel labels tests
// ---------------------------------------------------------------------------

describe('panel labels', () => {
  it('panel labels (A), (B), (C) are positioned in correct order', () => {
    const config: FigureConfig = {
      panels: [
        makePanel('p1', '(A)'),
        makePanel('p2', '(B)'),
        makePanel('p3', '(C)'),
      ],
      layout: 'horizontal',
    };
    const svg = composeFigure(config);

    const labelPattern = />\(([A-C])\)</g;
    const labels: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = labelPattern.exec(svg)) !== null) {
      labels.push(m[1]);
    }
    expect(labels).toEqual(['A', 'B', 'C']);
  });

  it('panel labels are bold when configured', () => {
    const config: FigureConfig = {
      panels: [makePanel('p1', '(A)')],
      layout: 'horizontal',
      preset: 'plos',
    };
    const svg = composeFigure(config);
    expect(svg).toContain('font-weight="bold"');
  });

  it('panel labels use preset font size', () => {
    const config: FigureConfig = {
      panels: [makePanel('p1', '(A)')],
      layout: 'horizontal',
      preset: 'nature',
    };
    const svg = composeFigure(config);
    // Nature panelLabelSize = 8pt -> 8 * 96/72 = 10.666... px
    expect(svg).toMatch(/font-size="10\.6[0-9]+px"/);
  });
});

// ---------------------------------------------------------------------------
// generateLatexSnippet tests
// ---------------------------------------------------------------------------

describe('generateLatexSnippet', () => {
  it('produces valid LaTeX figure environment', () => {
    const latex = generateLatexSnippet(
      'figure1.pdf',
      'Time series of species A and B.',
      'timeseries',
    );
    expect(latex).toContain('\\begin{figure}[ht]');
    expect(latex).toContain('\\centering');
    expect(latex).toContain('\\includegraphics[width=\\textwidth]{figure1.pdf}');
    expect(latex).toContain('\\caption{Time series of species A and B.}');
    expect(latex).toContain('\\label{fig:timeseries}');
    expect(latex).toContain('\\end{figure}');
  });

  it('supports custom width', () => {
    const latex = generateLatexSnippet('fig.eps', 'Caption', 'lbl', '0.8\\textwidth');
    expect(latex).toContain('width=0.8\\textwidth');
  });

  it('uses \\textwidth as default width', () => {
    const latex = generateLatexSnippet('fig.pdf', 'Caption', 'lbl');
    expect(latex).toContain('width=\\textwidth');
  });
});

// ---------------------------------------------------------------------------
// TIFF encoding tests
// ---------------------------------------------------------------------------

describe('encodeTIFF', () => {
  it('produces valid TIFF header bytes', () => {
    // Create a tiny 2x2 image
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,   // red
      0, 255, 0, 255,   // green
      0, 0, 255, 255,   // blue
      255, 255, 0, 255, // yellow
    ]);
    const tiff = encodeTIFF(rgba, 2, 2, 300);

    expect(tiff).toBeInstanceOf(Uint8Array);
    // TIFF little-endian header: 'II' + 42
    expect(tiff[0]).toBe(0x49); // 'I'
    expect(tiff[1]).toBe(0x49); // 'I'

    // Magic number 42 at bytes 2-3 (little-endian)
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    expect(view.getUint16(2, true)).toBe(42);
  });

  it('has correct IFD offset in header', () => {
    const rgba = new Uint8ClampedArray(4 * 4); // 1x1
    rgba.set([128, 64, 32, 255]);
    const tiff = encodeTIFF(rgba, 1, 1, 72);
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);

    // IFD offset at bytes 4-7
    const ifdOffset = view.getUint32(4, true);
    expect(ifdOffset).toBe(8); // IFD starts right after header
  });

  it('stores correct image dimensions in IFD tags', () => {
    const w = 4, h = 3;
    const rgba = new Uint8ClampedArray(w * h * 4);
    const tiff = encodeTIFF(rgba, w, h, 300);
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);

    // IFD starts at offset 8, first 2 bytes are tag count
    const numTags = view.getUint16(8, true);
    expect(numTags).toBe(12);

    // First tag at offset 10: tag 256 (ImageWidth)
    expect(view.getUint16(10, true)).toBe(256); // tag
    expect(view.getUint16(12, true)).toBe(3);   // SHORT type
    expect(view.getUint16(18, true)).toBe(w);   // value

    // Second tag at offset 22: tag 257 (ImageLength)
    expect(view.getUint16(22, true)).toBe(257);
    expect(view.getUint16(30, true)).toBe(h);
  });

  it('contains RGB pixel data', () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,   // red
      0, 255, 0, 255,   // green
    ]);
    const tiff = encodeTIFF(rgba, 2, 1, 300);

    // Find the strip data -- it should contain RGB bytes at the end
    const len = tiff.length;
    // Last 6 bytes should be the RGB data for 2 pixels
    expect(tiff[len - 6]).toBe(255); // R of pixel 0
    expect(tiff[len - 5]).toBe(0);   // G of pixel 0
    expect(tiff[len - 4]).toBe(0);   // B of pixel 0
    expect(tiff[len - 3]).toBe(0);   // R of pixel 1
    expect(tiff[len - 2]).toBe(255); // G of pixel 1
    expect(tiff[len - 1]).toBe(0);   // B of pixel 1
  });

  it('stores DPI in resolution tags', () => {
    const rgba = new Uint8ClampedArray(4);
    rgba.set([0, 0, 0, 255]);
    const tiff = encodeTIFF(rgba, 1, 1, 600);
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);

    // Find XResolution tag (282). We know tags are at offset 10 and each is 12 bytes.
    // Tag 282 is the 10th tag (index 9, at offset 10 + 9*12 = 118)
    const tag9Offset = 10 + 9 * 12;
    expect(view.getUint16(tag9Offset, true)).toBe(282); // XResolution tag

    // The value field points to a RATIONAL in the data area
    const rationalOffset = view.getUint32(tag9Offset + 8, true);
    const numerator = view.getUint32(rationalOffset, true);
    const denominator = view.getUint32(rationalOffset + 4, true);
    expect(numerator / denominator).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// Composition with presets
// ---------------------------------------------------------------------------

describe('composeFigure with presets', () => {
  it('applies PLOS preset styling', () => {
    const config: FigureConfig = {
      panels: [makePanel('p1', '(A)')],
      layout: 'horizontal',
      preset: 'plos',
    };
    const svg = composeFigure(config);
    expect(svg).toContain('Arial, Helvetica, sans-serif');
  });

  it('applies Nature preset styling', () => {
    const config: FigureConfig = {
      panels: [makePanel('p1', '(A)')],
      layout: 'horizontal',
      preset: 'nature',
    };
    const svg = composeFigure(config);
    expect(svg).toContain('Helvetica Neue, Helvetica, Arial, sans-serif');
  });

  it('falls back to default preset for unknown names', () => {
    const config: FigureConfig = {
      panels: [makePanel('p1', '(A)')],
      layout: 'horizontal',
      preset: 'unknown_journal' as any,
    };
    const svg = composeFigure(config);
    expect(svg).toContain('Arial, sans-serif');
  });
});
