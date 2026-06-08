// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFigure, ExportResult, extractSVGDims } from '../../../src/services/figure/FigureExporter';

describe('FigureExporter', () => {
  describe('extractSVGDims', () => {
    const MM_TO_PX = 3.7795275591;

    it('should extract dimensions from width and height in mm', () => {
      const svg = '<svg width="100mm" height="50.5mm"></svg>';
      const result = extractSVGDims(svg);
      expect(result).toEqual({
        widthMm: 100,
        heightMm: 50.5,
        widthPx: 100 * MM_TO_PX,
        heightPx: 50.5 * MM_TO_PX,
      });
    });

    it('should extract dimensions from viewBox as a fallback', () => {
      const svg = '<svg viewBox="0 0 200 150"></svg>';
      const result = extractSVGDims(svg);
      expect(result).toEqual({
        widthMm: 200 / MM_TO_PX,
        heightMm: 150 / MM_TO_PX,
        widthPx: 200,
        heightPx: 150,
      });
    });

    it('should handle viewBox with commas', () => {
      const svg = '<svg viewBox="0,0,300,200"></svg>';
      const result = extractSVGDims(svg);
      expect(result).toEqual({
        widthMm: 300 / MM_TO_PX,
        heightMm: 200 / MM_TO_PX,
        widthPx: 300,
        heightPx: 200,
      });
    });

    it('should fallback to default dimensions if neither mm nor viewBox are present', () => {
      const svg = '<svg></svg>';
      const result = extractSVGDims(svg);
      expect(result).toEqual({
        widthMm: 178,
        heightMm: 120,
        widthPx: 178 * MM_TO_PX,
        heightPx: 120 * MM_TO_PX,
      });
    });
  });

  describe('downloadFigure', () => {
    let mockCreateObjectURL: any;
    let mockRevokeObjectURL: any;
    let mockCreateElement: any;
    let mockClick: any;

    let originalCreateObjectURL: any;
    let originalRevokeObjectURL: any;

    beforeEach(() => {
      // Save originals
      originalCreateObjectURL = global.URL.createObjectURL;
      originalRevokeObjectURL = global.URL.revokeObjectURL;

      // Mock URL.createObjectURL and URL.revokeObjectURL
      mockCreateObjectURL = vi.fn().mockReturnValue('mock-url');
      mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      // Mock document.createElement
      mockClick = vi.fn();
      mockCreateElement = vi.fn().mockReturnValue({
        href: '',
        download: '',
        click: mockClick,
      });
      vi.spyOn(document, 'createElement').mockImplementation(mockCreateElement as any);
    });

    afterEach(() => {
      // Restore originals
      global.URL.createObjectURL = originalCreateObjectURL;
      global.URL.revokeObjectURL = originalRevokeObjectURL;

      vi.restoreAllMocks();
    });

    it('should create an anchor element, click it, and revoke the URL', () => {
      const mockResult: ExportResult = {
        blob: new Blob(['mock content'], { type: 'image/png' }),
        filename: 'test-figure.png',
        mimeType: 'image/png',
      };

      downloadFigure(mockResult);

      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockResult.blob);
      expect(mockCreateElement).toHaveBeenCalledWith('a');

      const mockAnchor = mockCreateElement.mock.results[0].value;
      expect(mockAnchor.href).toBe('mock-url');
      expect(mockAnchor.download).toBe('test-figure.png');
      expect(mockClick).toHaveBeenCalled();

      expect(mockRevokeObjectURL).toHaveBeenCalledWith('mock-url');
    });
  });
});
