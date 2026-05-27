import { describe, expect, it } from 'vitest';
import { generateJupyterNotebookContent } from '../src/utils/jupyterExport';

describe('jupyterExport snapshot', () => {
  it('generates a complete valid notebook structure without simulation data', () => {
    const bnglCode = `begin model\nend model`;
    const notebookStr = generateJupyterNotebookContent(bnglCode, 'SnapshotModel');
    const notebook = JSON.parse(notebookStr);
    expect(notebook).toMatchSnapshot();
  });

  it('generates a complete valid notebook structure with simulation data', () => {
    const bnglCode = `begin model\nend model`;
    const simulationResults = {
      data: [
        { time: 0, A: 1, B: 2 },
        { time: 1, A: 3, B: 4 },
      ],
      speciesData: [{ A: 1, B: 2 }, { A: 3, B: 4 }],
      expandedReactions: [],
    } as any;
    const notebookStr = generateJupyterNotebookContent(bnglCode, 'SnapshotModelWithData', {
      simulationResults,
    });
    const notebook = JSON.parse(notebookStr);
    expect(notebook).toMatchSnapshot();
  });
});
