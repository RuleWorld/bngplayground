import React, { useMemo, useState, useCallback } from 'react';
import type { BNGLModel } from '../types';
import { buildContactMap } from '../services/visualization/contactMapBuilder';
import { buildAdjacencyMatrix, compareModels, ModelComparisonResult } from '../services/visualization/modelComparison';
import { bnglService } from '../services/bnglService';

interface ModelComparisonPanelProps {
  currentModel: BNGLModel | null;
}

const getRuleId = (rule: { name?: string }, index: number): string => rule.name ?? `rule_${index + 1}`;
const getRuleLabel = (rule: { name?: string }, index: number): string => rule.name ?? `Rule ${index + 1}`;

export const ModelComparisonPanel: React.FC<ModelComparisonPanelProps> = ({ currentModel }) => {
  const [pastedBngl, setPastedBngl] = useState('');
  const [comparisonModel, setComparisonModel] = useState<BNGLModel | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const handleParsePasted = useCallback(async () => {
    if (!pastedBngl.trim()) return;
    setIsParsing(true);
    setParseError(null);
    try {
      const parsed = await bnglService.parse(pastedBngl, { description: 'Model comparison parse' });
      setComparisonModel(parsed);
    } catch (err: any) {
      setParseError(err.message ?? 'Failed to parse BNGL');
      setComparisonModel(null);
    } finally {
      setIsParsing(false);
    }
  }, [pastedBngl]);

  const comparison: ModelComparisonResult | null = useMemo(() => {
    if (!currentModel || !comparisonModel) return null;

    const contactMapA = buildContactMap(currentModel.reactionRules, currentModel.moleculeTypes, { getRuleId, getRuleLabel });
    const contactMapB = buildContactMap(comparisonModel.reactionRules, comparisonModel.moleculeTypes, { getRuleId, getRuleLabel });

    const adjA = buildAdjacencyMatrix(contactMapA);
    const adjB = buildAdjacencyMatrix(contactMapB);

    return compareModels(adjA, adjB);
  }, [currentModel, comparisonModel]);

  if (!currentModel) {
    return <div className="text-slate-500 dark:text-slate-400">Parse a model first to enable comparison.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Paste a second BNGL model to compare:
        </label>
        <textarea
          className="w-full h-32 text-xs font-mono rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-2"
          placeholder="Paste BNGL code here..."
          value={pastedBngl}
          onChange={(e) => setPastedBngl(e.target.value)}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            className="px-3 py-1 text-xs font-medium rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
            onClick={handleParsePasted}
            disabled={!pastedBngl.trim() || isParsing}
          >
            {isParsing ? 'Parsing...' : 'Parse & Compare'}
          </button>
          {parseError && (
            <span className="text-xs text-red-500">{parseError}</span>
          )}
        </div>
      </div>

      {comparison && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Comparison Results
          </h3>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            <SummaryCard label="Model A edges" value={comparison.summary.totalA} color="slate" />
            <SummaryCard label="Model B edges" value={comparison.summary.totalB} color="slate" />
            <SummaryCard label="Shared" value={comparison.summary.shared} color="green" />
            <SummaryCard label="Added in B" value={comparison.summary.addedInB} color="blue" />
            <SummaryCard label="Removed from A" value={comparison.summary.removedFromA} color="red" />
          </div>

          {/* Diff Table */}
          {comparison.diffs.length > 0 && (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                    <th className="py-1 px-2 text-slate-500">Status</th>
                    <th className="py-1 px-2 text-slate-500">Source</th>
                    <th className="py-1 px-2 text-slate-500">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.diffs.map((d, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-1 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${d.status === 'shared' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          d.status === 'added' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                          {d.status === 'shared' ? '●' : d.status === 'added' ? '+' : '−'} {d.status}
                        </span>
                      </td>
                      <td className="py-1 px-2 text-slate-700 dark:text-slate-300 font-mono">{d.source}</td>
                      <td className="py-1 px-2 text-slate-700 dark:text-slate-300 font-mono">{d.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {comparison.diffs.length === 0 && (
            <p className="text-xs text-slate-500">No differences found — models are identical in structure.</p>
          )}
        </div>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const colorClasses: Record<string, string> = {
    slate: 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
  };
  return (
    <div className={`${colorClasses[color] ?? colorClasses.slate} rounded p-2 text-center`}>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
    </div>
  );
};
