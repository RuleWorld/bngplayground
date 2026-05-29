import React, { useState, useMemo, useRef, useEffect } from 'react';
import { UMAP } from 'umap-js';
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid
} from 'recharts';
import { BNGLModel, SimulationResults, SimulationOptions } from '../../types';
import { resolveSimulationControlDefaults } from '../SimulationControls';
import {
    bnglWorkerPool,
    getSharedEnsembleFeatureVector,
    isSharedEnsembleResultsHandle,
    materializeSharedSimulationResult,
    type SharedEnsembleResultsHandle,
} from '../../services/BnglWorkerPool';
import { CHART_COLORS } from '../../src/utils/chartColors';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { TimeSeriesChart, TimeSeriesSeries } from '../charts/TimeSeriesChart';

interface TrajectoryExplorerTabProps {
    model: BNGLModel | null;
}

interface RunData {
    id: number;
    embedding?: [number, number];
}

export const TrajectoryExplorerTab: React.FC<TrajectoryExplorerTabProps> = ({ model }) => {
    const [ensembleSize, setEnsembleSize] = useState(50);
    const [method, setMethod] = useState<'ssa' | 'pla' | 'psa' | 'nf'>('ssa');
    const [seed, setSeed] = useState('');
    const [utl, setUtl] = useState('');
    const [poplevel, setPoplevel] = useState('100');
    const [ensembleResults, setEnsembleResults] = useState<SimulationResults[] | SharedEnsembleResultsHandle | null>(null);
    const [runs, setRuns] = useState<RunData[]>([]);
    const [isSimulating, setIsSimulating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [selectedRunIdx, setSelectedRunIdx] = useState<number | null>(null);
    const [visibleObservables, setVisibleObservables] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    const runEnsemble = async () => {
        if (!model) return;

        const defaults = resolveSimulationControlDefaults(model, method);

        setIsSimulating(true);
        setProgress(0);
        setError(null);
        setSelectedRunIdx(null);
        setEnsembleResults(null);
        setRuns([]);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const options: SimulationOptions = {
                method,
                t_end: Number(defaults.tEnd) || 100,
                n_steps: Number(defaults.nSteps) || 100,
                includeInfluence: false, // Disable DIN for maximum speed in explorer
                includeSpeciesData: false,
                // Stochastic seed (SSA, PLA, PSA, NFsim)
                ...(seed ? { seed: parseInt(seed) } : {}),
                // NFsim-specific
                ...(method === 'nf' && utl ? { utl: parseInt(utl) } : {}),
                // PSA-specific
                ...(method === 'psa' ? { poplevel: poplevel ? parseInt(poplevel) : 100 } : {}),
            };

            // Run parallel ensemble using worker pool
            const ensembleResults = await bnglWorkerPool.runEnsemble(
                model,
                options,
                ensembleSize,
                (completed) => setProgress(Math.round((completed / ensembleSize) * 100))
            );

            const runCount = isSharedEnsembleResultsHandle(ensembleResults)
                ? ensembleResults.runCount
                : ensembleResults.length;

            const results: RunData[] = Array.from({ length: runCount }, (_, i) => ({
                id: i,
            }));
            setEnsembleResults(ensembleResults);

            // 3. Compute UMAP if we have enough runs
            if (results.length > 3) {
                setProgress(100);
                // Prepare data for UMAP: flatten all observables into one vector per run
                const featureMatrix = isSharedEnsembleResultsHandle(ensembleResults)
                    ? results.map((r) => getSharedEnsembleFeatureVector(ensembleResults, r.id))
                    : ensembleResults.map((res) => {
                        return res.data.flatMap(row => Object.values(row).filter(v => typeof v === 'number'));
                    });

                const umap = new UMAP({
                    nComponents: 2,
                    nNeighbors: Math.min(results.length - 1, 15),
                    minDist: 0.1,
                });

                const embedding = umap.fit(featureMatrix);
                results.forEach((r, i) => {
                    r.embedding = [embedding[i][0], embedding[i][1]];
                });
            }

            setRuns(results);
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error('Ensemble failed:', err);
                setError(err.message || String(err) || 'Simulation failed');
            }
        } finally {
            setIsSimulating(false);
            abortControllerRef.current = null;
        }
    };

    const cancelEnsemble = () => {
        abortControllerRef.current?.abort();
        setIsSimulating(false);
    };

    // Prepare line chart data: current run + average if possible
    const chartData = useMemo(() => {
        if (selectedRunIdx === null || !runs[selectedRunIdx] || !ensembleResults) return [];
        const selectedResult = isSharedEnsembleResultsHandle(ensembleResults)
            ? materializeSharedSimulationResult(ensembleResults, selectedRunIdx)
            : ensembleResults[selectedRunIdx];
        const selectedData = selectedResult?.data ?? [];

        return selectedData.map((row, i) => {
            const entry: any = { time: row.time ?? i };
            Object.keys(row).forEach(key => {
                if (key !== 'time') entry[key] = row[key];
            });
            return entry;
        });
    }, [selectedRunIdx, runs, ensembleResults]);

    const chartTimeDomain = useMemo<[number, number] | undefined>(() => {
        if (chartData.length === 0) return undefined;
        const firstTime = Number(chartData[0]?.time ?? 0);
        const lastTime = Number(chartData[chartData.length - 1]?.time ?? firstTime);
        if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) return undefined;
        return [firstTime, lastTime];
    }, [chartData]);

    const observables = useMemo(() => {
        if (!ensembleResults) return [];
        const headers = isSharedEnsembleResultsHandle(ensembleResults)
            ? ensembleResults.headers
            : (ensembleResults[0]?.headers ?? []);
        return headers.filter(h => h !== 'time');
    }, [ensembleResults]);

    // Metadata for the TimeSeriesChart series
    const chartSeries = useMemo<TimeSeriesSeries[]>(() => {
        return observables.map((obs, i) => ({
            name: obs,
            color: CHART_COLORS[i % CHART_COLORS.length]
        }));
    }, [observables]);

    // Update visible observables when first runs arrive
    useEffect(() => {
        if (observables.length > 0 && visibleObservables.size === 0) {
            setVisibleObservables(new Set(observables.slice(0, 10)));
        }
    }, [observables]);

    const toggleObservable = (name: string) => {
        const next = new Set(visibleObservables);
        if (next.has(name)) {
            next.delete(name);
        } else {
            next.add(name);
        }
        setVisibleObservables(next);
    };

    const isolateObservable = (name: string) => {
        if (visibleObservables.size === 1 && visibleObservables.has(name)) {
            setVisibleObservables(new Set(observables));
        } else {
            setVisibleObservables(new Set([name]));
        }
    };

    return (
        <div className="h-full flex flex-col space-y-4">
            {/* Control Bar */}
            <Card className="p-4 bg-slate-50 dark:bg-slate-900/50 border-dashed border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Ensemble Size</label>
                        <input
                            type="number"
                            value={ensembleSize}
                            onChange={(e) => setEnsembleSize(Math.max(1, parseInt(e.target.value) || 0))}
                            disabled={isSimulating}
                            className="w-20 rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-800 px-2 py-1 text-sm text-center"
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Method</label>
                        <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value as 'ssa' | 'pla' | 'psa' | 'nf')}
                            disabled={isSimulating}
                            className="rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-800 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                            <option value="ssa">Gillespie (SSA)</option>
                            <option value="pla">Partitioned Leaping (PLA)</option>
                            <option value="psa">Partial Scaling (PSA)</option>
                            <option value="nf">Network-Free (NFsim)</option>
                        </select>
                    </div>

                    {/* Seed input for stochastic methods */}
                    {(method === 'ssa' || method === 'pla' || method === 'psa') && (
                        <div className="flex items-center gap-2">
                            <label
                                className="text-sm text-slate-600 dark:text-slate-400 cursor-help"
                                title="Random seed for reproducible stochastic simulations. Leave empty for a random seed each run."
                            >
                                Seed
                            </label>
                            <input
                                type="number"
                                value={seed}
                                onChange={(e) => setSeed(e.target.value)}
                                disabled={isSimulating}
                                placeholder="Random"
                                className="w-24 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-800 px-2 py-1 text-sm text-center"
                            />
                        </div>
                    )}

                    {/* PSA-specific: poplevel */}
                    {method === 'psa' && (
                        <div className="flex items-center gap-2">
                            <label
                                className="text-sm text-slate-600 dark:text-slate-400 cursor-help"
                                title="Population threshold: species above this count use scaled propensities (ODE-like), below use exact SSA. Default: 100."
                            >
                                Pop Level
                            </label>
                            <input
                                type="number"
                                value={poplevel}
                                onChange={(e) => setPoplevel(e.target.value)}
                                disabled={isSimulating}
                                placeholder="100"
                                className="w-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-800 px-2 py-1 text-sm text-center"
                            />
                        </div>
                    )}

                    {/* NFsim-specific: UTL and seed */}
                    {method === 'nf' && (
                        <>
                            <div className="flex items-center gap-2">
                                <label
                                    className="text-sm text-slate-600 dark:text-slate-400 cursor-help"
                                    title="Universal Traversal Limit: controls pattern matching depth. Higher values allow more complex patterns but may slow simulation. Leave empty for auto."
                                >
                                    UTL
                                </label>
                                <input
                                    type="number"
                                    value={utl}
                                    onChange={(e) => setUtl(e.target.value)}
                                    disabled={isSimulating}
                                    placeholder="Auto"
                                    className="w-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-800 px-2 py-1 text-sm text-center"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <label
                                    className="text-sm text-slate-600 dark:text-slate-400 cursor-help"
                                    title="Random seed for reproducible stochastic simulations. Leave empty for a random seed each run."
                                >
                                    Seed
                                </label>
                                <input
                                    type="number"
                                    value={seed}
                                    onChange={(e) => setSeed(e.target.value)}
                                    disabled={isSimulating}
                                    placeholder="Random"
                                    className="w-24 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-800 px-2 py-1 text-sm text-center"
                                />
                            </div>
                        </>
                    )}

                    <div className="flex items-center gap-2">
                        {!isSimulating ? (
                            <Button
                                onClick={runEnsemble}
                                disabled={!model}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[140px]"
                            >
                                ☄️ Run Ensemble
                            </Button>
                        ) : (
                            <Button
                                onClick={cancelEnsemble}
                                variant="secondary"
                                className="text-red-500"
                            >
                                Stop ({progress}%)
                            </Button>
                        )}
                    </div>

                    {isSimulating && (
                        <div className="flex-1 flex items-center gap-3">
                            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="bg-indigo-500 h-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {error && <div className="text-sm text-red-500 font-medium">⚠️ {error}</div>}
                </div>
            </Card>

            {!runs.length && !isSimulating && (
                <div className="flex-1 flex items-center justify-center p-12 text-center bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/10 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                    <div className="max-w-md space-y-4">
                        <div className="text-5xl opacity-40">🌊</div>
                        <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200">Trajectory Landscape</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                            Generate an ensemble of stochastic simulations to explore how different runs cluster.
                            Identify bi-modality or high-variance behaviors that are hidden in ODE simulations.
                        </p>
                    </div>
                </div>
            )}

            {runs.length > 0 && (
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0 pb-6">
                    {/* UMAP Plot */}
                    <Card className="p-6 flex flex-col min-h-[500px]">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                            🛰️ Trajectory Clusters (UMAP)
                            <span className="font-normal text-xs text-slate-500 dark:text-slate-400 ml-auto">Each point is one simulation run</span>
                        </h4>
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart 
                                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                                    style={{ pointerEvents: 'auto' }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                    <XAxis type="number" dataKey="x" hide domain={['auto', 'auto']} />
                                    <YAxis type="number" dataKey="y" hide domain={['auto', 'auto']} />
                                    <Tooltip
                                        cursor={false}
                                        wrapperStyle={{ pointerEvents: 'none', zIndex: 1000 }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                return (
                                                    <div className="bg-white dark:bg-slate-900 p-2 border border-slate-200 dark:border-slate-800 rounded shadow-lg text-[10px] pointer-events-none">
                                                        <div className="font-bold text-indigo-500">Run #{data.id}</div>
                                                        <div className="text-slate-500 dark:text-slate-400">Click to view trajectory</div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Scatter
                                        data={runs.map((r, i) => ({ id: r.id, x: r.embedding?.[0] ?? 0, y: r.embedding?.[1] ?? 0, index: i }))}
                                        shape={(props: any) => {
                                            const { cx, cy, payload } = props;
                                            const isSelected = selectedRunIdx === payload.index;
                                            return (
                                                <g 
                                                    key={`p-${payload.index}`}
                                                    style={{ cursor: 'pointer', pointerEvents: 'all' }}
                                                    onPointerDown={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedRunIdx(payload.index);
                                                    }}
                                                >
                                                    {/* Enhanced hit area */}
                                                    <circle cx={cx} cy={cy} r={15} fill="transparent" />
                                                    <circle
                                                        cx={cx}
                                                        cy={cy}
                                                        r={isSelected ? 7 : 5}
                                                        fill={isSelected ? '#4f46e5' : '#64748b'}
                                                        fillOpacity={isSelected ? 1 : 0.7}
                                                        stroke={isSelected ? '#c7d2fe' : 'white'}
                                                        strokeWidth={isSelected ? 3 : 1}
                                                        style={{ pointerEvents: 'none' }}
                                                    />
                                                </g>
                                            );
                                        }}
                                        isAnimationActive={false}
                                    />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-3 px-1">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                                Distance represents similarity in time-series dynamics across all observables.
                            </p>
                        </div>
                    </Card>

                    {/* Line Chart */}
                    <Card className="p-6 flex flex-col min-h-[500px]">
                        <div className="mb-6 flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                📈 {selectedRunIdx !== null ? `Trajectory Overview: Run #${runs[selectedRunIdx].id}` : 'Select a run in the map'}
                            </h4>
                            {selectedRunIdx !== null && (
                                <button 
                                    onClick={() => setSelectedRunIdx(null)}
                                    className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                >
                                    Clear Selection
                                </button>
                            )}
                        </div>
                        <div className="flex-1 min-h-0">
                            {selectedRunIdx !== null ? (
                                <TimeSeriesChart
                                    data={chartData}
                                    series={chartSeries}
                                    visibleSeries={visibleObservables}
                                    onSeriesToggle={toggleObservable}
                                    onSeriesIsolate={isolateObservable}
                                    xAxisDomain={chartTimeDomain}
                                />
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center opacity-30 text-slate-400 italic text-sm text-center">
                                    <div className="text-4xl mb-4">🖱️</div>
                                    <p>Click a point in the cluster map to see its specific trajectory</p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
