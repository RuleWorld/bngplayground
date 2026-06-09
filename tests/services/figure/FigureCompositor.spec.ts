import { describe, it, expect } from 'vitest';
import { vi } from "vitest";
import {
  composeFigure,
  applyPublicationStyle,
  extractRechartsSVG,
  extractCytoscapeSVG
} from '../../../src/services/figure/FigureCompositor';

describe('FigureCompositor', () => {
  const mockPanel1 = {
    id: 'p1',
    label: 'A',
    svgContent: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>',
    width: 50,
    height: 50
  };

  const mockPanel2 = {
    id: 'p2',
    label: 'B',
    svgContent: '<svg viewBox="0 0 100 100"><rect width="100" height="100" /></svg>',
    width: 50,
    height: 50
  };

  const mockPanel3 = {
    id: 'p3',
    label: 'C',
    svgContent: '<svg viewBox="0 0 100 100"><path d="M0,0 L100,100" /></svg>',
    width: 50,
    height: 50
  };

  describe('composeFigure layouts', () => {
    it('composes a horizontal layout', () => {
      const svg = composeFigure({
        panels: [mockPanel1, mockPanel2],
        layout: 'horizontal',
        totalWidth: 100,
      });
      expect(svg).toContain('>A</text>');
      expect(svg).toContain('>B</text>');
      expect(svg).toContain('<circle');
      expect(svg).toContain('<rect');
    });

    it('composes a vertical layout', () => {
      const svg = composeFigure({
        panels: [mockPanel1, mockPanel2],
        layout: 'vertical',
        totalWidth: 100,
      });
      expect(svg).toContain('>A</text>');
      expect(svg).toContain('>B</text>');
      expect(svg).toMatch(/<g transform="translate\(0\.00, 0\.00\)">/);
      expect(svg).toMatch(/<g transform="translate\(0\.00, \d+\.\d+\)">/);
    });

    it('composes a grid layout', () => {
      const svg = composeFigure({
        panels: [mockPanel1, mockPanel2, mockPanel3],
        layout: 'grid',
        gridCols: 2,
        totalWidth: 100,
      });
      expect(svg).toContain('>A</text>');
      expect(svg).toContain('>B</text>');
      expect(svg).toContain('>C</text>');
      expect(svg).toMatch(/<g transform="translate\(0\.00, \d+\.\d+\)">[\s\S]*>C<\/text>/);
    });
  });

  describe('composeFigure caption', () => {
    it('wraps and includes caption text', () => {
      const svg = composeFigure({
        panels: [mockPanel1],
        layout: 'horizontal',
        caption: 'This is a very long caption that should ideally be wrapped because it exceeds the eighty character limit that we have hardcoded in the composeFigure function for testing purposes.',
        figureNumber: 1
      });
      expect(svg).toContain('Figure 1.');
      expect(svg).toContain('This is a very long caption');
    });
  });

  describe('applyPublicationStyle', () => {
    const mockStyle = {
      fontFamily: 'Helvetica',
      tickLabelSize: 8,
      axisLabelSize: 12,
      panelLabelSize: 16,
      dataLineWidth: 2,
      axisLineWidth: 1,
      captionSize: 10,
      palette: [],
      backgroundColor: '#ffffff',
      dpi: 300,
      panelLabelBold: true,
      panelLabelPosition: 'top-left' as const,
      panelGap: 5
    };

    it('removes recharts tooltips and cursors', () => {
      const svg = `<svg><g class="recharts-tooltip-wrapper"></g><g class="recharts-cursor"></g><rect class="recharts-tooltip-wrapper" /><line class="recharts-cursor" /></svg>`;
      const result = applyPublicationStyle(svg, mockStyle);
      expect(result).not.toContain('recharts-tooltip-wrapper');
      expect(result).not.toContain('recharts-cursor');
    });

    it('replaces font-family', () => {
      const svg = `<text font-family="Arial">Test</text><text style="font-family: Arial;">Test</text>`;
      const result = applyPublicationStyle(svg, mockStyle);
      expect(result).toContain('font-family="Helvetica"');
      expect(result).toContain('font-family: Helvetica');
    });

    it('scales font-size correctly', () => {
      const svg = `<text font-size="10px">Small</text><text font-size="12px">Medium Attribute</text><text style="font-size: 12px;">Medium Style</text><text style="font-size: 10px;">Small Style</text><text font-size="20">Large</text><text style="font-size: 20px;">Large Style</text>`;
      const result = applyPublicationStyle(svg, mockStyle);

      // small <= 10
      expect(result).toMatch(/font-size="\d+\.\d+px"/);
      // medium 10 < x <= 14
      expect(result).toMatch(/font-size: \d+\.\d+px/);
      // large > 14
      expect(result).toMatch(/font-size="\d+\.\d+px"/);
    });

    it('overrides stroke-width on paths and lines', () => {
      const svg = `<path stroke-width="0.5" /><line stroke-width="2.5" />`;
      const result = applyPublicationStyle(svg, mockStyle);

      expect(result).toContain('stroke-width="1"'); // thin -> axis (1)
      expect(result).toContain('stroke-width="2"'); // thick -> data (2)
    });
  });

  describe('extractRechartsSVG', () => {
    it('throws error when container ref is null', () => {
      expect(() => extractRechartsSVG({ current: null })).toThrow('Container ref is null');
    });

    it('throws error when no SVG is found in container', () => {
      const mockContainer = {
        querySelector: () => null
      } as unknown as HTMLElement;
      expect(() => extractRechartsSVG({ current: mockContainer })).toThrow('No SVG element found inside container');
    });

    it('extracts and serializes SVG successfully', () => {
      // Create a mock DOM node for the SVG
      const mockCloneNode = {
        // mock properties if needed
      };
      const mockSvgEl = {
        cloneNode: () => mockCloneNode
      };
      const mockContainer = {
        querySelector: (sel: string) => sel === 'svg' ? mockSvgEl : null
      } as unknown as HTMLElement;

      // Mock XMLSerializer globally
      const mockSerializeToString = vi.fn().mockReturnValue('<svg><path /></svg>');
      global.XMLSerializer = class {
        serializeToString = mockSerializeToString;
      } as any;

      const result = extractRechartsSVG({ current: mockContainer });
      expect(mockSerializeToString).toHaveBeenCalledWith(mockCloneNode);
      expect(result).toBe('<svg><path /></svg>');
    });
  });

  describe('extractCytoscapeSVG', () => {
    it('calls cy.svg with { full: true }', () => {
      let calledWith = null;
      const cyInstance = {
        svg: (opts?: object) => {
          calledWith = opts;
          return '<svg></svg>';
        }
      };

      const result = extractCytoscapeSVG(cyInstance);
      expect(calledWith).toEqual({ full: true });
      expect(result).toBe('<svg></svg>');
    });
  });
});

  describe('extractRechartsSVG with style', () => {

    it('applies style if provided', () => {
      const mockSvgEl = { cloneNode: () => ({}) };
      const mockContainer = {
        querySelector: (sel: string) => sel === 'svg' ? mockSvgEl : null
      } as unknown as HTMLElement;

      const mockSerializeToString = vi.fn().mockReturnValue('<svg><path stroke-width="2.5" /></svg>');
      global.XMLSerializer = class {
        serializeToString = mockSerializeToString;
      } as any;

      const result = extractRechartsSVG({ current: mockContainer }, {
        fontFamily: 'Helvetica',
        tickLabelSize: 8,
        axisLabelSize: 12,
        panelLabelSize: 16,
        dataLineWidth: 5,
        axisLineWidth: 1,
        captionSize: 10,
        palette: [],
        backgroundColor: '#ffffff',
        dpi: 300,
        panelLabelBold: true,
        panelLabelPosition: 'top-left',
        panelGap: 5
      });
      expect(result).toContain('stroke-width="5"');
    });
  });

  describe('composeFigure edge cases', () => {
    it('returns empty svg when n === 0', () => {
      const svg = composeFigure({ panels: [], layout: 'horizontal' });
      expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"></svg>');
    });

    it('handles short caption without wrapping', () => {
      const svg = composeFigure({
        panels: [{ id: 'p1', label: 'A', svgContent: '<svg></svg>', width: 50, height: 50 }],
        layout: 'horizontal',
        caption: 'Short caption',
        figureNumber: 1
      });
      expect(svg).toContain('Figure 1.');
      expect(svg).toContain('Short caption');
    });

    it('handles short caption without figureNumber', () => {
      const svg = composeFigure({
        panels: [{ id: 'p1', label: 'A', svgContent: '<svg></svg>', width: 50, height: 50 }],
        layout: 'horizontal',
        caption: 'Short caption only'
      });
      expect(svg).not.toContain('Figure 1.');
      expect(svg).toContain('Short caption only');
    });
  });

  describe('parseSVG fallbacks', () => {
    it('falls back to width and height attributes when viewBox is missing', () => {
      const svg = composeFigure({
        panels: [{ id: 'p1', label: 'A', svgContent: '<svg width="200" height="150"><circle /></svg>', width: 50, height: 50 }],
        layout: 'horizontal'
      });
      expect(svg).toContain('viewBox="0 0 200 150"');
    });

    it('uses defaults when width/height/viewBox are missing', () => {
      const svg = composeFigure({
        panels: [{ id: 'p1', label: 'A', svgContent: '<svg><circle /></svg>', width: 50, height: 50 }],
        layout: 'horizontal'
      });
      expect(svg).toContain('viewBox="0 0 300 200"');
    });
  });
