import React, { useState, useMemo } from 'react';
import { BNGLModel } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { StatusMessage } from '../ui/StatusMessage';
import { profileLikelihood, ProfileLikelihoodResult } from '@bngplayground/engine';
import { bnglService } from '../../services/bnglService';
import { parseExperimentalData, ExperimentalDataPoint } from '../../src/services/data/experimentalData';
import { formatValue } from '../../src/utils/formatValue';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
  Scatter
} from 'recharts';

interface ProfileLikelihoodTabProps {
  model: BNGLModel | null;
}

const DEFAULT_DATA = `# time, A, B
0, 100, 0
10, 60, 40
20, 36, 64
30, 22, 78
50, 8, 92`;

export const ProfileLikelihoodTab: React.FC<ProfileLikelihoodTabProps> = ({ model }) => {

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<ProfileLikelihoodResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // Configuration
  const [nGrid, setNGrid] = useState(15);
  const [rangeFactor, setRangeFactor] = useState(10);
  const [reoptimize, setReoptimize] = useState(true);
  const [dataInput, setDataInput] = useState(DEFAULT_DATA);
  const [selectedParams, setSelectedParams] = useState<string[]>([]);

  // Initialize selected parameters
  React.useEffect(() => {
    if (model && selectedParams.length === 0) {
      const names = Object.keys(model.parameters);
      setSelectedParams(names.slice(0, 2));
    }
  }, [model]);



  const handleRun = async () => {
    if (!model || selectedParams.length === 0) return;

    let parsedData: ExperimentalDataPoint[] = [];
    try {
      parsedData = parseExperimentalData(dataInput);
      if (parsedData.length === 0) {
        throw new Error("No data points found. Use the 'Generate Synthetic Data' button to create a baseline if you don't have experimental data.");
      }
    } catch (err: any) {
      setError(err.message);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResults(null);
    setProgress({ current: 0, total: 0 });

    try {
      const abortController = new AbortController();

      // Prepare model for efficient profiling
      const modelId = await bnglService.prepareModel(model, { signal: abortController.signal });

      const simulate = async (overrides: Record<string, number>) => {
        const results = await bnglService.simulateCached(modelId, overrides, {
          method: 'ode',
          t_end: Math.max(...parsedData.map(d => d.time)),
          n_steps: 20,
        }, { signal: abortController.signal });
        return { data: results.data };
      };

      const baselineParams = { ...model.parameters };

      const res = await profileLikelihood({
        simulate,
        parameters: baselineParams,
        parameterNames: selectedParams,
        experimentalData: parsedData,
        nGrid,
        rangeFactor,
        reoptimize,
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

  const [previewData, setPreviewData] = useState<any[] | null>(null);

  const updatePreview = async () => {
    if (!model) return;
    try {
      const sim = await bnglService.simulate(model, {
        t_end: Math.max(50, ...parseExperimentalData(dataInput).map(d => d.time)),
        n_steps: 50,
        method: 'ode'
      });
      
      const expData = parseExperimentalData(dataInput);
      const combined = sim.data.map(d => {
        const exp = expData.find(e => Math.abs(e.time - d.time) < 1e-5);
        const point: any = { ...d };
        if (exp) {
          Object.entries(exp.values).forEach(([k, v]) => {
            point[`${k}_exp`] = v;
          });
        }
        return point;
      });
      setPreviewData(combined);
    } catch (e) {}
  };

  React.useEffect(() => {
    const timer = setTimeout(updatePreview, 500);
    return () => clearTimeout(timer);
  }, [dataInput, model]);

  if (!model) return null;

  return (
    <div className="flex flex-col xl:flex-row gap-6 h-full min-h-0 overflow-hidden">
      {/* Sidebar: Configuration */}
      <div className="w-full xl:w-80 xl:max-w-80 flex-shrink-0 flex flex-col gap-6 overflow-y-auto pr-2 min-h-0">
        <Card className="p-5 border-t-4 border-t-teal-500 shadow-sm">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4 text-xs uppercase tracking-widest">Profiling Settings</h3>
          
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Grid Resolution</label>
              <input 
                type="number" 
                value={nGrid} 
                onChange={e => setNGrid(Number(e.target.value))}
                className="bg-white dark:bg-slate-900 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                disabled={isAnalyzing}
              />
              <p className="text-[10px] text-slate-400">Number of points per parameter profile.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Range Factor</label>
              <input 
                type="number" 
                value={rangeFactor} 
                onChange={e => setRangeFactor(Number(e.target.value))}
                className="bg-white dark:bg-slate-900 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                disabled={isAnalyzing}
              />
              <p className="text-[10px] text-slate-400">Scan range: [val/{rangeFactor} to val*{rangeFactor}]</p>
            </div>

            <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 cursor-pointer border border-transparent hover:border-slate-200 dark:border-slate-700 transition-all">
              <input 
                type="checkbox" 
                checked={reoptimize} 
                onChange={e => setReoptimize(e.target.checked)}
                disabled={isAnalyzing}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Re-optimize</span>
                <span className="text-[10px] text-slate-400">Adjust other parameters at each step.</span>
              </div>
            </label>

            <Button 
              onClick={handleRun} 
              disabled={isAnalyzing || selectedParams.length === 0}
              className="w-full h-10 font-bold bg-teal-600 hover:bg-teal-700 active:scale-[0.98] transition-all shadow-md mt-2"
            >
              {isAnalyzing ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner className="w-4 h-4" />
                  <span>{progress.current}/{progress.total}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                    <span>🔍</span>
                    <span>Start Analysis</span>
                </div>
              )}
            </Button>

            {error && (
              <div className="mt-4">
                <StatusMessage status={{ type: 'error', message: error }} onClose={() => setError(null)} />
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5 flex flex-col min-h-[300px] overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-widest">Parameters</h3>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800 px-2 py-0.5 rounded font-bold">{selectedParams.length} Selected</span>
          </div>
          <div className="overflow-y-auto flex-1 -mr-2 pr-2 space-y-1">
            {Object.keys(model.parameters).map(name => (
              <label 
                key={name} 
                className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                  selectedParams.includes(name)
                    ? 'border-teal-200 bg-teal-50/20 dark:border-teal-800/30'
                    : 'border-transparent hover:bg-slate-50 dark:bg-slate-900/50 opacity-60'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={selectedParams.includes(name)}
                  onChange={e => {
                    if (e.target.checked) setSelectedParams(prev => [...prev, name]);
                    else setSelectedParams(prev => prev.filter(n => n !== name));
                  }}
                  disabled={isAnalyzing}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{name}</span>
              </label>
            ))}
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0 pb-2 pr-2">
        {(!results || isAnalyzing) && (
        <div className={`grid grid-cols-1 ${results || isAnalyzing ? '' : 'xl:grid-cols-2'} gap-4 shrink-0`}>
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
                    setIsAnalyzing(true);
                    setError(null);
                    try {
                      // Run a quick deterministic simulation to generate synthetic data
                      const modelId = await bnglService.prepareModel(model);
                      const res = await bnglService.simulateCached(modelId, {}, {
                        method: 'ode',
                        t_end: model.simulationOptions.t_end || 10,
                        n_steps: model.simulationOptions.n_steps || 100,
                      });
                      
                      const obsNames = model.observables.map(o => o.name);
                      let csv = `time, ${obsNames.join(', ')}\n`;
                      
                      // We want 10 points
                      const totalPoints = res.data.length;
                      const step = Math.max(1, Math.floor((totalPoints - 1) / 9));
                      
                      const selectedIndices = [];
                      for (let i = 0; i < totalPoints; i += step) selectedIndices.push(i);
                      // Ensure the last point is always included if we didn't perfectly hit it
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
                           const noisy = exact * (1 + (Math.random() - 0.5) * 0.05);
                           rowVals.push(noisy.toFixed(4));
                        }
                        csv += rowVals.join(', ') + '\n';
                      }
                      
                      setDataInput(csv);
                    } catch (e: any) {
                      console.error("Auto-generate failed", e);
                      setError("Failed to generate synthetic data: " + e.message);
                    } finally {
                      setIsAnalyzing(false);
                    }
                  }}
                  disabled={isAnalyzing}
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
              disabled={isAnalyzing}
            />
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500 dark:text-slate-400">Observables: {model.observables.map(o => o.name).join(', ')}</span>
              {(() => {
                try {
                  const parsed = parseExperimentalData(dataInput);
                  if (parsed.length === 0) return <span className="text-slate-400">No data parsed</span>;
                  const dataObsNames = Object.keys(parsed[0].values);
                  const sharedObsNames = dataObsNames.filter(n => model.observables.map(o => o.name).includes(n));
                  return (
                    <span className={`font-bold ${sharedObsNames.length > 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
                      {sharedObsNames.length > 0 ? `✓ ${parsed.length} TP | ${sharedObsNames.length} Matching Obs` : `⚠️ No matching observables!`}
                    </span>
                  );
                } catch (err: any) {
                  return <span className="text-red-500 font-bold">{err.message}</span>;
                }
              })()}
            </div>
          </Card>

          {!results && !isAnalyzing && (
             <Card className="h-full min-h-[300px] flex items-center justify-center bg-slate-50/50 dark:bg-slate-800/30 border-dashed">
               <EmptyState 
                  icon={<div className="text-4xl text-teal-500">🔍</div>}
                  title="Waiting for Analysis"
                  description="Profile likelihood evaluates the sensitivity of the loss function to each parameter individually. Select parameters and click Start Analysis."
                  action={{
                     label: "Start Analysis",
                     onClick: () => handleRun(),
                     icon: <span>⚡</span>
                  }}
                  className="w-full h-full p-2"
               />
             </Card>
          )}
        </div>
        )}

        {/* Results Summary & Dynamic Profile Charts */}
        {results && (
          <div className="flex flex-col gap-3 pb-1">
            {/* Horizontal Summary Strip */}
            <Card className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-xl shadow-inner">✅</div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 leading-tight">Analysis Complete</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-tight">Likelihood threshold at SSR = <span className="text-teal-600 font-bold">{formatValue(results.threshold)}</span></p>
                  </div>
               </div>
               
              <div className="flex gap-3">
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-center min-w-[96px]">
                     <div className="text-[9px] font-bold text-slate-400 uppercase">Identifiable</div>
                     <div className="text-xl font-black text-teal-600">
                        {Object.values(results.profiles).filter(p => p.identifiability === 'identifiable').length}
                     </div>
                  </div>
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-center min-w-[96px]">
                     <div className="text-[9px] font-bold text-slate-400 uppercase">Unidentifiable</div>
                     <div className="text-xl font-black text-rose-500">
                        {Object.values(results.profiles).filter(p => p.identifiability !== 'identifiable').length}
                     </div>
                  </div>
               </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(results.profiles).map(([name, profile]) => {
              const chartData = profile.grid.map((val, i) => ({
                val,
                ssr: profile.ssr[i]
              }));

              const isIdentifiable = profile.identifiability === 'identifiable';

              return (
                <Card key={name} className="p-3 flex flex-col gap-2 overflow-hidden border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-white flex items-center gap-3">
                         <span className="font-mono text-base">{name}</span>
                         <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ring-1 ${
                           isIdentifiable ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                           profile.identifiability === 'practically_unidentifiable' ? 'bg-amber-50 text-amber-700 ring-amber-200' :
                           'bg-rose-50 text-rose-700 ring-rose-200'
                         }`}>
                           {profile.identifiability.replace('_', ' ')}
                         </span>
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                         <span className="text-[10px] font-bold text-slate-400">95% Confidence:</span>
                         <span className={`text-[10px] font-mono font-bold ${isIdentifiable ? 'text-teal-600' : 'text-slate-500 dark:text-slate-400 italic'}`}>
                           {profile.ci ? `[${formatValue(profile.ci.lower)} — ${formatValue(profile.ci.upper)}]` : 'Indeterminate'}
                         </span>
                      </div>
                    </div>
                  </div>

                  <div className="h-[clamp(200px,26vh,280px)] w-full mt-1 bg-white dark:bg-slate-900 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis 
                          dataKey="val" 
                          type="number" 
                          scale="log" 
                          domain={['auto', 'auto']}
                          fontSize={11}
                          tickFormatter={(v) => v.toExponential(0)}
                          label={{ value: 'Parameter Value (log scale)', position: 'bottom', offset: 0, fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }}
                        />
                        <YAxis 
                          fontSize={11}
                          domain={['auto', 'auto']}
                          tickFormatter={(v) => formatValue(v)}
                          label={{ value: 'Loss (SSR)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#334155', fontSize: '11px' }}
                          labelFormatter={(label: number) => `value: ${formatValue(label)}`}
                          formatter={(v: number) => [formatValue(v), 'SSR']}
                        />
                        <ReferenceLine y={results.threshold} stroke="#f43f5e" strokeDasharray="6 4" strokeWidth={2} label={{ value: 'χ² Threshold', position: 'right', fill: '#f43f5e', fontSize: 10, fontWeight: 'black' }} />
                        
                        {profile.ci && (
                          <ReferenceArea 
                            x1={profile.ci.lower} 
                            x2={profile.ci.upper} 
                            fill="#10b981" 
                            fillOpacity={0.08} 
                          />
                        )}

                        <Line 
                          type="monotone" 
                          dataKey="ssr" 
                          stroke="#21808D" 
                          strokeWidth={3} 
                          dot={{ r: 4, fill: '#21808D', stroke: '#fff', strokeWidth: 1.5 }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                          animationDuration={900}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

        {results && (
          <details className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 mt-1">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Likelihood Profile Guide
            </summary>
            <div className="px-4 pt-3 pb-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <div className="text-teal-600 text-xs font-bold uppercase tracking-wide">Identifiable</div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  The loss increases sharply as the parameter moves away from the optimum, crossing the threshold to define a tight confidence interval.
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-amber-600 text-xs font-bold uppercase tracking-wide">Practically</div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  The curve is shallow; it fails to cross the threshold within the scanned range. Requires more experimental data points or reduced measurement noise.
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-rose-600 text-xs font-bold uppercase tracking-wide">Structurally</div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  The curve is perfectly flat. This parameter is redundant in the model's current structure; it cannot be uniquely determined regardless of data quality.
                </p>
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
};
