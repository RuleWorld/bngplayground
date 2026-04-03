import { describe, it, expect } from 'vitest';
import { generateJupyterNotebookContent } from '../src/utils/jupyterExport';

describe('jupyterExport utility', () => {
  const mockBnglCode = 'begin parameters\n  k 1.0\nend parameters';
  const mockModelName = 'TestModel';

  it('generates a valid JSON notebook string', () => {
    const result = generateJupyterNotebookContent(mockBnglCode, mockModelName);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('has the correct Jupyter Notebook format version', () => {
    const result = JSON.parse(generateJupyterNotebookContent(mockBnglCode, mockModelName));
    expect(result.nbformat).toBe(4);
    expect(result.nbformat_minor).toBe(5);
  });

  it('embeds the model name in the header and setup', () => {
    const result = JSON.parse(generateJupyterNotebookContent(mockBnglCode, mockModelName));
    const headerCell = result.cells.find((c: any) => c.cell_type === 'markdown' && c.source[0].includes('# BioNetGen Analysis'));
    expect(headerCell.source[0]).toContain(mockModelName);

    const saveModelCell = result.cells.find((c: any) => c.cell_type === 'code' && c.source.some((s: string) => s.includes('model_name =')));
    expect(saveModelCell.source.some((s: string) => s.includes(`model_name = "${mockModelName}"`))).toBe(true);
  });

  it('embeds the BNGL code in the save model cell', () => {
    const result = JSON.parse(generateJupyterNotebookContent(mockBnglCode, mockModelName));
    const saveModelCell = result.cells.find((c: any) => c.cell_type === 'code' && c.source.some((s: string) => s.includes('bngl_content =')));
    expect(saveModelCell.source.some((s: string) => s.includes(mockBnglCode))).toBe(true);
  });

  it('contains all expected sections', () => {
    const result = JSON.parse(generateJupyterNotebookContent(mockBnglCode, mockModelName));
    const sources = result.cells.map((c: any) => c.source.join(''));

    const expectedSections = [
      '# BioNetGen Analysis',
      '# Install dependencies if needed',
      '# Save current model to file',
      '## 1. Standard Simulation with pybionetgen',
      '## 2. High-Performance ODE Simulation with libroadrunner',
      '## 2.5. Steady State Analysis',
      '## 3. Model Structure Analysis',
      '## 4. Parameter Sensitivity Scan (1D)',
      '## 5. Parameter Estimation (Optimization)',
      '## 6. Fisher Information & Sensitivity Analysis',
      '**Next Steps**'
    ];

    expectedSections.forEach(section => {
      expect(sources.some((s: string) => s.includes(section))).toBe(true);
    });
  });

  it('has valid metadata structure', () => {
    const result = JSON.parse(generateJupyterNotebookContent(mockBnglCode, mockModelName));
    expect(result.metadata).toBeDefined();
    expect(result.metadata.kernelspec).toBeDefined();
    expect(result.metadata.language_info).toBeDefined();
    expect(result.metadata.language_info.name).toBe('python');
  });
});
