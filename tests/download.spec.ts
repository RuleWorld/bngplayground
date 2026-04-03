// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toCsv, downloadCsv, downloadTextFile } from '../src/utils/download';

describe('download utils', () => {
  let createObjectURLMock: any;
  let revokeObjectURLMock: any;
  let clickSpy: any;
  let createElementSpy: any;

  beforeEach(() => {
    createObjectURLMock = vi.fn(() => 'blob:mock-url');
    revokeObjectURLMock = vi.fn();

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    createElementSpy = vi.spyOn(document, 'createElement');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('toCsv', () => {
    it('returns an empty string if data is empty or undefined', () => {
      expect(toCsv([], ['time', 'A'])).toBe('');
      // @ts-ignore testing undefined case
      expect(toCsv(undefined, ['time', 'A'])).toBe('');
    });

    it('formats normal data to CSV', () => {
      const data = [
        { time: 0, A: 10, B: 20 },
        { time: 1.5, A: 15, B: 25 }
      ];
      const headers = ['time', 'A', 'B'];
      const result = toCsv(data, headers);

      const expectedLines = [
        'time,A,B',
        '0.000000000000e+00,10,20',
        '1.500000000000e+00,15,25'
      ].join('\n');

      expect(result).toBe(expectedLines);
    });

    it('ensures "time" column is always first, regardless of headers order', () => {
      const data = [
        { B: 20, time: 0, A: 10 }
      ];
      const headers = ['B', 'A', 'time'];
      const result = toCsv(data, headers);

      const expectedLines = [
        'time,B,A',
        '0.000000000000e+00,20,10'
      ].join('\n');

      expect(result).toBe(expectedLines);
    });

    it('handles null, undefined, and non-finite values correctly', () => {
      const data = [
        { time: null, A: undefined, B: NaN, C: Infinity }
      ];
      const headers = ['time', 'A', 'B', 'C'];
      const result = toCsv(data, headers);

      const expectedLines = [
        'time,A,B,C',
        ',,,'
      ].join('\n');

      expect(result).toBe(expectedLines);
    });

    it('formats string values correctly', () => {
      const data = [
        { time: 1, A: 'text', B: 'more text' }
      ];
      const headers = ['time', 'A', 'B'];
      const result = toCsv(data, headers);

      const expectedLines = [
        'time,A,B',
        '1.000000000000e+00,text,more text'
      ].join('\n');

      expect(result).toBe(expectedLines);
    });
  });

  describe('downloadTextFile', () => {
    it('creates an anchor element and triggers a download', () => {
      const content = 'hello world';
      const filename = 'test.txt';
      const mimeType = 'text/plain';

      downloadTextFile(content, filename, mimeType);

      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      const blobArg = createObjectURLMock.mock.calls[0][0];
      expect(blobArg).toBeInstanceOf(Blob);
      expect(blobArg.type).toBe(mimeType);

      expect(createElementSpy).toHaveBeenCalledWith('a');

      expect(clickSpy).toHaveBeenCalledTimes(1);

      const clickedElement = clickSpy.mock.instances[0] as HTMLAnchorElement;
      expect(clickedElement.href).toContain('blob:mock-url');
      expect(clickedElement.download).toBe(filename);

      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
      expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('downloadCsv', () => {
    it('does nothing if the generated CSV is empty', () => {
      downloadCsv([], ['time', 'A'], 'test.csv');

      expect(createObjectURLMock).not.toHaveBeenCalled();
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('triggers a download with the correct CSV content and type', () => {
      const data = [{ time: 0, A: 10 }];
      const headers = ['time', 'A'];

      downloadCsv(data, headers, 'data.csv');

      expect(createObjectURLMock).toHaveBeenCalledTimes(1);

      const blobArg = createObjectURLMock.mock.calls[0][0] as Blob;
      expect(blobArg.type).toBe('text/csv');

      expect(clickSpy).toHaveBeenCalledTimes(1);
      const clickedElement = clickSpy.mock.instances[0] as HTMLAnchorElement;
      expect(clickedElement.download).toBe('data.csv');
    });
  });
});
