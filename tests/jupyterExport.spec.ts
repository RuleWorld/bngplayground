import { describe, expect, it } from 'vitest';
import { generateJupyterNotebookContent } from '../src/utils/jupyterExport';

describe('jupyterExport', () => {
  it('includes embedded session results when simulation data is present', () => {
    const simulationResults = {
      data: [
        { time: 0, A: 1, B: 2 },
        { time: 1, A: 3, B: 4 },
      ],
      speciesData: [{ A: 1, B: 2 }, { A: 3, B: 4 }],
      expandedReactions: [],
    } as any;

    const notebook = JSON.parse(
      generateJupyterNotebookContent('begin model\nend model', 'demo_model', {
        simulationResults,
      })
    );

    const markdown = notebook.cells
      .filter((cell: { cell_type: string; source: string[] }) => cell.cell_type === 'markdown')
      .map((cell: { source: string[] }) => cell.source.join(''))
      .join('\n');

    const code = notebook.cells
      .filter((cell: { cell_type: string; source: string[] }) => cell.cell_type === 'code')
      .map((cell: { source: string[] }) => cell.source.join(''))
      .join('\n');

    expect(markdown).toContain('current web session');
    expect(markdown).toContain('Embedded Session Results');
    expect(code).toContain('session_rows = json.loads');
    expect(code).toContain('session_df = pd.DataFrame(session_rows)');
    expect(code).toContain("result_map = ret.results if hasattr(ret, 'results') else ret");
    expect(code).toContain("plt.plot(session_df['time']");
  });

  it('omits embedded session results when no simulation data is provided', () => {
    const notebook = JSON.parse(
      generateJupyterNotebookContent('begin model\nend model', 'demo_model')
    );

    const notebookText = JSON.stringify(notebook);
    expect(notebookText).not.toContain('Embedded Session Results');
    expect(notebookText).not.toContain('session_rows = json.loads');
  });
});