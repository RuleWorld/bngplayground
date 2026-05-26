import { secureRandom } from "../../src/utils/secureRandom";
import React, { useMemo, useState } from 'react';
import { bnglService } from '../../services/bnglService';
import { ABCSMCProgress, abcSMC } from '@bngplayground/engine';
import { BNGLModel } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { parseExperimentalData } from '../../src/services/data/experimentalData';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { formatValue } from '../../src/utils/formatValue';

interface ABCSMCTabProps {
  model: BNGLModel | null;
}

const DEFAULT_DATA = `time, A, B
0, 100, 0
10, 60, 40
20, 36, 64
30, 22, 78
50, 8, 92`;

export const ABCSMCTab: React.FC<ABCSMCTabProps> = ({ model }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState<ABCSMCProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Configuration
  const [nParticles, setNParticles] = useState(200);
  const [nPopulations, setNPopulations] = useState(5);
  const [dataInput, setDataInput] = useState(DEFAULT_DATA);
  const [priors, setPriors] = useState<Record<string, { min: number, max: number, active: boolean }>>({});

  // Initialize priors from model parameters
  React.useEffect(() => {
    if (model && Object.keys(priors).length === 0) {
      const initial: Record<string, { min: number, max: number, active: boolean }> = {};
      Object.entries(model.parameters).forEach(([name, value]) => {
        initial[name] = {
          min: value / 10,
          max: value * 10,
          active: name === 'ka' || name === 'kd' || name.endsWith('0') // Guessing defaults
        };
      });
      setPriors(initial);
    }
  }, [model]);

  const activePriors = useMemo(() => {
    return Object.entries(priors)
      .filter(([_, p]) => p.active)
      .map(([name, p]) => ({ 
        name, 
        distribution: 'uniform' as const, 
        min: p.min, 
        max: p.max 
      }));
  }, [priors]);

  const { parsedData, dataError } = useMemo(() => {
    if (!dataInput.trim()) return { parsedData: [], dataError: null };
    try {
      return { parsedData: parseExperimentalData(dataInput), dataError: null };
    } catch (err: any) {
      return { parsedData: [], dataError: err.message };
    }
  }, [dataInput]);

  const observableNames = useMemo(() => (model ? model.observables.map(o => o.name) : []), [model]);
  const dataObsNames = useMemo(() => (parsedData.length > 0 ? Object.keys(parsedData[0].values) : []), [parsedData]);
  const sharedObsNames = useMemo(() => dataObsNames.filter(n => observableNames.includes(n)), [dataObsNames, observableNames]);

  const canRun = activePriors.length > 0 && parsedData.length > 0 && sharedObsNames.length > 0 && !isRunning && !dataError;

  const handleRun = async () => {
    if (!model || !canRun) return;
    const simulationOptions = model.simulationOptions ?? {};

    setIsRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);

    try {
      const abortController = new AbortController();
      
      // Prepare model for efficiency
      const modelId = await bnglService.prepareModel(model);
      
      const simulate = async (overrides: Record<string, number>) => {
        // Run a short simulation to get the predicted values at experimental timepoints
        const simResults = await bnglService.simulateCached(modelId, overrides, {
          method: 'ode',
          t_end: Math.max(...parsedData.map(d => d.time)),
          n_steps: 20 // The ABC algorithm will interpolate or we can just use enough steps
        });
        return { data: simResults.data };
      };

      const res = await abcSMC({
        simulate,
        experimentalData: parsedData,
        priors: activePriors,
        nParticles,
        nPopulations,
        onProgress: (p) => setProgress(p),
        signal: abortController.signal
      });

      setResult(res);
      await bnglService.releaseModel(modelId).catch(() => {});
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || "Bayesian inference failed");
      }
    } finally {
      setIsRunning(false);
    }
  };

  const chartData = useMemo(() => {
    if (!result) return {};
    
    const marginals: Record<string, any[]> = {};
    
    Object.entries(result.marginals).forEach(([name, samples]) => {
      const samplesTyped = samples as number[];
      const nBins = 30;
      const min = Math.min(...samplesTyped);
      const max = Math.max(...samplesTyped);
      const binWidth = (max - min) / nBins;
      const bins = new Array(nBins).fill(0).map((_, i) => ({
        x: min + (i + 0.5) * binWidth,
        count: 0
      }));
      
      samplesTyped.forEach(s => {
        const b = Math.min(nBins - 1, Math.floor((s - min) / binWidth));
        if (b >= 0) bins[b].count++;
      });
      marginals[name] = bins;
    });
    
    return marginals;
  }, [result]);

  const [visibleParam, setVisibleParam] = useState<string | null>(null);

  React.useEffect(() => {
    if (result && !visibleParam) {
      setVisibleParam(activePriors[0]?.name);
    }
  }, [result, activePriors, visibleParam]);

  if (!model) return null;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
      {/* Sidebar: Configuration */}
      <div className="w-full lg:w-80 flex flex-col gap-6 overflow-y-auto lg:pr-2 flex-shrink-0">
        <Card className="p-5 border-t-4 border-t-indigo-500 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm uppercase tracking-tight">ABC-SMC Control</h3>
            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`} />
          </div>
          
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Particle Count</label>
              <Input 
                type="number" 
                value={nParticles} 
                onChange={e => setNParticles(Number(e.target.value))}
                disabled={isRunning}
                className="h-9"
              />
              <p className="text-[10px] text-slate-400">Higher = better resolution, slower run.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Populations</label>
              <Input 
                type="number" 
                value={nPopulations} 
                onChange={e => setNPopulations(Number(e.target.value))}
                disabled={isRunning}
                className="h-9"
              />
              <p className="text-[10px] text-slate-400">Number of tolerance reduction steps.</p>
            </div>

            <Button 
              onClick={handleRun} 
              disabled={!canRun} 
              className="w-full h-10 mt-2 font-bold bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all"
            >
              {isRunning ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner className="w-4 h-4" />
                  <span>Processing...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚡</span>
                  <span>Start Inference</span>
                </div>
              )}
            </Button>
            
            {!isRunning && activePriors.length > 0 && parsedData.length > 0 && sharedObsNames.length === 0 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 font-medium">
                ⚠️ Cannot run: The experimental data has no observables that match the current model. Check the column names!
              </p>
            )}

            {isRunning && progress && (
              <div className="mt-4 p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                <div className="flex justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-400 mb-2">
                  <span>Pop {progress.population + 1} / {progress.totalPopulations}</span>
                  <span>Dist: {formatValue(progress.bestDistance)}</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-500 h-full transition-all duration-500 ease-out" 
                    style={{ width: `${((progress.population + 1) / progress.totalPopulations) * 100}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <div className="flex justify-between font-mono">
                    <span>Simulations:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{progress.nSimulations.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span>Acceptance Rate:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {progress.nSimulations > 0 ? ((nParticles / progress.nSimulations) * 100).toFixed(2) : '0'}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium animate-in fade-in slide-in-from-top-1">
                ⚠️ {error}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5 flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm uppercase tracking-tight">Priors Configuration</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800 rounded">{activePriors.length} Selected</span>
          </div>
          
          <div className="overflow-y-auto flex-1 -mr-2 pr-2 space-y-1">
            {Object.entries(model.parameters).map(([name, value]) => {
              const spec = priors[name] || { min: 0, max: 0, active: false };
              return (
                <div 
                  key={name} 
                  className={`group flex flex-col gap-2 p-3 rounded-lg border transition-all ${
                    spec.active 
                      ? 'border-indigo-200 bg-indigo-50/20 dark:border-indigo-800/30' 
                      : 'border-transparent opacity-60 grayscale hover:grayscale-0 hover:bg-slate-50 dark:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={spec.active}
                        onChange={e => setPriors(prev => ({...prev, [name]: {...prev[name], active: e.target.checked}}))}
                        disabled={isRunning}
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-mono font-bold truncate max-w-[120px]">{name}</span>
                    </label>
                    <span className="text-[10px] font-mono text-slate-400">cur: {formatValue(value)}</span>
                  </div>
                  
                  {spec.active && (
                    <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex-1">
                        <input 
                          type="number" 
                          value={spec.min}
                          onChange={e => setPriors(prev => ({...prev, [name]: {...prev[name], min: Number(e.target.value)}}))}
                          className="w-full text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:ring-1 focus:ring-indigo-300 outline-none"
                          disabled={isRunning}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-300">to</span>
                      <div className="flex-1">
                        <input 
                          type="number" 
                          value={spec.max}
                          onChange={e => setPriors(prev => ({...prev, [name]: {...prev[name], max: Number(e.target.value)}}))}
                          className="w-full text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:ring-1 focus:ring-indigo-300 outline-none"
                          disabled={isRunning}
                        />
                      </div>
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
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Experimental Data Editor
            </h3>
            <div className="flex gap-2">
                 <Button 
                   variant="subtle" 
                   className="h-6 px-2 text-[10px]" 
                   onClick={async () => {
                     if (!model) return;
                     try {
                       const simulationOptions = model.simulationOptions ?? {};
                       const modelId = await bnglService.prepareModel(model);
                       const res = await bnglService.simulateCached(modelId, {}, {
                         method: 'ode',
                        t_end: simulationOptions.t_end || 10,
                        n_steps: simulationOptions.n_steps || 100,
                       });
                       
                       const obsNames = model.observables.map(o => o.name);
                       let csv = `time, ${obsNames.join(', ')}\n`;
                       
                       const totalPoints = res.data.length;
                       const step = Math.max(1, Math.floor((totalPoints - 1) / 9));
                       
                       const selectedIndices = [];
                       for (let i = 0; i < totalPoints; i += step) selectedIndices.push(i);
                       if (selectedIndices[selectedIndices.length - 1] !== totalPoints - 1) {
                          if (selectedIndices.length >= 10) selectedIndices[selectedIndices.length - 1] = totalPoints - 1;
                          else selectedIndices.push(totalPoints - 1);
                       }
                       
                       for (const idx of selectedIndices) {
                         const row = res.data[idx];
                         const rowVals = [row.time.toFixed(4)];
                         for (const name of obsNames) {
                            const exact = row[name] ?? 0;
                            // +/- 2.5% random noise
                            const noisy = exact * (1 + (secureRandom() - 0.5) * 0.05);
                            rowVals.push(noisy.toFixed(4));
                         }
                         csv += rowVals.join(', ') + '\n';
                       }
                       
                       setDataInput(csv);
                     } catch (e) {
                       console.error("Auto-generate failed", e);
                       setDataInput(DEFAULT_DATA); 
                     }
                   }}
                 >
                   Auto-Generate
                 </Button>
                 <Button variant="subtle" className="h-6 px-2 text-[10px]" onClick={() => setDataInput('')}>Clear</Button>
            </div>
          </div>
          <textarea
            value={dataInput}
            onChange={e => setDataInput(e.target.value)}
            className="w-full h-32 p-3 font-mono text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-teal-500 outline-none resize-none"
            spellCheck={false}
            placeholder="# time, Obs1, Obs2..."
            disabled={isRunning}
          />
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500 dark:text-slate-400">Observables: {observableNames.join(', ')}</span>
            {dataError ? (
              <span className="text-red-500 font-bold">{dataError}</span>
            ) : parsedData.length > 0 ? (
              <span className={`font-bold ${sharedObsNames.length > 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
                {sharedObsNames.length > 0 ? `✓ ${parsedData.length} TP | ${sharedObsNames.length} Matching Obs` : `⚠️ No matching observables!`}
              </span>
            ) : <span className="text-slate-400">No data parsed</span>}
          </div>
        </Card>

        {result ? (
          <div className="space-y-6 pb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <Card className="p-6 shadow-lg border-t-4 border-t-indigo-500">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Posterior Distribution</h4>
                      <div className="flex items-center gap-2">
                         <label className="text-xs font-bold text-slate-400">View Parameter:</label>
                         <select 
                            value={visibleParam || ''} 
                            onChange={e => setVisibleParam(e.target.value)}
                            className="bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800 border-none rounded px-3 py-1.5 text-xs font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors outline-none"
                         >
                           {activePriors.map(p => (
                             <option key={p.name} value={p.name}>{p.name}</option>
                           ))}
                         </select>
                      </div>
                    </div>
                    
                    <div className="h-[300px] w-full mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData[visibleParam || ''] || []} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                          <defs>
                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="x" 
                            type="number" 
                            scale="log" 
                            domain={['auto', 'auto']} 
                            fontSize={11}
                            axisLine={false}
                            tickLine={false}
                            label={{ value: 'Parameter Value', position: 'bottom', offset: 0, fontSize: 11, fontWeight: 'bold', fill: '#94a3b8' }} 
                            tickFormatter={v => formatValue(v)}
                          />
                          <YAxis 
                            fontSize={11}
                            axisLine={false}
                            tickLine={false}
                            label={{ value: 'Density', angle: -90, position: 'insideLeft', fontSize: 11, fontWeight: 'bold', fill: '#94a3b8' }} 
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                            itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                            formatter={(val) => [typeof val === 'number' ? val.toFixed(4) : String(val ?? ''), 'Density']}
                            labelFormatter={(val) => `Value: ${formatValue(typeof val === 'number' ? val : Number(val ?? 0))}`}
                          />
                          <Line 
                            type="stepAfter" 
                            dataKey="count" 
                            stroke="#6366f1" 
                            strokeWidth={3} 
                            dot={false} 
                            animationDuration={1500}
                            fill="url(#colorCount)"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="p-6 border-l-4 border-l-indigo-500 shadow-xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Inference Metrics</h3>
                      <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-full text-[10px] font-bold ring-1 ring-indigo-200 uppercase">
                        {nParticles} Particles × {nPopulations} Pops
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Final Tolerance</div>
                          <div className="text-xl font-mono font-black text-indigo-600 dark:text-indigo-400 truncate">
                            {formatValue(result.finalTolerance)}
                          </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Simulations</div>
                          <div className="text-xl font-mono font-black text-slate-700 dark:text-slate-200">
                            {result.totalSimulations.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Posterior Trend
                        </h4>
                        <div className="space-y-2">
                          {Object.entries(result.posteriorSummary as Record<string, any>).slice(0, 3).map(([name, stats]) => (
                            <div key={name} className="flex flex-col gap-1">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{name}</span>
                                <span className="text-slate-400">Mean: {formatValue(stats.mean)}</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800 h-1 rounded-full relative overflow-hidden">
                                {(() => {
                                  const spec = priors[name];
                                  if (!spec) return null;
                                  const pos = (Math.log(stats.mean) - Math.log(spec.min)) / (Math.log(spec.max) - Math.log(spec.min));
                                  return <div 
                                    className="absolute bg-emerald-500 h-full w-4 -ml-2 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                                    style={{ left: `${Math.min(100, Math.max(0, pos * 100))}%` }} 
                                  />;
                                })()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
            </div>

            <Card className="p-6">
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                 Detailed Parameter Statistics
                 <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800 ml-2" />
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 font-black uppercase tracking-widest text-[10px] border-b pb-4">
                      <th className="pb-4">Parameter</th>
                      <th className="pb-4">Estimated Mean</th>
                      <th className="pb-4">Median</th>
                      <th className="pb-4">95% Credible Interval</th>
                      <th className="pb-4">Approx. Uncertainty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {Object.entries(result.posteriorSummary as Record<string, any>).map(([name, stats]) => (
                      <tr key={name} className="hover:bg-slate-50 dark:bg-slate-900/50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">{name}</td>
                        <td className="py-4 font-mono">{formatValue(stats.mean)}</td>
                        <td className="py-4 font-mono">{formatValue(stats.median)}</td>
                        <td className="py-4">
                          <span className="font-mono bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                            {formatValue(stats.ci95[0])} — {formatValue(stats.ci95[1])}
                          </span>
                        </td>
                        <td className="py-4 text-slate-400 italic">
                          ± {formatValue((stats.ci95[1] - stats.ci95[0]) / 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ) : isRunning ? (
            <Card className="p-12 flex flex-col items-center justify-center text-center space-y-4">
                <LoadingSpinner className="w-12 h-12 text-indigo-600" />
                <div className="space-y-1">
                    <h3 className="text-lg font-bold">Inference in Progress</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Evaluating particles for population {progress?.population ? progress.population + 1 : 1}...</p>
                </div>
            </Card>
        ) : (
          <EmptyState 
            icon={<div className="text-4xl text-indigo-500">🧬</div>}
            title="Bayesian Inference"
            description="Run SMC to infer parameter posterior distributions from experimental data. Configure your priors and data to begin."
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
