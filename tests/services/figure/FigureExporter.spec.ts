// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFigure, ExportResult } from '../../../src/services/figure/FigureExporter';

describe('FigureExporter', () => {
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
