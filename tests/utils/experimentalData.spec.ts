import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseExperimentalCSV, readExperimentalCSVFile } from '../../src/utils/experimentalData';

describe('parseExperimentalCSV', () => {
    it('throws error for less than 2 lines', () => {
        expect(() => parseExperimentalCSV('time,A,B\n')).toThrow('CSV must have at least a header row and one data row');
    });

    it('throws error if time column is missing', () => {
        expect(() => parseExperimentalCSV('A,B\n1,2\n3,4')).toThrow('CSV must have a "time" or "t" column');
    });

    it('parses valid CSV with time as t', () => {
        const result = parseExperimentalCSV('t,A,B\n0,1,2\n1,3,4');
        expect(result.datasets).toHaveLength(2);
        expect(result.datasets[0].name).toBe('A');
        expect(result.datasets[0].points).toEqual([{ time: 0, value: 1 }, { time: 1, value: 3 }]);
        expect(result.datasets[1].name).toBe('B');
        expect(result.datasets[1].points).toEqual([{ time: 0, value: 2 }, { time: 1, value: 4 }]);
    });

    it('parses error columns correctly', () => {
        const result = parseExperimentalCSV('time,A,A_error,B,B_sd\n0,10,1,20,2\n1,15,1.5,25,2.5');
        expect(result.datasets).toHaveLength(2);
        expect(result.datasets[0].name).toBe('A');
        expect(result.datasets[0].points).toEqual([
            { time: 0, value: 10, error: 1 },
            { time: 1, value: 15, error: 1.5 }
        ]);
        expect(result.datasets[1].name).toBe('B');
        expect(result.datasets[1].points).toEqual([
            { time: 0, value: 20, error: 2 },
            { time: 1, value: 25, error: 2.5 }
        ]);
    });

    it('skips empty lines', () => {
        const result = parseExperimentalCSV('time,A\n\n0,1\n   \n1,2\n');
        expect(result.datasets[0].points).toHaveLength(2);
    });

    it('skips rows where time is NaN', () => {
        const result = parseExperimentalCSV('time,A\n0,1\nfoo,2\n1,3');
        expect(result.datasets[0].points).toHaveLength(2);
        expect(result.datasets[0].points[1].time).toBe(1);
    });

    it('skips values where value is NaN', () => {
        const result = parseExperimentalCSV('time,A,B\n0,1,bar\n1,foo,4\n2,5,6');
        expect(result.datasets[0].points).toEqual([
            { time: 0, value: 1 },
            { time: 2, value: 5 }
        ]);
        expect(result.datasets[1].points).toEqual([
            { time: 1, value: 4 },
            { time: 2, value: 6 }
        ]);
    });

    it('handles mismatched error column lengths', () => {
        const result = parseExperimentalCSV('time,A,A_error\n0,1,0.1\n1,foo,0.2\n2,3,0.3');
        expect(result.datasets[0].points).toEqual([
            { time: 0, value: 1 },
            { time: 2, value: 3 }
        ]);
        expect(result.datasets[0].points[0].error).toBeUndefined(); // length mismatch
    });

    it('ignores error columns that have no base column', () => {
        const result = parseExperimentalCSV('time,A,B_error\n0,1,0.1\n1,2,0.2');
        expect(result.datasets).toHaveLength(1);
        expect(result.datasets[0].name).toBe('A');
    });

    it('getBaseColumnName returns the original name if no error suffix matches', () => {
        const result = parseExperimentalCSV('time,A_other\n0,1\n1,2');
        expect(result.datasets).toHaveLength(1);
        expect(result.datasets[0].name).toBe('A_other');
    });

    it('supports multiple error suffixes', () => {
        const result = parseExperimentalCSV('time,A,A_err,B,B_stdev,C,C_stderr\n0,1,0.1,2,0.2,3,0.3');
        expect(result.datasets).toHaveLength(3);
        expect(result.datasets[0].points[0].error).toBe(0.1);
        expect(result.datasets[1].points[0].error).toBe(0.2);
        expect(result.datasets[2].points[0].error).toBe(0.3);
    });

    it('ignores extra columns beyond header length and handles missing columns', () => {
        const result = parseExperimentalCSV('time,A,B\n0,1\n1,2,3,4\n2,3,4');
        expect(result.datasets[0].points).toEqual([
            { time: 0, value: 1 },
            { time: 1, value: 2 },
            { time: 2, value: 3 }
        ]);
        expect(result.datasets[1].points).toEqual([
            { time: 1, value: 3 },
            { time: 2, value: 4 }
        ]);
    });
});

describe('readExperimentalCSVFile', () => {
    let originalFileReader: any;
    let originalFile: any;

    beforeEach(() => {
        originalFileReader = globalThis.FileReader;
        originalFile = globalThis.File;

        // Setup mock File
        class MockFile {
            name: string;
            content: string;
            type: string;
            constructor(parts: any[], name: string, options: any) {
                this.content = parts[0];
                this.name = name;
                this.type = options.type;
            }
        }
        globalThis.File = MockFile as any;

        // Setup mock FileReader
        class MockFileReader {
            onload: any = null;
            onerror: any = null;
            readAsText(file: any) {
                setTimeout(() => {
                    if (this.onload) {
                        this.onload({ target: { result: file.content } });
                    }
                }, 0);
            }
        }
        globalThis.FileReader = MockFileReader as any;
    });

    afterEach(() => {
        globalThis.FileReader = originalFileReader;
        globalThis.File = originalFile;
    });

    it('successfully parses valid CSV file', async () => {
        const csvText = 'time,A\n0,1\n1,2';
        const file = new File([csvText], 'test.csv', { type: 'text/csv' });
        const result = await readExperimentalCSVFile(file);
        expect(result.fileName).toBe('test.csv');
        expect(result.datasets).toHaveLength(1);
        expect(result.datasets[0].name).toBe('A');
        expect(result.datasets[0].points).toEqual([
            { time: 0, value: 1 },
            { time: 1, value: 2 }
        ]);
    });

    it('rejects if parsing fails', async () => {
        const csvText = 'invalid\n1,2';
        const file = new File([csvText], 'invalid.csv', { type: 'text/csv' });
        await expect(readExperimentalCSVFile(file)).rejects.toThrow('CSV must have a "time" or "t" column');
    });

    it('rejects on file read error', async () => {
        // Override mock for this specific test
        class MockFileReaderError {
            onload: any = null;
            onerror: any = null;
            readAsText() {
                setTimeout(() => {
                    if (this.onerror) this.onerror(new Error('Simulated read error'));
                }, 0);
            }
        }

        globalThis.FileReader = MockFileReaderError as any;

        const file = new File([''], 'error.csv', { type: 'text/csv' });
        await expect(readExperimentalCSVFile(file)).rejects.toThrow('Failed to read file');
    });
});
