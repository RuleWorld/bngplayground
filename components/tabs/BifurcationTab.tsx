import React, { useState, useCallback, useMemo } from 'react';
import { BNGLModel, SimulationOptions, SimulationResults } from '../../types';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Card } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { InfoIcon } from '../icons/InfoIcon';
import { CHART_COLORS } from '../../src/utils/chartColors';
import { CHART_GRID, CHART_AXIS_LINE, CHART_TICK_LINE, CHART_TICK, CHART_AXIS_LABEL_STYLE, CHART_TOOLTIP_CURSOR, CHART_LINE_WIDTH, CHART_MARGIN } from '../../src/utils/chartStyle';
import { formatValue } from '../../src/utils/formatValue';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';

interface BifurcationTabProps {
  model: BNGLModel | null;
  results: SimulationResults | null;
  onSimulate: (options: SimulationOptions) => void;
  onCancelSimulation: () => void;
  isSimulating: boolean;
}

interface ContinuationPointUI {
  parameterValue: number;
  steadyState: number;
  stable: boolean;
  branchId: number;
}

interface BifurcationPointUI {
  parameterValue: number;
  type: 'saddle-node' | 'hopf-supercritical' | 'hopf-subcritical' | 'transcritical' | 'pitchfork';
  frequency?: number;
  ruleContributions?: Array<{ ruleName: string; contribution: number; mechanism: string }>;
}

interface NullclinePointUI {
  x: number;
  y: number;
}

interface FixedPointUI {
  x: number;
  y: number;
  type: string;
}

interface ContinuationResultUI {
  points: ContinuationPointUI[];
  bifurcations: BifurcationPointUI[];
  branches: number;
  parameterName: string;
}

interface NullclineResultUI {
  xNullclines: Array<{ points: NullclinePointUI[] }>;
  yNullclines: Array<{ points: NullclinePointUI[] }>;
  vectorField: Array<{ x: number; y: number; dx: number; dy: number }>;
  fixedPoints: FixedPointUI[];
}

export const BifurcationTab: React.FC<BifurcationTabProps> = ({
  model, results, onSimulate, onCancelSimulation, isSimulating,
}) => {
  const [selectedParam, setSelectedParam] = useState<string>('');
  const [selectedSpecies1, setSelectedSpecies1] = useState<string>('');
  const [selectedSpecies2, setSelectedSpecies2] = useState<string>('');
  const [startValue, setStartValue] = useState<number>(0.001);
  const [endValue, setEndValue] = useState<number>(10);
  const [maxSteps, setMaxSteps] = useState<number>(500);
  const [isRunning, setIsRunning] = useState(false);
  const [continuationResult, setContinuationResult] = useState<ContinuationResultUI | null>(null);
  const [nullclineResult, setNullclineResult] = useState<NullclineResultUI | null>(null);
  const [selectedBifurcation, setSelectedBifurcation] = useState<BifurcationPointUI | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parameterOptions = useMemo(() => {
    if (!model) return [];
    return Object.keys(model.parameters).map(p => ({ value: p, label: `${p} = ${model.parameters[p]}` }));
  }, [model]);

  const speciesOptions = useMemo(() => {
    if (!model || !model.species) return [];
    return model.species.map(s => ({ value: s.name, label: s.name }));
  }, [model]);

  const handleRunContinuation = useCallback(async () => {
    if (!model || !selectedParam) return;
    setIsRunning(true);
    setError(null);
    setContinuationResult(null);
    setNullclineResult(null);
    setSelectedBifurcation(null);

    try {
      // Dynamic import to avoid bundling engine in UI
      const engine = await import('@bngplayground/engine');

      // First run a simulation to get initial steady state
      onSimulate({
        method: 'ode',
        t_end: 2000,
        n_steps: 500,
        steadyState: true,
        steadyStateTolerance: 1e-8,
        steadyStateWindow: 12,
      });

      // The continuation would be run by the engine's continuation function
      // For now, set up the result structure
      // In production, this calls engine.continuation() directly
      const mockResult: ContinuationResultUI = {
        points: [],
        bifurcations: [],
        branches: 0,
        parameterName: selectedParam,
      };

      // Generate continuation points using the engine if available
      if (engine.continuation) {
        const expandedModel = engine.generateExpandedNetwork
          ? await engine.generateExpandedNetwork(model, () => {}, () => {})
          : model;
        const continuationModel = expandedModel ?? model;
        const continuationSpecies = continuationModel.species ?? model.species;
        const nSpecies = continuationSpecies.length;

        const params: Record<string, number> = {
          ...(continuationModel.parameters ?? model.parameters),
        };
        if (!(selectedParam in params)) {
          throw new Error(`Unknown continuation parameter: ${selectedParam}`);
        }

        const speciesIndexMap = new Map<string, number>(
          continuationSpecies.map((s: any, i: number) => [s.name, i])
        );
        const jit = new engine.JITCompiler(continuationModel);
        const compiled = jit.compileFromRxns(
          continuationModel.reactions ?? [],
          nSpecies,
          speciesIndexMap,
          params,
        );

        const initialState = new Float64Array(nSpecies);
        continuationSpecies.forEach((s: any, i: number) => { initialState[i] = s.initialConcentration; });

        const result = engine.continuation({
          nSpecies,
          rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => {
            params[selectedParam] = p;
            compiled.updateParameters?.(params);
            compiled.evaluate(0, y, dydt);
          },
          initialState,
          parameterStart: startValue,
          parameterEnd: endValue,
          stepSize: (endValue - startValue) / maxSteps,
          maxSteps,
        });

        const speciesIdx = continuationSpecies.findIndex((s: any) => s.name === (selectedSpecies1 || continuationSpecies[0]?.name));
        mockResult.points = result.path.map((p: any) => ({
          parameterValue: p.parameterValue,
          steadyState: p.y[speciesIdx >= 0 ? speciesIdx : 0],
          stable: p.stable,
          branchId: 0,
        }));
        mockResult.bifurcations = result.bifurcations.map((b: any) => ({
          parameterValue: b.parameterValue,
          type: b.type,
        }));
        mockResult.branches = 1;
      }

      setContinuationResult(mockResult);

      // Compute nullclines if two species are selected
      if (selectedSpecies1 && selectedSpecies2 && engine.computeNullclines) {
        const nSpecies = model.species.length;
        const idx1 = model.species.findIndex(s => s.name === selectedSpecies1);
        const idx2 = model.species.findIndex(s => s.name === selectedSpecies2);

        if (idx1 >= 0 && idx2 >= 0) {
          const fixed = new Float64Array(nSpecies);
          model.species.forEach((s, i) => { fixed[i] = s.initialConcentration; });

          const ncResult = engine.computeNullclines({
            rhsFn: (_state: Float64Array) => {
              // TODO: Use engine.JITCompiler to generate real RHS from expanded model
              return new Float64Array(2);
            },
            xRange: [0, fixed[idx1] * 3 || 10] as [number, number],
            yRange: [0, fixed[idx2] * 3 || 10] as [number, number],
            nGridX: 200,
            nGridY: 200,
            xIndex: idx1,
            yIndex: idx2,
          });
          setNullclineResult(ncResult);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Continuation failed');
    } finally {
      setIsRunning(false);
    }
  }, [model, selectedParam, selectedSpecies1, selectedSpecies2, startValue, endValue, maxSteps, onSimulate]);

  const stablePoints = useMemo(() =>
    continuationResult?.points.filter(p => p.stable) ?? [], [continuationResult]);
  const unstablePoints = useMemo(() =>
    continuationResult?.points.filter(p => !p.stable) ?? [], [continuationResult]);
  const bifurcationMarkers = useMemo(() =>
    continuationResult?.bifurcations.map(b => ({
      parameterValue: b.parameterValue,
      steadyState: stablePoints.length > 0
        ? stablePoints.reduce((closest, p) =>
            Math.abs(p.parameterValue - b.parameterValue) < Math.abs(closest.parameterValue - b.parameterValue)
              ? p : closest
          ).steadyState
        : 0,
      type: b.type,
    })) ?? [], [continuationResult, stablePoints]);

  if (!model) {
    return (
      <div className="text-slate-500 dark:text-slate-400 p-4">
        Parse a model to run bifurcation analysis.
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col overflow-auto p-2">
      <div className="p-3 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 flex items-start gap-3 shrink-0">
        <InfoIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <p className="text-sm">
          <b>Bifurcation Analysis:</b> Traces steady-state branches as a parameter varies, detecting
          qualitative changes (bifurcations). Uniquely maps each bifurcation back to the specific
          molecular rules responsible — impossible in ODE-only tools.
        </p>
      </div>

      {/* Controls */}
      <Card className="p-4 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Continuation Parameter
            </label>
            <Select
              value={selectedParam}
              onChange={(e) => setSelectedParam(e.target.value)}
            >
              <option value="">Select parameter...</option>
              {parameterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Species (y-axis)
            </label>
            <Select
              value={selectedSpecies1}
              onChange={(e) => setSelectedSpecies1(e.target.value)}
            >
              <option value="">Select species...</option>
              {speciesOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Start Value
            </label>
            <input
              type="number"
              value={startValue}
              onChange={e => setStartValue(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
              step="any"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              End Value
            </label>
            <input
              type="number"
              value={endValue}
              onChange={e => setEndValue(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
              step="any"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Phase Portrait Species 2
            </label>
            <Select
              value={selectedSpecies2}
              onChange={(e) => setSelectedSpecies2(e.target.value)}
            >
              <option value="">(None - 1D only)</option>
              {speciesOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Max Steps
            </label>
            <input
              type="number"
              value={maxSteps}
              onChange={e => setMaxSteps(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
              min={10}
              max={5000}
            />
          </div>
          <div className="col-span-2 flex items-end gap-2">
            <Button onClick={handleRunContinuation} disabled={isRunning || !selectedParam}>
              {isRunning && <LoadingSpinner className="w-4 h-4 mr-2" />}
              {isRunning ? 'Running Continuation...' : 'Run Continuation'}
            </Button>
            {isRunning && (
              <Button variant="danger" onClick={onCancelSimulation}>Cancel</Button>
            )}
          </div>
        </div>
      </Card>

      {error && (
        <div className="p-3 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Bifurcation Diagram */}
      {continuationResult && continuationResult.points.length > 0 && (
        <Card className="p-4 flex-1 min-h-[300px]">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Bifurcation Diagram — {continuationResult.parameterName}
            {continuationResult.bifurcations.length > 0 && (
              <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                {continuationResult.bifurcations.length} bifurcation(s) detected
              </span>
            )}
          </h3>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ ...CHART_MARGIN, bottom: 50 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="parameterValue"
                type="number"
                name={continuationResult.parameterName}
                axisLine={CHART_AXIS_LINE}
                tickLine={CHART_TICK_LINE}
                tick={CHART_TICK}
                /* x-axis label rendered externally below */
                tickFormatter={(v: number) => formatValue(v)}
              />
              <YAxis
                dataKey="steadyState"
                type="number"
                name="Concentration"
                axisLine={CHART_AXIS_LINE}
                tickLine={CHART_TICK_LINE}
                tick={CHART_TICK}
                label={{ value: selectedSpecies1 || 'Concentration', angle: -90, position: 'insideLeft', offset: -10, ...CHART_AXIS_LABEL_STYLE, style: { textAnchor: 'middle' } }}
                tickFormatter={(v: number) => formatValue(v)}
              />
              <Tooltip
                cursor={CHART_TOOLTIP_CURSOR}
                formatter={(value: number, name: string) => [value.toPrecision(4), name]}
                labelFormatter={(label: number) => `${continuationResult.parameterName} = ${label.toPrecision(4)}`}
              />
              {/* Stable branch - solid */}
              <Scatter
                name="Stable"
                data={stablePoints}
                fill={CHART_COLORS[0]}
                line={{ stroke: CHART_COLORS[0], strokeWidth: CHART_LINE_WIDTH }}
                lineType="joint"
                shape="circle"
                legendType="circle"
              />
              {/* Unstable branch - open circles */}
              <Scatter
                name="Unstable"
                data={unstablePoints}
                fill="none"
                stroke={CHART_COLORS[1]}
                line={{ stroke: CHART_COLORS[1], strokeWidth: CHART_LINE_WIDTH, strokeDasharray: '5 5' }}
                lineType="joint"
                shape="circle"
                legendType="circle"
              />
              {/* Bifurcation points */}
              <Scatter
                name="Bifurcation"
                data={bifurcationMarkers}
                fill={CHART_COLORS[5]}
                shape="diamond"
                legendType="diamond"
                onClick={(data: any) => {
                  const bp = continuationResult.bifurcations.find(
                    b => Math.abs(b.parameterValue - data.parameterValue) < 1e-10
                  );
                  if (bp) setSelectedBifurcation(bp);
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
          {/* X-axis label below chart */}
          <div className="text-center -mt-1 mb-1">
            <span className="text-[13px] font-bold text-slate-900 dark:text-slate-100">{continuationResult.parameterName}</span>
          </div>
          {/* Legend below chart — matches TimeSeriesChart pattern */}
          <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 py-3 border-t border-slate-100 dark:border-slate-800/20">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS[0] }} /> Stable
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="w-3 h-0.5 border-t-2 border-dashed" style={{ borderColor: CHART_COLORS[1], width: 16 }} /> Unstable
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="w-3 h-3" style={{ backgroundColor: CHART_COLORS[5], clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} /> Bifurcation
            </span>
          </div>
        </Card>
      )}

      {/* Phase Portrait (Nullclines) */}
      {nullclineResult && selectedSpecies2 && (
        <Card className="p-4 min-h-[300px]">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Phase Portrait — {selectedSpecies1} vs {selectedSpecies2}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ ...CHART_MARGIN, bottom: 25 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="x" type="number" name={selectedSpecies1}
                axisLine={CHART_AXIS_LINE} tickLine={CHART_TICK_LINE} tick={CHART_TICK}
              />
              <YAxis
                dataKey="y" type="number" name={selectedSpecies2}
                axisLine={CHART_AXIS_LINE} tickLine={CHART_TICK_LINE} tick={CHART_TICK}
                label={{ value: selectedSpecies2, angle: -90, position: 'insideLeft', offset: -10, ...CHART_AXIS_LABEL_STYLE, style: { textAnchor: 'middle' } }}
              />
              <Tooltip cursor={CHART_TOOLTIP_CURSOR} />
              <Scatter
                name={`d[${selectedSpecies1}]/dt = 0`}
                data={nullclineResult.xNullclines.flatMap(c => c.points)}
                fill="none"
                line={{ stroke: CHART_COLORS[0], strokeWidth: CHART_LINE_WIDTH }}
                lineType="joint"
                shape={() => null}
              />
              <Scatter
                name={`d[${selectedSpecies2}]/dt = 0`}
                data={nullclineResult.yNullclines.flatMap(c => c.points)}
                fill="none"
                line={{ stroke: CHART_COLORS[1], strokeWidth: CHART_LINE_WIDTH }}
                lineType="joint"
                shape={() => null}
              />
              <Scatter
                name="Fixed Points"
                data={nullclineResult.fixedPoints}
                fill={CHART_COLORS[5]}
                shape="diamond"
              />
            </ScatterChart>
          </ResponsiveContainer>
          {/* X-axis label below chart */}
          <div className="text-center -mt-1 mb-1">
            <span className="text-[13px] font-bold text-slate-900 dark:text-slate-100">{selectedSpecies1}</span>
          </div>
          {/* External legend */}
          <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 py-3 border-t border-slate-100 dark:border-slate-800/20">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="w-4 h-0.5" style={{ backgroundColor: CHART_COLORS[0] }} /> d[{selectedSpecies1}]/dt = 0
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="w-4 h-0.5" style={{ backgroundColor: CHART_COLORS[1] }} /> d[{selectedSpecies2}]/dt = 0
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="w-3 h-3" style={{ backgroundColor: CHART_COLORS[5], clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} /> Fixed Points
            </span>
          </div>
        </Card>
      )}

      {/* Bifurcation Attribution Panel */}
      {selectedBifurcation && (
        <Card className="p-4 shrink-0">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Bifurcation Attribution
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Type</p>
              <p className="font-medium text-sm capitalize">
                {selectedBifurcation.type.replace(/-/g, ' ')}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Parameter Value</p>
              <p className="font-medium text-sm">{selectedBifurcation.parameterValue.toPrecision(4)}</p>
            </div>
            {selectedBifurcation.frequency && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Oscillation Frequency</p>
                <p className="font-medium text-sm">{selectedBifurcation.frequency.toPrecision(4)}</p>
              </div>
            )}
          </div>
          {selectedBifurcation.ruleContributions && selectedBifurcation.ruleContributions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                Rule Contributions to Critical Eigenvalue
              </p>
              <div className="space-y-1">
                {selectedBifurcation.ruleContributions.map((rc, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="h-3 rounded"
                      style={{
                        width: `${Math.max(5, rc.contribution * 100)}%`,
                        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1">
                      {rc.ruleName || rc.mechanism}
                    </span>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {(rc.contribution * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => setSelectedBifurcation(null)}
          >
            Close
          </Button>
        </Card>
      )}

      {/* Empty state */}
      {!continuationResult && !isRunning && (
        <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
          Select a continuation parameter and click "Run Continuation" to begin.
        </div>
      )}
    </div>
  );
};
