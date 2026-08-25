import React, { useState, useMemo, useRef } from 'react';
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
    isSharedEnsembleResultsHandle,
    materializeSharedSimulationResult,
    type SharedEnsembleResultsHandle,
} from '../../services/BnglWorkerPool';
import {
    buildTrajectoryFeatureMatrix,
    type TrajectoryNormalization,
    type TrajectoryRun,
} from '../../services/trajectoryEmbedding';
import { CHART_COLORS } from '../../src/utils/chartColors';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { TimeSeriesChart, TimeSeriesSeries } from '../charts/TimeSeriesChart';
import { toggleSetMember } from '../../services/collections';

interface TrajectoryExplorerTabProps {
    model: BNGLModel | null;
}

interface RunData {
    id: number;
}

type EmbeddingSelectionMode = 'custom' | 'chart';

const UMAP_RANDOM_SEED = 0x4d595df4;

const createSeededRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
};

const getTrajectoryRuns = (
    results: SimulationResults[] | SharedEnsembleResultsHandle | null,
    observableNames: readonly string[]
): TrajectoryRun[] => {
    if (!results) return [];

    if (isSharedEnsembleResultsHandle(results)) {
        const columnIndices = new Map(results.headers.map((header, index) => [header, index]));
        const runStride = results.rowCount * results.columnCount;

        return Array.from({ length: results.runCount }, (_, runIndex) => {
            const values: Record<string, number[]> = {};
            const runOffset = runIndex * runStride;

            for (const name of observableNames) {
                const columnIndex = columnIndices.get(name);
                values[name] = Array.from({ length: results.rowCount }, (_, rowIndex) => {
                    if (columnIndex === undefined) return Number.NaN;
                    return results.values[runOffset + rowIndex * results.columnCount + columnIndex];
                });
            }

            return { observables: values };
        });
    }

    return results.map(result => ({
        observables: Object.fromEntries(observableNames.map(name => [
            name,
            result.data.map(row => typeof row[name] === 'number' ? row[name] : Number.NaN),
        ])),
    }));
};

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
    const [embeddingObservables, setEmbeddingObservables] = useState<Set<string>>(new Set());
    const [embeddingSelectionMode, setEmbeddingSelectionMode] = useState<EmbeddingSelectionMode>('custom');
    const [observableWeights, setObservableWeights] = useState<Record<string, number>>({});
    const [embeddingNormalization, setEmbeddingNormalization] = useState<TrajectoryNormalization>('robust');
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
        setVisibleObservables(new Set());
        setEmbeddingObservables(new Set());
        setObservableWeights({});

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const options: SimulationOptions = {
                method,
                t_end: Number(defaults.tEnd) || 100,
                n_steps: Number(defaults.nSteps) || 100,
                includeInfluence: false, // Disable DIN for maximum speed in explorer
                includeSpeciesData: false,
                includeExpandedNetwork: false,
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
            const resultObservables = (isSharedEnsembleResultsHandle(ensembleResults)
                ? ensembleResults.headers
                : (ensembleResults[0]?.headers ?? [])
            ).filter(header => header !== 'time');

            setEnsembleResults(ensembleResults);
            setProgress(100);
            setVisibleObservables(new Set(resultObservables.slice(0, 10)));
            setEmbeddingObservables(new Set(resultObservables));
            setObservableWeights(Object.fromEntries(resultObservables.map(name => [name, 1])));
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

    const trajectoryRuns = useMemo(
        () => getTrajectoryRuns(ensembleResults, observables),
        [ensembleResults, observables]
    );

    const embeddingObservableNames = useMemo(() => {
        if (embeddingSelectionMode === 'chart') {
            return observables.filter(name => visibleObservables.has(name));
        }

        return observables.filter(name => (
            embeddingObservables.has(name) && (observableWeights[name] ?? 1) > 0
        ));
    }, [embeddingObservables, embeddingSelectionMode, observableWeights, observables, visibleObservables]);

    const embeddingWeights = embeddingSelectionMode === 'chart' ? undefined : observableWeights;

    const embeddingState = useMemo(() => {
        const runCount = ensembleResults
            ? (isSharedEnsembleResultsHandle(ensembleResults) ? ensembleResults.runCount : ensembleResults.length)
            : 0;

        if (runCount <= 3) return { coordinates: [] as Array<[number, number] | undefined>, error: null };

        const featureResult = buildTrajectoryFeatureMatrix(trajectoryRuns, {
            observableNames: embeddingObservableNames,
            observableWeights: embeddingWeights,
            normalization: embeddingNormalization,
        });

        if (featureResult.matrix.length === 0 || featureResult.matrix[0]?.length === 0) {
            return { coordinates: [] as Array<[number, number] | undefined>, error: null };
        }

        try {
            const umap = new UMAP({
                nComponents: 2,
                nNeighbors: Math.min(runCount - 1, 15),
                minDist: 0.1,
                random: createSeededRandom(UMAP_RANDOM_SEED),
            });
            const embedding = umap.fit(featureResult.matrix);
            const coordinates: Array<[number, number] | undefined> = embedding.map(point => (
                point ? [point[0], point[1]] : undefined
            ));
            return { coordinates, error: null };
        } catch (err) {
            return {
                coordinates: [],
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }, [
        embeddingNormalization,
        embeddingObservableNames,
        embeddingWeights,
        ensembleResults,
        trajectoryRuns,
    ]);

    const toggleObservable = (name: string) => {
        setVisibleObservables(current => toggleSetMember(current, name));
    };

    const isolateObservable = (name: string) => {
        setVisibleObservables(current => (
            current.size === 1 && current.has(name)
                ? new Set(observables)
                : new Set([name])
        ));
    };

    const toggleEmbeddingObservable = (name: string) => {
        setEmbeddingObservables(current => toggleSetMember(current, name));
    };

    const setObservableWeight = (name: string, value: number) => {
        setObservableWeights(current => ({ ...current, [name]: value }));
    };

    const embeddingReady = runs.length > 3
        && embeddingState.coordinates.length === runs.length
        && embeddingState.coordinates.every(coordinate => coordinate !== undefined);

    return (
        <div className="h-full flex flex-col space-y-4">
            {/* Control Bar */}
            <Card className="p-4 bg-slate-50 dark:bg-slate-900/50 border-dashed border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-3">
                        <label htmlFor="te-ensemble-size" className="text-sm font-semibold text-slate-700 dark:text-slate-300">Ensemble Size</label>
                        <input
                            id="te-ensemble-size"
                            type="number"
                            value={ensembleSize}
                            onChange={(e) => setEnsembleSize(Math.max(1, parseInt(e.target.value) || 0))}
                            disabled={isSimulating}
                            className="w-20 rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-800 px-2 py-1 text-sm text-center"
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <label htmlFor="te-method" className="text-sm font-semibold text-slate-700 dark:text-slate-300">Method</label>
                        <select
                            id="te-method"
                            value={method}
                            onChange={(e) => setMethod(e.target.value as 'ssa' | 'pla' | 'psa' | 'nf')}
                            disabled={isSimulating}
                            aria-label="Simulation Method"
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
                                htmlFor="te-seed-stochastic"
                                className="text-sm text-slate-600 dark:text-slate-400 cursor-help"
                                title="Random seed for reproducible stochastic simulations. Leave empty for a random seed each run."
                            >
                                Seed
                            </label>
                            <input
                                id="te-seed-stochastic"
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
                                htmlFor="te-pop-level"
                                className="text-sm text-slate-600 dark:text-slate-400 cursor-help"
                                title="Population threshold: species above this count use scaled propensities (ODE-like), below use exact SSA. Default: 100."
                            >
                                Pop Level
                            </label>
                            <input
                                id="te-pop-level"
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
                                    htmlFor="te-utl"
                                    className="text-sm text-slate-600 dark:text-slate-400 cursor-help"
                                    title="Universal Traversal Limit: controls pattern matching depth. Higher values allow more complex patterns but may slow simulation. Leave empty for auto."
                                >
                                    UTL
                                </label>
                                <input
                                    id="te-utl"
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
                                    htmlFor="te-seed-nf"
                                    className="text-sm text-slate-600 dark:text-slate-400 cursor-help"
                                    title="Random seed for reproducible stochastic simulations. Leave empty for a random seed each run."
                                >
                                    Seed
                                </label>
                                <input
                                    id="te-seed-nf"
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

                    {error && <div className="text-sm text-red-500 font-medium" role="alert">⚠️ {error}</div>}
                </div>
            </Card>

            {ensembleResults && observables.length > 0 && (
                <Card className="p-4 bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">UMAP inputs</h4>
                            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
                                Choose which observables define similarity between runs. Time is used only to order each
                                trajectory, never as a feature.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <label htmlFor="te-embedding-source" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                Inputs
                            </label>
                            <select
                                id="te-embedding-source"
                                value={embeddingSelectionMode}
                                onChange={(event) => setEmbeddingSelectionMode(event.target.value as EmbeddingSelectionMode)}
                                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                            >
                                <option value="custom">Custom selection (recommended)</option>
                                <option value="chart">Chart-visible observables (minimal correction)</option>
                            </select>
                            <label htmlFor="te-embedding-scaling" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                Scaling
                            </label>
                            <select
                                id="te-embedding-scaling"
                                value={embeddingNormalization}
                                onChange={(event) => setEmbeddingNormalization(event.target.value as TrajectoryNormalization)}
                                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                            >
                                <option value="robust">Robust + balanced (recommended)</option>
                                <option value="zscore">Z-score + balanced</option>
                                <option value="raw">Raw values (legacy, scale-sensitive)</option>
                            </select>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                            variant="ghost"
                            className="px-2 py-1 text-xs"
                            onClick={() => embeddingSelectionMode === 'chart'
                                ? setVisibleObservables(new Set(observables))
                                : setEmbeddingObservables(new Set(observables))}
                        >
                            Select all
                        </Button>
                        <Button
                            variant="ghost"
                            className="px-2 py-1 text-xs"
                            onClick={() => embeddingSelectionMode === 'chart'
                                ? setVisibleObservables(new Set())
                                : setEmbeddingObservables(new Set())}
                        >
                            Clear all
                        </Button>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {embeddingObservableNames.length} of {observables.length} observables active
                            {embeddingState.error ? ' · map unavailable' : ''}
                        </span>
                    </div>

                    <div className="mt-3 grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-slate-100 p-2 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-3">
                        {observables.map(name => {
                            const isSelected = embeddingSelectionMode === 'chart'
                                ? visibleObservables.has(name)
                                : embeddingObservables.has(name);
                            const weight = observableWeights[name] ?? 1;

                            return (
                                <div key={name} className="flex min-w-0 items-center gap-2 rounded px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/70">
                                    <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            disabled={embeddingSelectionMode === 'chart'}
                                            onChange={() => toggleEmbeddingObservable(name)}
                                            aria-label={`Use ${name} in UMAP`}
                                            className="accent-indigo-600"
                                        />
                                        <span className="truncate" title={name}>{name}</span>
                                    </label>
                                    <label className="flex w-24 items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400" title="Relative contribution of this observable">
                                        <span aria-hidden="true">w</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="3"
                                            step="0.25"
                                            value={weight}
                                            disabled={embeddingSelectionMode === 'chart'}
                                            onChange={(event) => setObservableWeight(name, Number(event.target.value))}
                                            aria-label={`Relative UMAP weight for ${name}`}
                                            className="min-w-0 flex-1 accent-indigo-600"
                                        />
                                        <span className="w-6 text-right tabular-nums">{weight.toFixed(2)}</span>
                                    </label>
                                </div>
                            );
                        })}
                    </div>

                    <p className="mt-2 text-[10px] italic text-slate-500 dark:text-slate-400">
                        Robust scaling uses the ensemble median and IQR, then gives each selected observable equal total
                        contribution across sampled time points. In chart-visible mode, toggling the trajectory legend
                        changes the map inputs.
                    </p>
                </Card>
            )}

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
                            <span className="font-normal text-xs text-slate-500 dark:text-slate-400 ml-auto">
                                {embeddingObservableNames.length} input{embeddingObservableNames.length === 1 ? '' : 's'}
                            </span>
                        </h4>
                        <div className="flex-1 min-h-0">
                            {embeddingReady ? <ResponsiveContainer width="100%" height="100%">
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
                                        data={runs.map((run, i) => ({
                                            id: run.id,
                                            x: embeddingState.coordinates[i]?.[0] ?? 0,
                                            y: embeddingState.coordinates[i]?.[1] ?? 0,
                                            index: i,
                                        }))}
                                        shape={(props: any) => {
                                            const { cx, cy, payload } = props;
                                            const isSelected = selectedRunIdx === payload.index;
                                            return (
                                                <g
                                                    key={`p-${payload.index}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-label={`Run #${payload.id}: click to view trajectory`}
                                                    style={{ cursor: 'pointer', pointerEvents: 'all' }}
                                                    onPointerDown={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedRunIdx(payload.index);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            setSelectedRunIdx(payload.index);
                                                        }
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
                            </ResponsiveContainer> : (
                                <div className="h-full flex flex-col items-center justify-center px-8 text-center text-sm text-slate-500 dark:text-slate-400">
                                    <div className="text-3xl mb-3">{embeddingState.error ? '⚠️' : '🧩'}</div>
                                    <p>
                                        {embeddingState.error
                                            ? `Unable to build the trajectory map: ${embeddingState.error}`
                                            : embeddingObservableNames.length === 0
                                                ? 'Select at least one observable to build the map.'
                                                : 'A trajectory map needs at least four completed runs.'}
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="mt-3 px-1">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                                Distance represents similarity in normalized time-series dynamics across the active inputs.
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
                                aria-label="Clear selected run"
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
