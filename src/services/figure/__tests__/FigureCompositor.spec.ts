import { describe, it, expect } from 'vitest';
import { composeFigure, FigureConfig, FigurePanel } from '../FigureCompositor';

describe('FigureCompositor', () => {
  const mockPanel1: FigurePanel = {
    id: 'p1',
    label: '(A)',
    svgContent: '<svg viewBox="0 0 100 50"><circle cx="50" cy="25" r="10"/></svg>',
    width: 100,
    height: 50,
  };

  const mockPanel2: FigurePanel = {
    id: 'p2',
    label: '(B)',
    svgContent: '<svg viewBox="0 0 50 100"><rect width="50" height="100"/></svg>',
    width: 50,
    height: 100,
  };

  it('returns empty svg if no panels are provided', () => {
    const result = composeFigure({ panels: [], layout: 'horizontal' });
    expect(result).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"></svg>');
  });

  it('computes horizontal layout correctly', () => {
    const config: FigureConfig = {
      panels: [mockPanel1, mockPanel2],
      layout: 'horizontal',
      totalWidth: 100,
    };
    const result = composeFigure(config);
    expect(result).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(result).toContain('translate(0.00, 0.00)');
    // panelW + gapPx = 198.42519685275002
    expect(result).toContain('translate(198.43, 0.00)');
  });

  it('computes vertical layout correctly', () => {
    const config: FigureConfig = {
      panels: [mockPanel1, mockPanel2],
      layout: 'vertical',
      totalWidth: 100,
    };
    const result = composeFigure(config);
    expect(result).toContain('translate(0.00, 0.00)');
    // yOffset2 = panelH1 + gapPx = 377.95275591 * 0.5 + 18.8976377955 = 188.976377955 + 18.8976377955 = 207.8740157505
    expect(result).toContain('translate(0.00, 207.87)');
  });

  it('computes grid layout correctly', () => {
    const config: FigureConfig = {
      panels: [mockPanel1, mockPanel2],
      layout: 'grid',
      gridCols: 2,
      totalWidth: 100,
    };
    const result = composeFigure(config);
    expect(result).toContain('translate(0.00, 0.00)');
    // same x translation as horizontal layout for second panel: 198.43
    expect(result).toContain('translate(198.43, 0.00)');
  });

  it('applies captions and presets', () => {
    const config: FigureConfig = {
      panels: [mockPanel1],
      layout: 'horizontal',
      caption: 'This is a test caption.',
      preset: 'plos',
      figureNumber: 1,
    };
    const result = composeFigure(config);
    expect(result).toContain('Figure 1.');
    expect(result).toContain('This is a test caption.');
    // PLOS preset properties
    expect(result).toContain('font-family="Arial, Helvetica, sans-serif"');
  });
});
