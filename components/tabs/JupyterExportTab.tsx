/**
 * components/tabs/JupyterExportTab.tsx
 * 
 * A specialized tab component that allows users to export the current BNGL model
 * as a Jupyter Notebook (.ipynb) with comprehensive analysis templates.
 */

import React, { useState } from 'react';
import { BNGLModel, SimulationResults } from '../../types';
import { generateJupyterNotebookContent } from '../../src/utils/jupyterExport';
import { downloadTextFile } from '../../src/utils/download';
import { Card } from '../ui/Card';

interface JupyterExportTabProps {
  model: BNGLModel | null;
  bnglCode?: string;
  results?: SimulationResults | null;
}

export const JupyterExportTab: React.FC<JupyterExportTabProps> = ({ model, bnglCode = '', results = null }) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    if (!model && !bnglCode) return;
    setIsExporting(true);

    try {
      const codeToExport = bnglCode || ''; // Assume code is passed explicitly or available via model (though BNGLModel usually stores parsed structure)
      const modelName = model?.name || 'model';
      const cleanName = modelName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      const content = generateJupyterNotebookContent(codeToExport, cleanName, { simulationResults: results });
      
      downloadTextFile(
        content,
        `${cleanName}_analysis.ipynb`,
        'application/x-ipynb+json'
      );
    } catch (error) {
      console.error('Failed to export Jupyter notebook:', error);
      alert('Failed to generate notebook. check console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-500">
      <Card className="p-8 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 border-slate-200 dark:border-slate-700 dark:border-slate-700">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 mb-2">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <circle cx="10" cy="13" r="2" />
              <path d="m20 17-1.2-1.2" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Export to Jupyter Notebook</h2>
          
          <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed">
            Download a comprehensive Python notebook pre-configured for your model. 
            Includes templates for <b>Simulation</b>, <b>Parameter Estimation</b>, <b>Sensitivity Analysis</b>, <b>Steady State detection</b>, and more using <code>pybionetgen</code>.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left py-6">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">1</div>
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">Simulation & Plotting</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">Full Matplotlib/Seaborn setup for publication-ready figures.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm">2</div>
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">Global Optimization</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">Scipy-based Parameter Estimation cell with loss function templates.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">3</div>
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">Math Analysis Suite</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">Local sensitivity, FIM, and steady state root-finding templates.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">4</div>
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">Scaling Experiments</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">Scriptable parameter sweeps and data processing using Numpy/Pandas.</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting || (!model && !bnglCode)}
            className="inline-flex items-center gap-2 px-8 py-4 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-400 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 transform transition-all hover:scale-105 active:scale-95 text-lg"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating Notebook...
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Analysis Notebook (.ipynb)
              </>
            )}
          </button>
          
          <div className="pt-4 text-xs text-slate-400">
            Requires <code>pybionetgen</code>, <code>numpy</code>, <code>matplotlib</code>, and <code>scipy</code> python packages.
          </div>
        </div>
      </Card>
      
      <Card className="p-6 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 border-dashed border-2 border-slate-200 dark:border-slate-700 dark:border-slate-800 flex items-center justify-center">
        <div className="flex items-start gap-4 text-slate-500 dark:text-slate-400 max-w-lg">
          <svg className="w-6 h-6 mt-1 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">
            <b>Pro Tip:</b> You can run the generated notebook on <b>Google Colab</b> for a zero-setup experience. Just upload the notebook and the <code>.bngl</code> file.
          </p>
        </div>
      </Card>
    </div>
  );
};
