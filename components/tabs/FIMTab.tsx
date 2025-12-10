import React, { useCallback, useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
// LoadingSpinner not required in the FIMTab header - analysis uses custom progress UI
import { BNGLModel } from '../../types';
import { bnglService } from '../../services/bnglService';
import { computeFIM, exportFIM, type FIMResult } from '../../services/fim';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
} from 'recharts';
import { FIMHeatmap } from '../../components/FIMHeatmap';

interface FIMTabProps {
  model: BNGLModel | null;
}

export const FIMTab: React.FC<FIMTabProps> = ({ model }) => {
  const parameterNames = useMemo(() => (model ? Object.keys(model.parameters) : []), [model]);
  const [selected, setSelected] = useState<string[]>(() => []);
  const [isComputing, setIsComputing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<FIMResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const [useLogParams, setUseLogParams] = useState(true);
  const [expandedEigen, setExpandedEigen] = useState<number | null>(null);
  const [showFIMHeatmap, setShowFIMHeatmap] = useState(false);
  const [showCorrelationHeatmap, setShowCorrelationHeatmap] = useState(false);
  const [showJacobianHeatmap, setShowJacobianHeatmap] = useState(false);
  const [analysisConfig, setAnalysisConfig] = useState<{ method: 'ode' | 'ssa'; t_end: number; n_steps: number }>(() => ({
    method: 'ode',
    t_end: 100,
    n_steps: 100,
  }));
  const cachedModelIdRef = React.useRef<number | null>(null);

  const paramRuleMap = useMemo(() => {
    if (!model) {
      return {} as Record<string, string[]>;
    }

    const mapping: Record<string, string[]> = {};

    model.reactionRules.forEach((rule, index) => {
      const label = rule.name ?? `Rule ${index + 1}`;
      const register = (paramName?: string) => {
        if (!paramName) return;
        if (!mapping[paramName]) {
          mapping[paramName] = [];
        }
        if (!mapping[paramName].includes(label)) {
          mapping[paramName].push(label);
        }
      };

      register(rule.rate);
      register(rule.reverseRate);
    });

    Object.values(mapping).forEach((rules) => rules.sort());

    return mapping;
  }, [model]);

  // Release cached model in worker when this tab unmounts.
  React.useEffect(() => {
    return () => {
      const id = cachedModelIdRef.current;
      if (typeof id === 'number') {
        bnglService.releaseModel(id).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('Failed to release cached model on FIMTab unmount', id, err);
        });
        cachedModelIdRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!model) {
      setSelected([]);
      setResult(null);
      setError(null);
    } else if (parameterNames.length > 0 && selected.length === 0) {
      // default: select all if small count, otherwise first 10
      setSelected(parameterNames.length <= 20 ? parameterNames.slice() : parameterNames.slice(0, 20));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const onSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const collection = e.target.selectedOptions as unknown as HTMLOptionsCollection | undefined;
    const opts = Array.from(collection ?? []).map((o) => (o as HTMLOptionElement).value);
    setSelected(opts);
  };

  const handleCompute = useCallback(async (overrideConfig?: { method?: 'ode' | 'ssa'; t_end: number; n_steps: number }) => {
    if (!model) {
      setError('No model loaded');
      return;
    }
    if (!selected || selected.length === 0) {
      setError('Select at least one parameter');
      return;
    }
    if (selected.length > 80) {
      setError('Please select fewer parameters (<=80) to keep computation reasonable.');
      return;
    }

    setError(null);
    setResult(null);
    setIsComputing(true);
    setProgress({ current: 0, total: 0 });
    const c = new AbortController();
    setController(c);

    const config = overrideConfig
      ? {
          method: overrideConfig.method ?? analysisConfig.method,
          t_end: overrideConfig.t_end,
          n_steps: overrideConfig.n_steps,
        }
      : analysisConfig;
    setAnalysisConfig(config);

    try {
      const simOptions = {
        method: config.method,
        t_end: config.t_end,
        n_steps: config.n_steps,
      } as const;

      const onProgress = (cur: number, tot: number) => setProgress({ current: cur, total: tot });
        const res = await computeFIM(model, selected, simOptions, c.signal, onProgress, true, useLogParams);
        // remember the modelId used by computeFIM so we can release it when the tab unmounts
        if (res?.benchmark && (res as any).benchmark.modelId) {
          cachedModelIdRef.current = (res as any).benchmark.modelId as number;
        }
      setResult(res);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Computation cancelled');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsComputing(false);
      setController(null);
    }
  }, [analysisConfig, model, selected, useLogParams]);

  const handleCancel = useCallback(() => {
    if (controller) controller.abort();
  }, [controller]);

  const runPreset = useCallback((preset: 'quick' | 'standard') => {
    const config = preset === 'quick'
      ? { method: 'ode' as const, t_end: 60, n_steps: 80 }
      : { method: 'ode' as const, t_end: 200, n_steps: 150 };
    void handleCompute(config);
  }, [handleCompute]);

  const activePreset = useMemo<'quick' | 'standard' | 'custom'>(() => {
    if (analysisConfig.method === 'ode' && analysisConfig.t_end === 60 && analysisConfig.n_steps === 80) {
      return 'quick';
    }
    if (analysisConfig.method === 'ode' && analysisConfig.t_end === 200 && analysisConfig.n_steps === 150) {
      return 'standard';
    }
    return 'custom';
  }, [analysisConfig]);

  const selectionSummary = useMemo(() => {
    const coverage = new Set<string>();
    const uncovered: string[] = [];
    const exampleRules: string[] = [];

    selected.forEach((param) => {
      const rules = paramRuleMap[param] ?? [];
      if (rules.length === 0) {
        uncovered.push(param);
        return;
      }
      rules.forEach((rule) => coverage.add(rule));
      if (exampleRules.length < 4) {
        exampleRules.push(rules[0] ?? '');
      }
    });

    const uniqueExamples = Array.from(new Set(exampleRules.filter(Boolean)));

    return {
      selectedCount: selected.length,
      totalParameters: parameterNames.length,
      coveredRules: coverage.size,
      uncovered,
      exampleRules: uniqueExamples,
    };
  }, [parameterNames, paramRuleMap, selected]);

  const exportNullSpace = () => {
    if (!result?.nullspaceCombinations) return;

    const csv = [
      ['Combination', 'Eigenvalue', 'Parameter', 'Loading'].join(','),
      ...result.nullspaceCombinations.flatMap((comb, idx) =>
        comb.components.map(comp =>
          [idx + 1, comb.eigenvalue, comp.name, comp.loading].join(',')
        )
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nullspace_combinations.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadVIF = () => {
    if (!result?.vif) return;
    const csv = [
      ['Parameter', 'VIF'].join(','),
      ...result.paramNames.map((name, i) => 
        [name, result.vif?.[i] || 'N/A'].join(',')
      )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vif_table.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCorrelations = () => {
    if (!result?.correlations) return;
    const csv = [
      ['', ...result.paramNames].join(','),
      ...result.correlations.map((row, i) =>
        [result.paramNames[i], ...row].join(',')
      )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'correlations.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFIMMatrix = () => {
    if (!result?.fimMatrix) return;
    const csv = [
      ['', ...result.paramNames].join(','),
      ...result.fimMatrix.map((row, i) =>
        [result.paramNames[i], ...row].join(',')
      )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fim_matrix.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-indigo-400/60 bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-800 text-indigo-50 shadow-lg">
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Guided Identifiability Assistant</h2>
              <span className="text-xs inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-slate-700">Advanced</span>
            </div>
            <p className="text-sm text-indigo-100/90">
              Start with a preset to size the analysis, then refine manually. We keep track of the current configuration
              and summarize how your parameter choices map onto reaction rules.
            </p>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-indigo-500/40 bg-indigo-900/40 p-3">
                <div className="text-xs uppercase tracking-wide text-indigo-200/80">Parameters Selected</div>
                <div className="text-lg font-semibold">{selectionSummary.selectedCount} / {selectionSummary.totalParameters}</div>
              </div>
              <div className="rounded-lg border border-indigo-500/40 bg-indigo-900/40 p-3">
                <div className="text-xs uppercase tracking-wide text-indigo-200/80">Rules Touched</div>
                <div className="text-lg font-semibold">{selectionSummary.coveredRules}</div>
                {selectionSummary.exampleRules.length > 0 && (
                  <div className="mt-1 text-xs text-indigo-200/80">
                    e.g. {selectionSummary.exampleRules.join(', ')}
                  </div>
                )}
              </div>
            </div>
            {selectionSummary.uncovered.length > 0 && (
              <div className="rounded-lg border border-rose-400/50 bg-rose-900/40 p-3 text-xs text-rose-100">
                {selectionSummary.uncovered.length} parameter{selectionSummary.uncovered.length === 1 ? '' : 's'}
                {' '}lack a direct rule mapping: {selectionSummary.uncovered.slice(0, 5).join(', ')}
                {selectionSummary.uncovered.length > 5 && ' …'}
              </div>
            )}
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button onClick={() => runPreset('quick')} disabled={isComputing} className="w-full">
              ⚡ Quick Check (~60 sims)
            </Button>
            <Button onClick={() => runPreset('standard')} disabled={isComputing} variant="secondary" className="w-full">
              🎯 Standard Analysis (~300 sims)
            </Button>
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-900/30 p-3 text-xs text-indigo-200/80">
              Active preset: {activePreset === 'quick' ? 'Quick Check' : activePreset === 'standard' ? 'Standard Analysis' : 'Custom'}<br />
              Method: {analysisConfig.method.toUpperCase()} | t_end = {analysisConfig.t_end} | steps = {analysisConfig.n_steps}
            </div>
          </div>
        </div>
      </div>
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Parameters (multi-select)</label>
            <Select multiple size={Math.min(12, Math.max(4, parameterNames.length))} value={selected} onChange={onSelectChange} className="h-40">
              {parameterNames.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <div className="mt-2 text-xs text-slate-500">Selected: {selected.length}</div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-sm text-slate-600">Compute the Fisher Information Matrix (FIM) using central finite differences across all time points. This performs 2×P simulations where P is the number of selected parameters.</div>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useLogParams} onChange={(e) => setUseLogParams(e.target.checked)} />
              <span className="text-sm text-slate-600">Use log-parameter sensitivities (d/d ln p)</span>
            </label>
            <div className="flex gap-2">
              <Button onClick={() => handleCompute()} disabled={isComputing || !model || selected.length === 0}>Run Identifiability Analysis</Button>
              {isComputing && <Button variant="danger" onClick={handleCancel}>Cancel</Button>}
            </div>
            {isComputing && (
              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Computing FIM... {progress.current} / {progress.total} simulations
                  </p>
                  <div className="w-full bg-blue-200 dark:bg-blue-900/40 rounded-full h-2 mt-2">
                    <div 
                      className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all"
                      style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>
        </div>
      </Card>

      {result && (
        <Card className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">Identifiability Analysis Results</h3>
              <div className="text-sm">
                <span title="Ratio of largest to smallest eigenvalue. Higher values indicate numerical instability and ill-conditioning.">
                  Condition number:
                </span>{' '}
                {Number.isFinite(result.conditionNumber) ? result.conditionNumber.toExponential(3) : '∞'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => {
                try {
                  const data = exportFIM(result);
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'fim_analysis.json';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.warn('Failed to export FIM', e);
                }
              }}>Export JSON</Button>
            </div>
          </div>
          {result.benchmark && (
            <div className="text-xs text-slate-500">
              Benchmark: prepareModel {Math.round(result.benchmark.prepareModelMs)} ms · sims {Math.round(result.benchmark.totalSimMs)} ms for {result.benchmark.simCount} runs · total {Math.round(result.benchmark.totalMs)} ms
            </div>
          )}
          <div className="text-xs text-slate-500 text-right">
            Analysis completed: {new Date().toLocaleString()}
            <br />
            Computation time: {result.benchmark?.totalMs ? Math.round(result.benchmark.totalMs) : 'N/A'} ms
          </div>
          {/* Model Diagnostics Summary */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 dark:border-yellow-600 p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">Model Identifiability Summary</h3>
            <div className="grid grid-cols-2 gap-4 mt-2 text-sm text-yellow-900 dark:text-yellow-100">
              <div>
                <span className="font-medium">Condition Number:</span>{' '}
                <span className={result.conditionNumber > 1000 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                  {result.conditionNumber.toExponential(2)}
                </span>
                {result.conditionNumber > 1000 && ' (⚠️ Ill-conditioned)'}
              </div>
              <div>
                <span className="font-medium">Identifiable Params:</span>{' '}
                <span className="text-green-600 dark:text-green-400">{result.identifiableParams?.length || 0}</span>
                {' / '}
                {result.paramNames.length}
              </div>
              <div>
                <span className="font-medium">High VIF Count:</span>{' '}
                <span className="text-red-600 dark:text-red-400">{result.highVIFParams?.length || 0}</span>
                {result.highVIFParams && result.highVIFParams.length > 0 && ' (⚠️ Collinear)'}
              </div>
              <div>
                <span className="font-medium">Max Correlation:</span>{' '}
                <span className="text-red-600 dark:text-red-400">
                  {result.topCorrelatedPairs && result.topCorrelatedPairs.length > 0 ? Math.max(...result.topCorrelatedPairs.map(p => Math.abs(p.corr))).toFixed(3) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Eigenvalue</th>
                  <th className="px-2 py-1 text-left">Top contributors</th>
                </tr>
              </thead>
              <tbody>
                {result.eigenvalues.map((val, idx) => {
                  const vec = result.eigenvectors[idx] ?? [];
                  const pairs = result.paramNames.map((name, i) => ({ name, v: Math.abs(vec[i] ?? 0), signed: vec[i] ?? 0 }));
                  pairs.sort((a, b) => b.v - a.v);
                  const top = pairs.slice(0, 6);
                  const isExpanded = expandedEigen === idx;
                  return (
                    <React.Fragment key={idx}>
                      <tr className="border-t border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setExpandedEigen(isExpanded ? null : idx)}>
                        <td className="px-2 py-1 align-top text-slate-700 dark:text-slate-300">{idx + 1}</td>
                        <td className="px-2 py-1 align-top text-slate-700 dark:text-slate-300">{val.toExponential(3)}</td>
                        <td className="px-2 py-1">
                          <div className="flex flex-wrap gap-2">
                            {top.map((p) => (
                              <div key={p.name} className="flex items-center gap-3">
                                <div className="w-40 truncate text-xs text-slate-600 dark:text-slate-400">{p.name}</div>
                                <div className="text-xs text-slate-600 dark:text-slate-400">{p.signed.toFixed(4)}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50 dark:bg-slate-900">
                          <td colSpan={3} className="px-4 py-3">
                            <div className="mb-2 text-sm font-medium">Eigenvector {idx + 1} — full parameter loadings</div>
                            <div className="text-xs text-slate-500 mb-2">Parameters are sorted by absolute loading. Parameters highlighted are those with |loading| ≥ 20% of the top contributor for this eigenvector.</div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr>
                                    <th className="px-2 py-1 text-left">Parameter</th>
                                    <th className="px-2 py-1 text-left">Loading</th>
                                    <th className="px-2 py-1 text-left">Magnitude</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pairs.map((p) => {
                                    const maxAbs = pairs[0]?.v ?? 1;
                                    const threshold = maxAbs * 0.2;
                                    const isGroup = p.v >= threshold;
                                    const barPct = maxAbs > 0 ? Math.round((p.v / maxAbs) * 100) : 0;
                                    return (
                                      <tr key={p.name} className={isGroup ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}>
                                        <td className="px-2 py-1 align-top w-64 truncate">{p.name}</td>
                                        <td className="px-2 py-1 align-top"><code className="text-xs">{p.signed.toFixed(6)}</code></td>
                                        <td className="px-2 py-1 align-top">
                                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded overflow-hidden">
                                            <div style={{ width: `${barPct}%` }} className="h-3 bg-sky-500" />
                                          </div>
                                          <div className="text-xs text-slate-500 mt-1">{p.v.toExponential(3)} ({barPct}%) {isGroup ? '· group' : ''}</div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Identifiability summary badges */}
          <div className="mt-2 flex gap-3 items-center">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Identifiable</div>
              <div className="flex flex-wrap gap-2 mt-1">
                {result.identifiableParams?.slice(0, 50).map((p) => (
                  <div key={p} className="px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 text-xs font-medium">{p}</div>
                ))}
                {result.identifiableParams && result.identifiableParams.length > 50 && <div className="text-xs text-slate-500 dark:text-slate-400">+{result.identifiableParams.length - 50} more</div>}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Unidentifiable</div>
              <div className="flex flex-wrap gap-2 mt-1">
                {result.unidentifiableParams?.slice(0, 50).map((p) => (
                  <div key={p} className="px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-xs font-medium">{p}</div>
                ))}
                {result.unidentifiableParams && result.unidentifiableParams.length > 50 && <div className="text-xs text-slate-500 dark:text-slate-400">+{result.unidentifiableParams.length - 50} more</div>}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* VIF Table */}
      {result?.vif && (
        <Card className="space-y-3">
          {result.highVIFParams && result.highVIFParams.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-600 p-4 mb-4">
              <p className="text-red-700 dark:text-red-200 font-semibold">⚠️ Severe Multicollinearity Detected</p>
              <p className="text-red-600 dark:text-red-300 text-sm mb-3">
                VIF values above 100 indicate parameters are nearly perfectly correlated.
                This means individual parameter values cannot be uniquely determined, though
                model predictions remain reliable.
              </p>

              <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded p-3">
                <p className="text-sm text-red-700 dark:text-red-300 font-semibold mb-2">General Recommendations:</p>
                <ul className="text-sm text-red-600 dark:text-red-400 space-y-1.5 list-disc list-inside">
                  <li>Use <strong>parameter ratios</strong> instead of individual values where mechanistically appropriate</li>
                  <li>Apply <strong>Bayesian priors</strong> from literature if available</li>
                  <li>Design <strong>new experiments</strong> that independently perturb each pathway</li>
                  <li>Consider <strong>sensitivity analysis</strong> to identify which combinations matter most for your predictions</li>
                </ul>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              📊 <span title="Variance Inflation Factor - measures multicollinearity. Values > 10 indicate severe correlation between parameters.">
                Variance Inflation Factors (VIF)
              </span>
            </h3>
            <button
              onClick={downloadVIF}
              className="text-sm text-teal-600 hover:text-teal-700 underline"
            >
              Export CSV ↓
            </button>
          </div>
          <div className="text-sm text-slate-600">VIF &gt; 10 suggests strong multicollinearity.</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left">Parameter</th>
                  <th className="px-2 py-1 text-left">VIF</th>
                </tr>
              </thead>
              <tbody>
                {result.paramNames.map((name, i) => {
                  const v = result.vif?.[i] ?? 0;
                  const high = Number.isFinite(v) && v > 10;
                  return (
                    <tr key={name} className={`border-t border-slate-200 dark:border-slate-700 ${high ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                      <td className="px-2 py-1 font-mono text-xs text-slate-700 dark:text-slate-300">{name}</td>
                      <td className="px-2 py-1">
                        <div className="flex items-center justify-end gap-2">
                          <span>{Number.isFinite(v) ? v.toFixed(3) : '∞'}</span>
                          {Number.isFinite(v) && v > 1000 && <span className="text-red-500 text-xs">🔴 Extreme</span>}
                          {Number.isFinite(v) && v > 10 && v <= 1000 && <span className="text-orange-500 text-xs">🟠 High</span>}
                          {Number.isFinite(v) && v > 5 && v <= 10 && <span className="text-yellow-500 text-xs">🟡 Moderate</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result && (
        <Card className="space-y-4">
          {/* Summary Statistics Card */}
          <div className="bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-900/20 dark:to-blue-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-6 mb-6 shadow-sm">
            <h3 className="text-xl font-bold text-teal-800 dark:text-teal-200 mb-4">Identifiability Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-800 rounded p-3 shadow-sm">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {result.unidentifiableParams?.length || 0}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 uppercase">Unidentifiable</div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded p-3 shadow-sm">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {result.identifiableParams?.length || 0}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 uppercase">Identifiable</div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded p-3 shadow-sm">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {result.conditionNumber.toExponential(0)}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 uppercase">Condition Number</div>
                <div className="text-xs mt-1">
                  {result.conditionNumber < 100 ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">Well-conditioned</span>
                  ) : result.conditionNumber < 10000 ? (
                    <span className="text-yellow-600 dark:text-yellow-400 font-medium">Moderately ill-conditioned</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400 font-medium">Severely ill-conditioned</span>
                  )}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded p-3 shadow-sm">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {result.nullspaceCombinations?.length || 0}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 uppercase">Problem Combos</div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-white dark:bg-slate-800 rounded border border-teal-200 dark:border-teal-800">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Overall Assessment:</strong>{' '}
                <span className="text-red-600 font-semibold">
                  {result.unidentifiableParams?.length === result.paramNames.length
                    ? 'Severe identifiability issues detected.'
                    : result.identifiableParams?.length === result.paramNames.length
                    ? 'All parameters are identifiable.'
                    : 'Mixed identifiability - some parameters can be estimated.'}
                </span>
                {' '}Model predictions are reliable, but individual parameter values{' '}
                {result.identifiableParams?.length === result.paramNames.length
                  ? 'can be uniquely determined'
                  : 'cannot be uniquely determined'} from current data.
              </p>
            </div>

            {/* Visual Severity Indicator */}
            <div className="mt-4">
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all duration-500"
                  style={{
                    width: `${((result.identifiableParams?.length || 0) / result.paramNames.length) * 100}%`
                  }}
                />
              </div>
              <p className="text-xs text-gray-600 mt-1 text-center">
                Overall Identifiability: {(((result.identifiableParams?.length || 0) / result.paramNames.length) * 100).toFixed(0)}%
              </p>
            </div>

            {/* Eigenvalue Spectrum Mini-Chart */}
            {result.eigenvalues && result.eigenvalues.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Eigenvalue Spectrum</p>
                <div style={{ width: '100%', height: 120 }}>
                  <ResponsiveContainer>
                    <LineChart
                      data={result.eigenvalues.map((ev, i) => ({ index: i + 1, eigenvalue: ev }))}
                      margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                      <XAxis
                        dataKey="index"
                        tick={{ fontSize: 10 }}
                        label={{ value: 'Index', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fontSize: 10 } }}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => Number(v).toExponential(1)}
                        label={{ value: 'Eigenvalue', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 10 } }}
                      />
                      <Tooltip
                        formatter={(value: any) => [Number(value).toExponential(3), 'Eigenvalue']}
                        labelFormatter={(label) => `Index ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="eigenvalue"
                        stroke="#7c3aed"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-gray-600 mt-1 text-center">
                  Small eigenvalues indicate directions of non-identifiability
                </p>
              </div>
            )}

            {/* Quick Fix Action Buttons */}
            <div className="flex gap-2 mt-4">
              <button
                className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 text-sm"
                onClick={() => {
                  const suggestions = [
                    '# Unidentifiable parameters detected:',
                    ...result.unidentifiableParams?.map(p => `# ${p}`) || [],
                    '',
                    '# Suggested approaches:',
                    '# 1. Fix one parameter per null-space combination using literature',
                    '# 2. Reparameterize using ratios where appropriate',
                    '# 3. Use Bayesian inference with informative priors'
                  ].join('\n');
                  navigator.clipboard.writeText(suggestions);
                  alert('General guidance copied to clipboard!');
                }}
              >
                📋 Copy Analysis Summary
              </button>

              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                onClick={() => {
                  const data = exportFIM(result);
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'fim_analysis.json';
                  document.body.appendChild(a);
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                💾 Export Full Analysis
              </button>
            </div>
          </div>

          {/* What's Next Action Items */}
          {result.unidentifiableParams && result.unidentifiableParams.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
              <h3 className="font-semibold text-blue-800 mb-3">
                🎯 Recommended Next Steps
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-blue-700">
                <li>Review <strong>Top Correlated Pairs</strong> to understand which parameters co-vary</li>
                <li>Check <strong>Non-identifiable Combinations</strong> to see which groups are problematic</li>
                <li>Consider fixing one parameter per combination using literature data</li>
                <li>Export results and consult with domain experts about which parameters can be fixed</li>
                <li>Re-run identifiability analysis after making changes to verify improvement</li>
              </ol>
            </div>
          )}

          <h3 className="text-lg font-semibold">🎯 Parameter Identifiability Analysis</h3>
          <div className="text-sm text-slate-600">Analysis of parameter uncertainty and correlations. Non-identifiable parameters appear in combinations that cannot be resolved from the available data.</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left">Parameter</th>
                  <th className="px-2 py-1 text-left">Value</th>
                  <th className="px-2 py-1 text-left">FIM Contribution</th>
                  <th className="px-2 py-1 text-left">Identifiable</th>
                  <th className="px-2 py-1 text-left">Top Correlations</th>
                </tr>
              </thead>
              <tbody>
                {result.paramNames.map((name, idx) => {
                  const paramValue = model?.parameters[name] ?? 0;
                  const correlations = result.correlations[idx] ?? [];
                  const isIdentifiable = result.identifiableParams?.includes(name) ?? false;
                  const corrPairs = result.paramNames.map((n, i) => ({ name: n, corr: Math.abs(correlations[i] ?? 0) })).filter(p => p.name !== name).sort((a, b) => b.corr - a.corr);
                  const topCorr = corrPairs.slice(0, 3);
                  // Calculate FIM contribution percentage
                  const fimDiagonal = result.fimMatrix?.[idx]?.[idx] ?? 0;
                  const totalFimDiagonal = result.fimMatrix?.reduce((sum, row, i) => sum + (row[i] ?? 0), 0) ?? 1;
                  const fimContribution = totalFimDiagonal > 0 ? (fimDiagonal / totalFimDiagonal) * 100 : 0;
                  return (
                    <tr key={name} className="border-t">
                      <td className="px-2 py-1 align-top font-mono text-xs">{name}</td>
                      <td className="px-2 py-1 align-top">{paramValue.toExponential(3)}</td>
                      <td className="px-2 py-1 align-top">{fimContribution.toFixed(1)}%</td>
                      <td className="px-2 py-1 align-top font-medium">
                        {isIdentifiable ? (
                          <span className="text-green-600">✓ Yes</span>
                        ) : (
                          <span className="text-red-600">✗ No</span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex flex-wrap gap-1">
                          {topCorr.map((p) => (
                            <div key={p.name} className="text-xs">
                              {p.name}: {(p.corr * 100).toFixed(0)}%
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* heatmap removed per user request; eigenvalue list and expandable loadings provide correlation info */}
      {result?.nullspaceCombinations && result.nullspaceCombinations.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Non-identifiable parameter combinations</h3>
            <button
              onClick={exportNullSpace}
              className="text-sm text-teal-600 hover:text-teal-700 underline"
            >
              Export CSV ↓
            </button>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="text-blue-600 text-2xl">ℹ️</div>
              <div>
                <h4 className="font-semibold text-blue-800 mb-2">
                  {result.nullspaceCombinations?.length || 0} unidentifiable combination(s) detected
                </h4>
                <p className="text-sm text-blue-700">
                  These parameter combinations cannot be uniquely determined from the
                  available data. Changes along these directions do not affect model predictions.
                </p>
                <p className="text-sm text-blue-700 mt-2">
                  <strong>What to do:</strong> Fix one parameter per combination using
                  literature values, or design experiments that independently perturb each parameter.
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  Threshold: eigenvalues below 0.01% of maximum
                  ({result.eigenvalues && result.eigenvalues.length > 0 ? (Math.max(...result.eigenvalues) * 1e-4).toExponential(1) : '1e-12'})
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            {result.nullspaceCombinations.map((comb, idx) => (
              <div key={idx} className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-gray-50 dark:bg-slate-800">
                <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-3">
                  Combination {idx + 1} — eigenvalue: {comb.eigenvalue.toExponential(2)}
                </h4>

                <div className="grid grid-cols-2 gap-6">
                  {/* Parameter loadings table */}
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Parameter loadings
                    </p>
                    <div className="space-y-1">
                      {comb.components.map((comp, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="font-mono text-slate-700 dark:text-slate-300">{comp.name}</span>
                          <span className="font-mono text-gray-700 dark:text-gray-300">
                            {comp.loading.toFixed(6)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Loading magnitudes bar chart */}
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Loading magnitudes
                    </p>
                    <div className="space-y-2">
                      {comb.components.map((comp, i) => {
                        const maxAbs = Math.max(...comb.components.map(c => Math.abs(c.loading)));
                        const widthPct = (Math.abs(comp.loading) / maxAbs) * 100;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs font-mono w-20 text-right truncate text-slate-600 dark:text-slate-400">
                              {comp.name}
                            </span>
                            <div className="flex-1 bg-gray-200 dark:bg-slate-700 rounded h-5 relative">
                              <div
                                className={`h-full rounded ${
                                  comp.loading > 0 ? 'bg-teal-500' : 'bg-orange-500'
                                }`}
                                style={{ width: `${widthPct}%` }}
                              />
                              <span className="absolute right-2 top-0.5 text-xs font-mono text-gray-700 dark:text-gray-300 mix-blend-difference">
                                {Math.abs(comp.loading).toFixed(3)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Interpretation */}
                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 text-sm">
                  <p className="text-yellow-800 dark:text-yellow-200 mb-2">
                    <strong>What this means:</strong> These {comb.components.length} parameters appear
                    in a linear combination that the data cannot resolve.
                  </p>
                  <p className="text-yellow-700 dark:text-yellow-300">
                    <strong>Options:</strong>
                  </p>
                  <ul className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 space-y-0.5 list-disc list-inside ml-2">
                    <li>Fix one parameter using external data (literature, independent experiments)</li>
                    <li>Reformulate as a ratio if mechanistically justified</li>
                    <li>Accept uncertainty and report parameter ranges instead of point estimates</li>
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result?.topCorrelatedPairs && result.topCorrelatedPairs.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              🔗 <span title="Parameters with high absolute correlation values (>0.8) may be difficult to estimate independently.">
                Top correlated parameter pairs
              </span>
            </h3>
            <button
              onClick={downloadCorrelations}
              className="text-sm text-teal-600 hover:text-teal-700 underline"
            >
              Export CSV ↓
            </button>
          </div>
          <div className="text-sm text-slate-600">Strong correlations (by absolute Pearson correlation from covariance) suggest parameters that co-vary and may be difficult to estimate independently.</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Parameter A</th>
                  <th className="px-2 py-1 text-left">Parameter B</th>
                  <th className="px-2 py-1 text-left">Correlation</th>
                </tr>
              </thead>
              <tbody>
                {result.topCorrelatedPairs.map((p, i) => (
                  <tr key={`${p.names[0]}-${p.names[1]}`} className={`border-t ${Math.abs(p.corr) > 0.95 ? 'bg-red-50' : ''}`}>
                    <td className="px-2 py-1 align-top">{i + 1}</td>
                    <td className="px-2 py-1 align-top font-mono text-xs">{p.names[0]}</td>
                    <td className="px-2 py-1 align-top font-mono text-xs">{p.names[1]}</td>
                    <td className="px-2 py-1 align-top font-medium">
                      <span className={Math.abs(p.corr) > 0.95 ? 'text-red-600 font-bold' : ''}>
                        {(p.corr).toFixed(3)}
                        {Math.abs(p.corr) > 0.95 && ' ⚠️'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Profile plots with CIs */}
      {result?.profileApproxExtended && Object.keys(result.profileApproxExtended).length > 0 && (
        <Card className="space-y-3">
          <h3 className="text-lg font-semibold">Profile plots (approx)</h3>
          <div className="text-sm text-slate-600">SSR vs parameter grid for profiled parameters. Shaded region shows approximate confidence interval (χ², df=1).</div>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {Object.entries(result.profileApproxExtended).slice(0, 6).map(([name, infoRaw]) => {
              const info = infoRaw as {
                grid: number[];
                ssr: number[];
                min: number;
                flat: boolean;
                alpha: number;
                ci?: { lower: number; upper: number };
              };
              const data = info.grid.map((g, i) => ({ x: g, y: info.ssr[i] }));
              const lower = info.ci?.lower;
              const upper = info.ci?.upper;
              return (
                <div key={name} className="p-2">
                  <div className="text-sm font-medium mb-1">{name}</div>
                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer>
                      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                        <XAxis dataKey="x" tickFormatter={(v) => Number(v).toFixed(3)} />
                        <YAxis />
                        <Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(6) : v)} />
                        {lower !== undefined && upper !== undefined && (
                          <ReferenceArea x1={lower} x2={upper} strokeOpacity={0.1} fill="#a7f3d0" fillOpacity={0.35} />
                        )}
                        <Line type="monotone" dataKey="y" stroke="#4E79A7" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* FIM heatmap */}
      {result?.fimMatrix && (
        <Card className="space-y-3">
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button 
              onClick={() => setShowFIMHeatmap(!showFIMHeatmap)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200"
            >
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Fisher Information Matrix (heatmap)</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadFIMMatrix();
                  }}
                  className="text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 underline"
                >
                  Export CSV ↓
                </button>
              </div>
              <span className="text-xl">{showFIMHeatmap ? '▼' : '▶'}</span>
            </button>
            {showFIMHeatmap && (
              <div className="p-4 bg-white text-slate-900 border-t border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="text-sm text-slate-600">Raw Fisher Information Matrix (rows/cols = parameters). Colors indicate magnitude.</div>
                <div className="overflow-auto mt-2">
                  <div className="inline-block align-top">
                    <table className="border-collapse" style={{ borderSpacing: 0 }}>
                      <thead>
                        <tr>
                          <th className="px-2 py-1" />
                          {result.paramNames.map((p) => (
                            <th key={p} className="px-2 py-1 text-xs font-mono">{p}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.fimMatrix.map((row, i) => {
                          const maxVal = Math.max(...row.map((v) => Math.abs(v)));
                          return (
                            <tr key={i} className="align-top">
                              <td className="px-2 py-1 text-xs font-mono">{result.paramNames[i]}</td>
                              {row.map((v, j) => {
                                const mag = Math.abs(v);
                                // normalize on row-wise max to get visible colors
                                const pct = maxVal > 0 ? Math.min(1, mag / maxVal) : 0;
                                // Use red scale: high values dark red, low light
                                const red = Math.round(240 - pct * 140);
                                const bg = `rgb(${red},240,240)`;
                                return (
                                  <td key={j} className="px-1 py-1 text-xs" style={{ background: bg }}>
                                    <div className="px-2">{v.toExponential(2)}</div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Correlation heatmap */}
      {result?.correlations && (
        <Card className="space-y-3">
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button 
              onClick={() => setShowCorrelationHeatmap(!showCorrelationHeatmap)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200"
            >
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Parameter correlations (heatmap)</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadCorrelations();
                  }}
                  className="text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 underline"
                >
                  Export CSV ↓
                </button>
              </div>
              <span className="text-xl">{showCorrelationHeatmap ? '▼' : '▶'}</span>
            </button>
            {showCorrelationHeatmap && (
              <div className="p-4 bg-white text-slate-900 border-t border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="text-sm text-slate-600">Pearson correlations between parameter estimates. Red indicates strong correlations (potential identifiability issues).</div>
                <div className="overflow-auto mt-2">
                  <div className="inline-block align-top">
                    <FIMHeatmap correlations={result.correlations} paramNames={result.paramNames} cellSize={26} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Jacobian heatmap (truncated if large) */}
      {result?.jacobian && (
        <Card className="space-y-3">
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button 
              onClick={() => setShowJacobianHeatmap(!showJacobianHeatmap)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200"
            >
              <h3 className="font-semibold">Jacobian (sensitivity) heatmap</h3>
              <span className="text-xl">{showJacobianHeatmap ? '▼' : '▶'}</span>
            </button>
            {showJacobianHeatmap && (
              <div className="p-4 bg-white text-slate-900 border-t border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="text-sm text-slate-600">Rows: observables×time, Columns: parameters. Showing first 20 rows for readability.</div>
                <div className="overflow-auto mt-2">
                  <table className="border-collapse" style={{ borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th className="px-2 py-1">#</th>
                        {result.paramNames.map((p) => (
                          <th key={p} className="px-2 py-1 text-xs font-mono">{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.jacobian.slice(0, 20).map((row, ri) => (
                        <tr key={ri} className="align-top border-t">
                          <td className="px-2 py-1 text-xs">{ri + 1}</td>
                          {row.map((v, j) => {
                            const mag = Math.abs(v);
                            const pct = Math.min(1, mag / 1); // simple scale
                            const gray = Math.round(240 - Math.min(220, pct * 220));
                            const bg = `rgb(255,${gray},${gray})`;
                            return (
                              <td key={j} className="px-1 py-1 text-xs" style={{ background: bg }}>
                                <div className="px-2">{v.toExponential(2)}</div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Interpretation Guide */}
      <details className="border border-gray-200 rounded-lg p-4 mt-6">
        <summary className="font-semibold cursor-pointer">
          📖 How to interpret these results
        </summary>
        <div className="mt-3 space-y-3 text-sm text-gray-700">
          <div>
            <strong className="text-teal-700">Condition Number:</strong>
            <ul className="ml-4 mt-1 list-disc">
              <li>&lt; 100: Well-conditioned (good)</li>
              <li>100 - 10,000: Moderately ill-conditioned</li>
              <li>&gt; 10,000: Severely ill-conditioned (problematic)</li>
            </ul>
          </div>
          <div>
            <strong className="text-teal-700">VIF (Variance Inflation Factor):</strong>
            <ul className="ml-4 mt-1 list-disc">
              <li>&lt; 5: No multicollinearity</li>
              <li>5 - 10: Moderate multicollinearity</li>
              <li>&gt; 10: High multicollinearity (fix required)</li>
            </ul>
          </div>
          <div>
            <strong className="text-teal-700">Parameter Correlations:</strong>
            <ul className="ml-4 mt-1 list-disc">
              <li>Close to ±1: Parameters are highly correlated</li>
              <li>Close to 0: Parameters are independent</li>
            </ul>
          </div>
          <div>
            <strong className="text-teal-700">Identifiability:</strong>
            <ul className="ml-4 mt-1 list-disc">
              <li>Identifiable parameters can be uniquely estimated from data</li>
              <li>Unidentifiable parameters appear in combinations that don't affect predictions</li>
              <li>Fix one parameter per unidentifiable combination using external data</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">
          <a 
            href="https://en.wikipedia.org/wiki/Identifiability_analysis" 
            target="_blank"
            className="text-teal-600 hover:underline"
          >
            Learn more about identifiability analysis →
          </a>
        </p>
      </details>

      {/* Scroll to Top Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 bg-teal-600 hover:bg-teal-700 text-white p-3 rounded-full shadow-lg transition-all duration-200 z-10"
        title="Scroll to top"
      >
        ↑
      </button>
    </div>
  );
};

export default FIMTab;

