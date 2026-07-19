import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { BNGLModel, SimulationOptions, SimulationResults } from '../../types';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Card } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { InfoIcon } from '../icons/InfoIcon';
import { CHART_COLORS } from '../../src/utils/chartColors';
import { CHART_GRID, CHART_AXIS_LINE, CHART_TICK_LINE, CHART_TICK, CHART_AXIS_LABEL_STYLE, CHART_TOOLTIP_CURSOR, CHART_LINE_WIDTH } from '../../src/utils/chartStyle';
import { formatValue } from '../../src/utils/formatValue';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
  y?: number[];
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
  xRange?: [number, number];
  yRange?: [number, number];
  /** True when model has >2 species: phase plane is a 2D slice at ss values */
  isSlice?: boolean;
}

export const BifurcationTab: React.FC<BifurcationTabProps> = ({
  model, results: _results, onSimulate, onCancelSimulation, isSimulating: _isSimulating,
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

  // Reset state when model changes to prevent stale selection/pollution and crashes
  useEffect(() => {
    if (model) {
      const params = Object.keys(model.parameters);
      const speciesList = model.species || [];
      setSelectedParam(params[0] || '');
      setSelectedSpecies1(speciesList[0]?.name || '');
      setSelectedSpecies2('');
    } else {
      setSelectedParam('');
      setSelectedSpecies1('');
      setSelectedSpecies2('');
    }
    setContinuationResult(null);
    setNullclineResult(null);
    setSelectedBifurcation(null);
    setError(null);
  }, [model]);
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

      // Expand the model and compile its RHS
      const expandedModel = await engine.generateExpandedNetwork(model, () => {}, () => {});
      const nSpecies = expandedModel.species.length;
      const params: Record<string, number> = {
        ...(expandedModel.parameters ?? model.parameters),
      };

      const speciesIndexMap = new Map<string, number>();
      expandedModel.species.forEach((s: any, idx: number) => {
        speciesIndexMap.set(s.name, idx);
      });

      const indexedReactions = (expandedModel.reactions ?? []).map((reaction: any) => new engine.Rxn(
        reaction.reactants.map((name: string) => {
          const idx = speciesIndexMap.get(String(name).trim());
          if (idx === undefined) throw new Error(`Unknown reactant species: ${String(name)}`);
          return idx;
        }),
        reaction.products.map((name: string) => {
          const idx = speciesIndexMap.get(String(name).trim());
          if (idx === undefined) throw new Error(`Unknown product species: ${String(name)}`);
          return idx;
        }),
        reaction.rateConstant,
        reaction.name,
        {
          degeneracy: reaction.degeneracy,
          propensityFactor: reaction.propensityFactor,
          statFactor: reaction.statFactor,
          rateExpression: reaction.rateExpression ?? reaction.rate,
          productStoichiometries: reaction.productStoichiometries,
          scalingVolume: reaction.scalingVolume,
          totalRate: reaction.totalRate,
        },
      ));

      // P0: JIT failure is fatal — no silent zero-field fallback
      const jit = new engine.JITCompiler();
      let compiled: any = null;
      let odeHandle: any = null;
      try {
        compiled = jit.compileFromRxns(
          indexedReactions,
          nSpecies,
          speciesIndexMap,
          params,
          {
            modelName: model.name ?? 'unnamed-model',
            analysis: 'bifurcation',
            parameterName: selectedParam,
            callsite: 'BifurcationTab.handleRunContinuation',
          }
        );
      } catch (jitErr) {
        // The mass-action JIT does not support functional rates, custom
        // functions (functions block), or observable-dependent rates. Fall back
        // to the full simulator RHS, which handles all of these. It exposes a
        // synchronous updateParameters() so continuation can still vary the
        // bifurcation parameter.
        console.warn(
          '[BifurcationTab] mass-action JIT rejected the model rate law; ' +
          'falling back to the full functional-rate RHS:',
          jitErr instanceof Error ? jitErr.message : String(jitErr),
        );
        try {
          odeHandle = await engine.buildOdeSystem(model, { solver: 'cvode' });
        } catch (buildErr) {
          const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
          setError(`Could not compile model RHS for continuation: ${msg}`);
          setIsRunning(false);
          return;
        }
      }

      // Unified RHS + reparameterisation across both compile paths.
      const evaluateRhs = compiled
        ? (t: number, y: Float64Array, dydt: Float64Array) => { compiled.evaluate(t, y, dydt); }
        : (_t: number, y: Float64Array, dydt: Float64Array) => { odeHandle.rhs(y, dydt); };
      const updateParametersFn = (p: Record<string, number>) => {
        if (compiled) {
          if (compiled.updateParameters) compiled.updateParameters(p);
        } else if (odeHandle.updateParameters) {
          odeHandle.updateParameters(p);
        }
      };

      if (!(selectedParam in params)) {
        throw new Error(`Unknown continuation parameter: ${selectedParam}`);
      }

      // P1a: Compute steady state synchronously in-engine at startValue, not from raw ICs
      const ssInitial = new Float64Array(nSpecies);
      expandedModel.species.forEach((s: any, i: number) => { ssInitial[i] = s.initialConcentration; });
      params[selectedParam] = startValue;
      updateParametersFn(params);

      const ss = engine.findSteadyState(
        {
          nSpecies,
          parameters: params,
          rhsFn: (y: Float64Array, dydt: Float64Array) => evaluateRhs(0, y, dydt),
        },
        ssInitial,
      );
      const seedState = ss.converged ? ss.y : ssInitial;
      if (!ss.converged) {
        setError('Steady state did not converge at start value; continuation may be on the wrong branch.');
      }

      // T4: Check if continuation parameter affects any conserved pool (e.g., total enzyme).
      // Detect by scanning the raw model's species for initialExpression references.
      const paramAffectsConservedPool = model.species?.some(
        (s: any) => s.initialExpression && s.initialExpression.includes(selectedParam)
      ) ?? false;
      if (paramAffectsConservedPool) {
        setError('Parameter appears to affect a conserved pool total; moiety reduction disabled to avoid incorrect results.');
      }

      // Use continuationWithConservation (handles moiety reduction, seeding, reconstruction)
      const rawResult = engine.continuationWithConservation({
        nSpecies,
        reactions: indexedReactions,
        rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => {
          params[selectedParam] = p;
          updateParametersFn(params);
          evaluateRhs(0, y, dydt);
        },
        updateParams: (p: number) => {
          params[selectedParam] = p;
          updateParametersFn(params);
        },
        initialGuess: ssInitial,
        parameterStart: startValue,
        parameterEnd: endValue,
        stepSize: (endValue - startValue) / maxSteps,
        maxSteps,
        skipReduction: paramAffectsConservedPool,
      });

      const speciesIdx = speciesIndexMap.get(selectedSpecies1 || expandedModel.species[0]?.name) ?? -1;
      const foldCount = rawResult.bifurcations.filter(
        (b: any) => b.type === 'saddle-node' || b.type === 'transcritical'
      ).length;
      const result: ContinuationResultUI = {
        points: rawResult.path.map((p: any) => ({
          parameterValue: p.parameterValue,
          steadyState: p.y[speciesIdx >= 0 ? speciesIdx : 0],
          stable: p.stable,
          branchId: 0,
          y: Array.from(p.y),
        })),
        bifurcations: rawResult.bifurcations.map((b: any) => ({
          parameterValue: b.parameterValue,
          type: b.type,
        })),
        branches: foldCount + 1,
        parameterName: selectedParam,
      };

      setContinuationResult(result);

      // Compute nullclines if two species are selected
      if (selectedSpecies1 && selectedSpecies2 && engine.computeNullclines) {
        const idx1 = speciesIndexMap.get(selectedSpecies1) ?? -1;
        const idx2 = speciesIndexMap.get(selectedSpecies2) ?? -1;

        if (idx1 >= 0 && idx2 >= 0) {
          // P1b: freeze held species at converged steady state, not initial concentrations
          const fixed = new Float64Array(seedState);

          // Reset params back to model values (parameter scan is done; nullclines use nominal params)
          Object.assign(params, expandedModel.parameters ?? model.parameters);
          updateParametersFn(params);

          // Compute dynamic ranges from continuation path
          const vals1 = result.points
            .map(p => p.y && idx1 >= 0 ? p.y[idx1] : p.steadyState)
            .filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));
          const vals2 = result.points
            .map(p => p.y && idx2 >= 0 ? p.y[idx2] : 0)
            .filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));

          const ssVal1 = fixed[idx1] ?? 0;
          const ssVal2 = fixed[idx2] ?? 0;
          const maxVal1 = vals1.length > 0 ? Math.max(...vals1, ssVal1) : Math.max(ssVal1, 1);
          const maxVal2 = vals2.length > 0 ? Math.max(...vals2, ssVal2) : Math.max(ssVal2, 1);

          const xRange: [number, number] = [0, Math.max(10, maxVal1 * 1.5)];
          const yRange: [number, number] = [0, Math.max(10, maxVal2 * 1.5)];

          const ncResult = engine.computeNullclines({
            rhsFn: (state: Float64Array) => {
              // Inject 2D scan variables into full N-dimensional state frozen at ss
              const fullState = new Float64Array(fixed);
              fullState[idx1] = state[0];
              fullState[idx2] = state[1];
              const dydt = new Float64Array(nSpecies);
              evaluateRhs(0, fullState, dydt);
              return new Float64Array([dydt[idx1], dydt[idx2]]);
            },
            xRange,
            yRange,
            nGridX: 200,
            nGridY: 200,
            xIndex: idx1,
            yIndex: idx2,
          });
          setNullclineResult({
            ...ncResult,
            xRange,
            yRange,
            isSlice: nSpecies > 2,
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Continuation failed');
    } finally {
      setIsRunning(false);
    }
  }, [model, selectedParam, selectedSpecies1, selectedSpecies2, startValue, endValue, maxSteps]);

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
      <div className="text-slate-500 dark:text-slate-300 p-4">
        Parse a model to run bifurcation analysis.
      </div>
    );
  }

  return (
    <div className="space-y-4 flex-1 min-h-0 overflow-y-auto p-2 flex flex-col">
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
            <label htmlFor="bif-cont-param" className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Continuation Parameter
            </label>
            <Select
              id="bif-cont-param"
              value={selectedParam}
              onChange={(e) => setSelectedParam(e.target.value)}
            >
              <option value="">Select parameter...</option>
              {parameterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="bif-species-y" className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Species (y-axis)
            </label>
            <Select
              id="bif-species-y"
              value={selectedSpecies1}
              onChange={(e) => setSelectedSpecies1(e.target.value)}
            >
              <option value="">Select species...</option>
              {speciesOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="bif-start-value" className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Start Value
            </label>
            <input
              id="bif-start-value"
              type="number"
              value={startValue}
              onChange={e => setStartValue(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
              step="any"
            />
          </div>
          <div>
            <label htmlFor="bif-end-value" className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              End Value
            </label>
            <input
              id="bif-end-value"
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
            <label htmlFor="bif-species-2" className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Phase Portrait Species 2
            </label>
            <Select
              id="bif-species-2"
              value={selectedSpecies2}
              onChange={(e) => setSelectedSpecies2(e.target.value)}
            >
              <option value="">(None - 1D only)</option>
              {speciesOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="bif-max-steps" className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              Max Steps
            </label>
            <input
              id="bif-max-steps"
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
        <div className="p-3 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm" role="alert">
          {error}
        </div>
      )}

      {/* Bifurcation Diagram */}
      {continuationResult && continuationResult.points.length > 0 && (
        <Card className="p-4 flex flex-col overflow-hidden">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2 shrink-0">
            Bifurcation Diagram — {continuationResult.parameterName}
            {continuationResult.bifurcations.length > 0 && (
              <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                {continuationResult.bifurcations.length} bifurcation(s) detected
              </span>
            )}
          </h3>
          <div className="w-full" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 5, right: 20, bottom: 30, left: 20 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis
                  dataKey="parameterValue"
                  type="number"
                  name={continuationResult.parameterName}
                  axisLine={CHART_AXIS_LINE}
                  tickLine={CHART_TICK_LINE}
                  tick={CHART_TICK}
                  label={{ value: continuationResult.parameterName, position: 'insideBottom', offset: -10, ...CHART_AXIS_LABEL_STYLE }}
                  tickFormatter={(v: number) => formatValue(v)}
                />
                <YAxis
                  dataKey="steadyState"
                  type="number"
                  name="Concentration"
                  axisLine={CHART_AXIS_LINE}
                  tickLine={CHART_TICK_LINE}
                  tick={CHART_TICK}
                  label={{ value: selectedSpecies1 || 'Concentration', angle: -90, position: 'insideLeft', offset: 10, ...CHART_AXIS_LABEL_STYLE, style: { textAnchor: 'middle' } }}
                  tickFormatter={(v: number) => formatValue(v)}
                />
                <Tooltip
                  cursor={CHART_TOOLTIP_CURSOR}
                  formatter={(value, name) => [typeof value === 'number' ? value.toPrecision(4) : String(value ?? ''), name]}
                  labelFormatter={(label) => {
                    const formattedLabel = typeof label === 'number' ? label.toPrecision(4) : String(label ?? '');
                    return `${continuationResult.parameterName} = ${formattedLabel}`;
                  }}
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
                {/* Unstable branch - dashed */}
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
          </div>
          {/* Legend */}
          <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 pt-2 pb-1 border-t border-slate-100 dark:border-slate-800/20 shrink-0">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <span className="inline-block w-4 h-0.5" style={{ backgroundColor: CHART_COLORS[0] }} /> Stable
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <span className="inline-block w-4 h-0.5 border-t-2 border-dashed" style={{ borderColor: CHART_COLORS[1], borderTopWidth: 2 }} /> Unstable
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <span className="inline-block w-3 h-3" style={{ backgroundColor: CHART_COLORS[5], clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} /> Bifurcation
            </span>
          </div>
        </Card>
      )}

      {/* Phase Portrait (Nullclines) */}
      {nullclineResult && selectedSpecies2 && (() => {
        // Each NullclineCurve is a connected segment from marching squares — keep them separate
        const xSegments = nullclineResult.xNullclines.map(c =>
          c.points.filter(p => isFinite(p.x) && isFinite(p.y))
        ).filter(pts => pts.length >= 2);
        const ySegments = nullclineResult.yNullclines.map(c =>
          c.points.filter(p => isFinite(p.x) && isFinite(p.y))
        ).filter(pts => pts.length >= 2);
        const fixedPts = (nullclineResult.fixedPoints ?? []).filter(
          p => isFinite(p.x) && isFinite(p.y)
        );

        const xDomain = nullclineResult.xRange ?? [0, 1] as [number, number];
        const yDomain = nullclineResult.yRange ?? [0, 1] as [number, number];

        // Custom SVG layer that draws polylines for each nullcline segment
        // viewBox coordinates: data → pixel via linear scale using chart dimensions
        const NullclineOverlay = (props: any) => {
          const { xAxisMap, yAxisMap } = props;
          const xAxis = xAxisMap && Object.values(xAxisMap as Record<string, any>)[0];
          const yAxis = yAxisMap && Object.values(yAxisMap as Record<string, any>)[0];
          if (!xAxis || !yAxis) return null;
          const toPixel = (x: number, y: number) => ({
            px: xAxis.scale(x),
            py: yAxis.scale(y),
          });
          return (
            <g>
              {xSegments.map((pts, si) => (
                <polyline
                  key={`xnc-${si}`}
                  fill="none"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={CHART_LINE_WIDTH}
                  strokeLinejoin="round"
                  points={pts.map(p => { const { px, py } = toPixel(p.x, p.y); return `${px},${py}`; }).join(' ')}
                />
              ))}
              {ySegments.map((pts, si) => (
                <polyline
                  key={`ync-${si}`}
                  fill="none"
                  stroke={CHART_COLORS[1]}
                  strokeWidth={CHART_LINE_WIDTH}
                  strokeLinejoin="round"
                  points={pts.map(p => { const { px, py } = toPixel(p.x, p.y); return `${px},${py}`; }).join(' ')}
                />
              ))}
            </g>
          );
        };

        return (
          <Card className="p-4 flex flex-col overflow-hidden">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2 shrink-0">
              Phase Portrait — {selectedSpecies1} vs {selectedSpecies2}
            </h3>
            {nullclineResult.isSlice && (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded px-2 py-1 mb-2 shrink-0">
                2D slice — other species fixed at converged steady-state values.
                Fixed-point markers may not correspond to exact system equilibria.
              </p>
            )}
            <div className="w-full" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 5, right: 20, bottom: 30, left: 20 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis
                    dataKey="x" type="number" name={selectedSpecies1}
                    axisLine={CHART_AXIS_LINE} tickLine={CHART_TICK_LINE} tick={CHART_TICK}
                    domain={xDomain}
                    label={{ value: selectedSpecies1, position: 'insideBottom', offset: -10, ...CHART_AXIS_LABEL_STYLE }}
                    tickFormatter={(v: number) => formatValue(v)}
                    allowDataOverflow
                  />
                  <YAxis
                    dataKey="y" type="number" name={selectedSpecies2}
                    axisLine={CHART_AXIS_LINE} tickLine={CHART_TICK_LINE} tick={CHART_TICK}
                    domain={yDomain}
                    label={{ value: selectedSpecies2, angle: -90, position: 'insideLeft', offset: 10, ...CHART_AXIS_LABEL_STYLE, style: { textAnchor: 'middle' } }}
                    tickFormatter={(v: number) => formatValue(v)}
                    allowDataOverflow
                  />
                  <Tooltip cursor={CHART_TOOLTIP_CURSOR} formatter={(v: any) => [typeof v === 'number' ? formatValue(v) : v]} />
                  {/* SVG polyline overlay for nullclines */}
                  <NullclineOverlay />
                  {/* Fixed points */}
                  <Scatter
                    data={fixedPts}
                    fill={CHART_COLORS[5]}
                    shape="diamond"
                    name="Fixed Points"
                    legendType="diamond"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 pt-2 pb-1 border-t border-slate-100 dark:border-slate-800/20 shrink-0">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                <span className="inline-block w-4 h-0.5" style={{ backgroundColor: CHART_COLORS[0] }} />
                d[{selectedSpecies1}]/dt = 0
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                <span className="inline-block w-4 h-0.5" style={{ backgroundColor: CHART_COLORS[1] }} />
                d[{selectedSpecies2}]/dt = 0
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                <span className="inline-block w-3 h-3" style={{ backgroundColor: CHART_COLORS[5], clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
                Fixed Points
              </span>
            </div>
          </Card>
        );
      })()}

      {/* Bifurcation Attribution Panel */}
      {selectedBifurcation && (
        <Card className="p-4 shrink-0">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Bifurcation Attribution
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-300">Type</p>
              <p className="font-medium text-sm capitalize">
                {selectedBifurcation.type.replace(/-/g, ' ')}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-300">Parameter Value</p>
              <p className="font-medium text-sm">{selectedBifurcation.parameterValue.toPrecision(4)}</p>
            </div>
            {selectedBifurcation.frequency && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-300">Oscillation Frequency</p>
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
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-300">
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
        <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-300 text-sm">
          Select a continuation parameter and click "Run Continuation" to begin.
        </div>
      )}
    </div>
  );
};
