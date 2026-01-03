
import React, { useMemo, useState } from 'react';
import { BNGLModel } from '../../types';
import { useRobustness } from '../../src/hooks/useRobustness';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { SettingsIcon } from '../icons/SettingsIcon';
import { CHART_COLORS } from '../../constants';
import { ExternalLegend, formatTooltipNumber, formatYAxisTick } from '../charts/InteractiveLegend';

interface RobustnessTabProps {
    model: BNGLModel | null;
}

export const RobustnessTab: React.FC<RobustnessTabProps> = ({ model }) => {
    const { runRobustness, cancelRobustness, isRunning, progress, result, error } = useRobustness();

    const [iterations, setIterations] = useState(20);
    const [variation, setVariation] = useState(10);
    const [isConfigOpen, setIsConfigOpen] = useState(true);
    const [visibleSpecies, setVisibleSpecies] = useState<Set<string>>(new Set());
    const [lastMultiSelection, setLastMultiSelection] = useState<Set<string>>(new Set());

    const allSpecies = useMemo(() => {
        if (!result) return [] as string[];
        return Object.keys(result.speciesData);
    }, [result]);

    // Initialize visible species when results arrive
    React.useEffect(() => {
        if (result && visibleSpecies.size === 0) {
            // Default to first 5
            setVisibleSpecies(new Set(allSpecies.slice(0, 5)));
        }
    }, [result, allSpecies.join('|')]);

    React.useEffect(() => {
        if (visibleSpecies.size > 1) {
            setLastMultiSelection(new Set(visibleSpecies));
        }
    }, [Array.from(visibleSpecies).sort().join('|')]);

    const handleToggleSpecies = (name: string) => {
        setVisibleSpecies((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const handleIsolateSpecies = (name: string) => {
        setVisibleSpecies((prev) => {
            // If already isolated, restore last multi-selection (or default)
            if (prev.size === 1 && prev.has(name)) {
                if (lastMultiSelection.size > 0) return new Set(lastMultiSelection);
                return new Set(allSpecies.slice(0, 5));
            }
            return new Set([name]);
        });
    };

    const handleRun = () => {
        if (!model) return;
        runRobustness(
            model,
            // Default standard simulation options (could expose these too ideally)
            { method: 'ode', t_end: 100, n_steps: 100 },
            { iterations, variationPercent: variation }
        );
    };

    // Transform data for Recharts
    const chartData = useMemo(() => {
        if (!result) return [];

        return result.time.map((t, idx) => {
            const row: any = { time: t };
            visibleSpecies.forEach(sp => {
                const data = result.speciesData[sp];
                if (data) {
                    row[`${sp}_mean`] = data.mean[idx];
                    row[`${sp}_range`] = [data.min[idx], data.max[idx]];
                }
            });
            return row;
        });
    }, [result, visibleSpecies]);

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex flex-col p-4 border-b border-slate-200 gap-1">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">Robustness Analysis</h3>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => setIsConfigOpen(true)}
                            className="gap-2"
                        >
                            <SettingsIcon className="w-4 h-4" />
                            Configuration
                        </Button>
                    </div>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                    Analyze model sensitivity to parameter noise by running multiple Monte Carlo simulations.
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">

                {/* Configuration Panel */}
                {isConfigOpen && (
                    <Card className="p-4 bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex flex-wrap items-end gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Parameter Variation (+/- %)</label>
                                <input
                                    type="number"
                                    value={variation}
                                    onChange={e => setVariation(Number(e.target.value))}
                                    className="w-24 px-2 py-1 text-sm border rounded dark:bg-slate-700 dark:border-slate-600"
                                    min={1} max={100}
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Iterations (Monte Carlo)</label>
                                <input
                                    type="number"
                                    value={iterations}
                                    onChange={e => setIterations(Number(e.target.value))}
                                    className="w-24 px-2 py-1 text-sm border rounded dark:bg-slate-700 dark:border-slate-600"
                                    min={5} max={1000}
                                />
                            </div>

                            <div className="flex-1" />

                            {isRunning ? (
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col gap-1 w-32">
                                        <div className="text-xs text-slate-500 text-center">{progress}%</div>
                                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${progress}%` }} />
                                        </div>
                                    </div>
                                    <button
                                        onClick={cancelRobustness}
                                        className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded text-sm font-semibold transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleRun}
                                    disabled={!model}
                                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-semibold shadow-sm transition-colors"
                                >
                                    Run Robustness Analysis
                                </button>
                            )}
                        </div>
                        {error && <div className="mt-2 text-xs text-red-500">Error: {error}</div>}
                    </Card>
                )}

                {/* Results */}
                {result ? (
                    <Card className="flex-1 min-h-0 flex flex-col p-4">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-sm font-semibold text-slate-700">Sensitivity Cloud</h3>
                        </div>

                        <div className="flex-1 min-h-[450px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                    <XAxis dataKey="time" type="number" label={{ value: 'Time', position: 'insideBottomRight', offset: -5 }} />
                                    <YAxis tickFormatter={formatYAxisTick} />
                                    <Tooltip
                                        labelFormatter={(v) => `Time: ${Number(v).toFixed(2)}`}
                                        formatter={(value: any, name: any) => {
                                            const rawName = String(name);
                                            const cleaned = rawName.replace(/_mean$/, ' (mean)').replace(/_range$/, ' (range)');
                                            if (Array.isArray(value) && value.length === 2) {
                                                return [`${formatTooltipNumber(value[0], 2)} – ${formatTooltipNumber(value[1], 2)}`, cleaned];
                                            }
                                            return [formatTooltipNumber(value, 2), cleaned];
                                        }}
                                    />
                                    {/* <Legend /> */}

                                    {Array.from(visibleSpecies).map((sp) => {
                                        const index = Math.max(0, allSpecies.indexOf(sp));
                                        const color = CHART_COLORS[index % CHART_COLORS.length];
                                        return (
                                            <React.Fragment key={sp}>
                                                {/* Confidence Cloud (Area) */}
                                                <Area
                                                    type="monotone"
                                                    dataKey={`${sp}_range`}
                                                    stroke="none"
                                                    fill={color}
                                                    fillOpacity={0.2}
                                                    isAnimationActive={false}
                                                />
                                                {/* Mean Line */}
                                                <Line
                                                    type="monotone"
                                                    dataKey={`${sp}_mean`}
                                                    stroke={color}
                                                    strokeWidth={2}
                                                    dot={false}
                                                    isAnimationActive={false}
                                                />
                                            </React.Fragment>
                                        );
                                    })}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>

                        {allSpecies.length > 0 && (
                            <ExternalLegend
                                entries={allSpecies.map((sp, i) => ({ name: sp, color: CHART_COLORS[i % CHART_COLORS.length] }))}
                                visible={visibleSpecies}
                                onToggle={handleToggleSpecies}
                                onIsolate={handleIsolateSpecies}
                            />
                        )}

                        <div className="text-center text-xs text-slate-500 mt-2">
                            Click legend to toggle series. Double-click legend to isolate/restore.
                        </div>
                    </Card>
                ) : (
                    <Card className="flex-1 flex items-center justify-center p-8 text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                            <span>Configure variation settings and click Run to analyze model stability.</span>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};
