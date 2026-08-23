import React, { useState, useMemo } from 'react';
import { BNGLModel } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { StatusMessage } from '../ui/StatusMessage';
import { sobolSensitivity, SobolResult } from '@bngplayground/engine';
import { bnglService } from '../../services/bnglService';
import { formatValue } from '../../src/utils/formatValue';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ErrorBar,
  ReferenceLine
} from 'recharts';

interface SobolSensitivityTabProps {
  model: BNGLModel | null;
}

export const SobolSensitivityTab: React.FC<SobolSensitivityTabProps> = ({ model }) => {

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<SobolResult[] | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // Configuration
  const [nSamples, setNSamples] = useState(256);
  const [logScale, setLogScale] = useState(false);
  const [selectedObs, setSelectedObs] = useState<string>('');

  // Parameter selection
  const [paramBounds, setParamBounds] = useState<Record<string, { min: number; max: number; active: boolean }>>({});

  // Initialize parameter bounds if not set
  React.useEffect(() => {
    if (model && Object.keys(paramBounds).length === 0) {
      const initial: typeof paramBounds = {};
      Object.entries(model.parameters).forEach(([name, value]) => {
        initial[name] = {
          min: value * 0.1,
          max: value * 10,
          active: true
        };
      });
      setParamBounds(initial);
      if (model.observables.length > 0) {
        setSelectedObs(model.observables[0].name);
      }
    }
  }, [model]);

  const activeParams = useMemo(() => {
    return Object.entries(paramBounds)
      .filter(([_, b]) => b.active)
      .map(([name, b]) => ({ name, min: b.min, max: b.max }));
  }, [paramBounds]);

  const handleRun = async () => {
    if (!model || activeParams.length === 0) return;

    setIsAnalyzing(true);
    setError(null);
    setResults(null);
    setProgress({ current: 0, total: 0 });

    try {
      const abortController = new AbortController();

      // Prepare model for efficient repeated simulations
      const modelId = await bnglService.prepareModel(model, { signal: abortController.signal });

      const simulate = async (overrides: Record<string, number>) => {
        const results = await bnglService.simulateCached(modelId, overrides, {
          method: 'ode',
          t_end: 100, // Default for sensitivity
          n_steps: 10, // Few steps needed for t_end value
          includeSpeciesData: false,
          includeExpandedNetwork: false,
        }, { signal: abortController.signal });
        return { data: results.data };
      };

      const res = await sobolSensitivity({
        simulate,
        params: activeParams,
        N: nSamples,
        logScale,
        observables: [selectedObs],
        onProgress: (current, total) => setProgress({ current, total }),
        signal: abortController.signal
      });

      setResults(res);
      
      // Cleanup
      await bnglService.releaseModel(modelId).catch(() => {});
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Analysis failed');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const chartData = useMemo(() => {
    if (!results || results.length === 0) return [];
    
    const res = results[0]; // Currently only analyzing one observable
    return res.firstOrder.map((s1, i) => {
      const st = res.totalOrder[i];
      // Recharts ErrorBar expects [low_offset, high_offset]
      // where low_offset is subtracted from value and high_offset is added.
      // Since our engine returns [abs_lower, abs_upper], we convert here.
      return {
        name: s1.name,
        S1: s1.value,
        S1_CI: [Math.max(0, s1.value - s1.ci[0]), Math.max(0, s1.ci[1] - s1.value)],
        ST: st.value,
        ST_CI: [Math.max(0, st.value - st.ci[0]), Math.max(0, st.ci[1] - st.value)]
      };
    });
  }, [results]);

  if (!model) return null;

  return (
    <div className="flex flex-col xl:flex-row gap-6 h-full overflow-hidden">
      {/* Sidebar: Configuration */}
      <div className="w-full xl:w-80 flex flex-col gap-6 overflow-y-auto pr-2">
        <Card className="p-5 border-t-4 border-t-amber-500 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-widest">Sobol Config</h3>
            <div className={`w-2 h-2 rounded-full ${isAnalyzing ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`} />
          </div>
          
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sobol-base-samples" className="text-xs font-bold text-slate-500 dark:text-slate-400">Base Samples (N)</label>
              <select 
                id="sobol-base-samples"
                value={nSamples} 
                onChange={e => setNSamples(Number(e.target.value))}
                className="bg-white dark:bg-slate-900 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all cursor-pointer"
                disabled={isAnalyzing}
              >
                <option value={64}>64 (Fastest)</option>
                <option value={128}>128 (Good)</option>
                <option value={256}>256 (Better)</option>
                <option value={512}>512 (Recommended)</option>
                <option value={1024}>1024 (Solid)</option>
              </select>
              <p className="text-[10px] text-slate-400">Total simulations: {formatValue(nSamples * (2 + activeParams.length))}</p>
            </div>

            <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 cursor-pointer border border-transparent hover:border-slate-200 dark:border-slate-700 transition-all">
              <input 
                type="checkbox" 
                checked={logScale} 
                onChange={e => setLogScale(e.target.checked)}
                disabled={isAnalyzing}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Log-Uniform</span>
                <span className="text-[10px] text-slate-400">Sample across orders of magnitude.</span>
              </div>
            </label>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="sobol-focus-obs" className="text-xs font-bold text-slate-500 dark:text-slate-400">Focus Observable</label>
              <select
                id="sobol-focus-obs"
                value={selectedObs}
                onChange={e => setSelectedObs(e.target.value)}
                className="bg-white dark:bg-slate-900 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all cursor-pointer"
                disabled={isAnalyzing}
              >
                {model.observables.map(o => (
                  <option key={o.name} value={o.name}>{o.name}</option>
                ))}
              </select>
            </div>

            <Button 
              onClick={handleRun} 
              disabled={isAnalyzing || activeParams.length === 0}
              className="w-full h-10 font-bold bg-amber-600 hover:bg-amber-700 active:scale-[0.98] transition-all shadow-md mt-2"
            >
              {isAnalyzing ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner className="w-4 h-4" />
                  <span>{progress.current}/{progress.total}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                    <span>📊</span>
                    <span>Start Analysis</span>
                </div>
              )}
            </Button>

            {isAnalyzing && progress.total > 0 && (
              <div className="mt-4 p-4 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-800/50" role="progressbar" aria-valuenow={progress.current} aria-valuemin={0} aria-valuemax={progress.total} aria-label="Sobol analysis progress">
                <div className="flex justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400 mb-2">
                  <span>Simulation Sweep</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full transition-all duration-300 ease-out" 
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4">
                <StatusMessage status={{ type: 'error', message: error }} onClose={() => setError(null)} />
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5 flex flex-col min-h-[400px] overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-widest">Parameters</h3>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800 px-2 py-0.5 rounded font-bold">{activeParams.length} Selected</span>
          </div>
          <div className="overflow-y-auto flex-1 -mr-2 pr-2 space-y-1">
            {Object.entries(model.parameters).map(([name, value]) => {
              const b = paramBounds[name] || { min: 0, max: 0, active: false };
              return (
                <div 
                  key={name} 
                  className={`group flex flex-col gap-2 p-3 rounded-lg border transition-all ${
                    b.active 
                      ? 'border-amber-200 bg-amber-50/20 dark:border-amber-800/30' 
                      : 'border-transparent opacity-60 hover:bg-slate-50 dark:bg-slate-900/50'
                  }`}
                >
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        checked={b.active}
                        onChange={e => setParamBounds(prev => ({...prev, [name]: {...prev[name], active: e.target.checked}}))}
                        disabled={isAnalyzing}
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-mono font-bold truncate max-w-[120px]">{name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{formatValue(value)}</span>
                  </label>
                  
                  {b.active && (
                    <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                      <input 
                        type="number" 
                        value={b.min}
                        onChange={e => setParamBounds(prev => ({...prev, [name]: {...prev[name], min: Number(e.target.value)}}))}
                        className="w-full text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:ring-1 focus:ring-amber-300 outline-none"
                        disabled={isAnalyzing}
                        aria-label={`${name} min`}
                      />
                      <span className="text-[10px] font-bold text-slate-300">→</span>
                      <input 
                        type="number" 
                        value={b.max}
                        onChange={e => setParamBounds(prev => ({...prev, [name]: {...prev[name], max: Number(e.target.value)}}))}
                        className="w-full text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:ring-1 focus:ring-amber-300 outline-none"
                        disabled={isAnalyzing}
                        aria-label={`${name} max`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
        {results ? (
          <div className="space-y-6 pb-6">
            <Card className="p-6 shadow-xl border-t-4 border-t-amber-500 overflow-hidden relative">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/5 rounded-full blur-3xl" />
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Sobol Indices</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold text-slate-400">Observable:</span>
                    <span className="text-xs font-mono font-black text-amber-600">{results[0].observable}</span>
                  </div>
                </div>
                <div className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800 px-3 py-1 rounded-full text-slate-500 dark:text-slate-400">
                  N = {formatValue(nSamples)} Samples
                </div>
              </div>

              <div className="h-[450px] w-full bg-slate-50 dark:bg-slate-900/50/50 dark:bg-slate-900/30 rounded-2xl p-6 border border-slate-100 dark:border-slate-800">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }} barGap={0}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      interval={0}
                      fontSize={11}
                      stroke="#94a3b8"
                      fontWeight="bold"
                    />
                    <YAxis 
                      domain={[0, 1.1]} 
                      fontSize={11} 
                      stroke="#94a3b8" 
                      fontWeight="bold"
                      tickFormatter={(v) => v.toFixed(2)}
                      label={{ value: 'Index Magnitude', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }}
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }}
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ fontWeight: 'bold' }}
                      formatter={(v) => [formatValue(typeof v === 'number' ? v : Number(v ?? 0)), 'Index']}
                    />
                    <Legend 
                      verticalAlign="top" 
                      align="right" 
                      wrapperStyle={{ paddingBottom: '30px', fontSize: '11px', fontWeight: 'bold' }} 
                    />
                    <Bar dataKey="S1" name="First-order (S1)" fill="#F59E0B" radius={[4, 4, 0, 0]}>
                      {chartData.map((_entry, index) => (
                        <Cell key={`cell-s1-${index}`} fillOpacity={0.9} />
                      ))}
                      <ErrorBar dataKey="S1_CI" width={4} strokeWidth={2} stroke="#B45309" />
                    </Bar>
                    <Bar dataKey="ST" name="Total-order (ST)" fill="#94A3B8" radius={[4, 4, 0, 0]}>
                      {chartData.map((_entry, index) => (
                        <Cell key={`cell-st-${index}`} fillOpacity={0.4} />
                      ))}
                      <ErrorBar dataKey="ST_CI" width={4} strokeWidth={2} stroke="#475569" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 bg-amber-50/30 border-l-4 border-l-amber-500">
                <h4 className="font-black text-amber-800 dark:text-amber-400 mb-3 uppercase tracking-widest text-xs">First-Order Analysis (S1)</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Measures the <strong>direct contribution</strong> of each parameter to the variance of the observable. 
                  High S1 indicates a "dominant" parameter. If the sum of all S1 is close to 1, the model is predominantly additive.
                </p>
                <div className="mt-4 space-y-2">
                   {[...chartData].sort((a,b) => b.S1 - a.S1).slice(0, 3).map(d => (
                     <div key={d.name} className="flex justify-between items-center bg-white dark:bg-slate-900 dark:bg-slate-800 p-2 rounded border border-amber-100 dark:border-amber-900/40">
                       <span className="font-mono text-[10px] font-bold">{d.name}</span>
                       <span className="text-[10px] font-black text-amber-600">{formatValue(d.S1)}</span>
                     </div>
                   ))}
                </div>
              </Card>

              <Card className="p-6 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 border-l-4 border-l-slate-400">
                <h4 className="font-black text-slate-800 dark:text-slate-200 mb-3 uppercase tracking-widest text-xs">Interaction Analysis (ST - S1)</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Total-order (ST) includes S1 <strong>plus all interaction effects</strong>. 
                  A large gap between ST and S1 suggests the parameter influences the model through non-linear coupling with other variables.
                </p>
                <div className="mt-4 space-y-2">
                   {[...chartData].sort((a,b) => (b.ST - b.S1) - (a.ST - a.S1)).slice(0, 3).map(d => (
                     <div key={d.name} className="flex justify-between items-center bg-white dark:bg-slate-900 dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 dark:border-slate-700">
                       <span className="font-mono text-[10px] font-bold">{d.name}</span>
                       <span className="text-[10px] font-black text-slate-500 dark:text-slate-400">Δ {formatValue(d.ST - d.S1)}</span>
                     </div>
                   ))}
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <EmptyState 
            icon={<div className="text-4xl text-amber-500">⚖️</div>}
            title="Global Sensitivity Analysis"
            description="Sobol indices identify which parameters most strongly influence your model's behavior through variance decomposition."
            action={{
              label: "Start Analysis",
              onClick: () => handleRun(),
              icon: <span>⚡</span>
            }}
          />
        )}
      </div>
    </div>
  );
};
