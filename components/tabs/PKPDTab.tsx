import React, { useState, useCallback, useMemo } from 'react';
import { BNGLModel, SimulationOptions, SimulationResults } from '../../types';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Card } from '../ui/Card';
import { InfoIcon } from '../icons/InfoIcon';
import { CHART_COLORS } from '../../src/utils/chartColors';
import { CHART_GRID, CHART_AXIS_LINE, CHART_TICK_LINE, CHART_TICK, CHART_AXIS_LABEL_STYLE, CHART_TOOLTIP_CURSOR, CHART_MARGIN } from '../../src/utils/chartStyle';
import { formatValue } from '../../src/utils/formatValue';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea
} from 'recharts';

interface PKPDTabProps {
  model: BNGLModel | null;
  results: SimulationResults | null;
  onSimulate: (options: SimulationOptions) => void;
  onCodeChange: (code: string) => void;
  isSimulating: boolean;
}

type PKModelType = 'one_compartment_iv' | 'one_compartment_oral' | 'two_compartment_iv' | 'two_compartment_oral' | 'tmdd';
type RouteType = 'iv_bolus' | 'iv_infusion' | 'oral' | 'subcutaneous';

interface PKMetricsUI {
  Cmax: number;
  Tmax: number;
  AUC_0_t: number;
  AUC_0_inf: number;
  halfLife: number;
  clearance: number;
  Vss: number;
  MRT: number;
}

interface DosingEventUI {
  time: number;
  amount: number;
  duration?: number;
}

const MODEL_OPTIONS = [
  { value: 'one_compartment_iv', label: '1-Compartment IV' },
  { value: 'one_compartment_oral', label: '1-Compartment Oral' },
  { value: 'two_compartment_iv', label: '2-Compartment IV' },
  { value: 'two_compartment_oral', label: '2-Compartment Oral' },
  { value: 'tmdd', label: 'TMDD (Target-Mediated)' },
];

const ROUTE_OPTIONS = [
  { value: 'iv_bolus', label: 'IV Bolus' },
  { value: 'iv_infusion', label: 'IV Infusion' },
  { value: 'oral', label: 'Oral' },
  { value: 'subcutaneous', label: 'Subcutaneous' },
];

const DOSING_PRESETS = [
  { name: 'Single dose', interval: 0, nDoses: 1 },
  { name: 'QD × 7', interval: 24, nDoses: 7 },
  { name: 'BID × 7', interval: 12, nDoses: 14 },
  { name: 'TID × 5', interval: 8, nDoses: 15 },
  { name: 'Weekly × 4', interval: 168, nDoses: 4 },
];

export const PKPDTab: React.FC<PKPDTabProps> = ({
  model, results, onSimulate, onCodeChange, isSimulating,
}) => {
  const [modelType, setModelType] = useState<PKModelType>('one_compartment_iv');
  const [route, setRoute] = useState<RouteType>('iv_bolus');
  const [drugName, setDrugName] = useState('Drug');
  const [dose, setDose] = useState(100);
  const [dosingInterval, setDosingInterval] = useState(0);
  const [nDoses, setNDoses] = useState(1);
  const [infusionDuration, setInfusionDuration] = useState(1);
  const [dosingEvents, setDosingEvents] = useState<DosingEventUI[]>([{ time: 0, amount: 100 }]);
  const [pkMetrics, setPkMetrics] = useState<PKMetricsUI | null>(null);
  const [logScale, setLogScale] = useState(true);
  const [therapeutic_min, setTherapeuticMin] = useState<number | null>(null);
  const [therapeutic_max, setTherapeuticMax] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate dosing events from preset
  const applyDosingPreset = useCallback((preset: typeof DOSING_PRESETS[0]) => {
    setDosingInterval(preset.interval);
    setNDoses(preset.nDoses);
    const events: DosingEventUI[] = [];
    for (let i = 0; i < preset.nDoses; i++) {
      events.push({
        time: i * (preset.interval || 0),
        amount: dose,
        duration: route === 'iv_infusion' ? infusionDuration : undefined,
      });
    }
    setDosingEvents(events);
  }, [dose, route, infusionDuration]);

  // Generate PK model
  const handleGenerateModel = useCallback(async () => {
    setError(null);
    try {
      const engine = await import('@bngplayground/engine');
      if (engine.generatePKModel) {
        const result = engine.generatePKModel({
          type: modelType,
          drugName,
          route,
          parameters: { Dose: dose },
        });
        onCodeChange(result.bnglCode);
        // Auto-simulate after generating model so charts populate
        setTimeout(() => {
          const tEnd = dosingEvents.length > 1
            ? dosingEvents[dosingEvents.length - 1].time + (dosingInterval || 24) * 2
            : 48;
          onSimulate({ method: 'ode', t_end: tEnd, n_steps: 500 });
        }, 500);
      }
    } catch (err: any) {
      setError(err.message || 'Model generation failed');
    }
  }, [modelType, drugName, route, dose, onCodeChange, onSimulate, dosingEvents, dosingInterval]);

  // Compute PK metrics from results
  const computeMetrics = useCallback(async () => {
    if (!results || !results.data || results.data.length === 0) return;
    try {
      const engine = await import('@bngplayground/engine');
      if (engine.computePKMetrics) {
        const obsName = results.headers.find(h => h.toLowerCase().includes('plasma') || h.toLowerCase().includes('c_')) || results.headers[1] || '';
        const metrics = engine.computePKMetrics(results, obsName, dose);
        setPkMetrics(metrics);
      }
    } catch (err: any) {
      // Compute basic metrics manually
      const obsName = results.headers.find(h => h !== 'time') || '';
      if (!obsName) return;

      const times = results.data.map(d => d.time);
      const concs = results.data.map(d => d[obsName] || 0);

      let cmax = 0, tmax = 0;
      concs.forEach((c, i) => { if (c > cmax) { cmax = c; tmax = times[i]; } });

      // Trapezoidal AUC
      let auc = 0;
      for (let i = 1; i < times.length; i++) {
        auc += (times[i] - times[i - 1]) * (concs[i] + concs[i - 1]) / 2;
      }

      // Terminal half-life (simple: last 30% of data)
      const startIdx = Math.max(1, Math.floor(concs.length * 0.7));
      const termTimes = times.slice(startIdx);
      const termConcs = concs.slice(startIdx).filter(c => c > 0);
      let lambdaZ = 0;
      if (termConcs.length >= 2) {
        const logConcs = termConcs.map(c => Math.log(c));
        const n = logConcs.length;
        const sumT = termTimes.slice(0, n).reduce((a, b) => a + b, 0);
        const sumLC = logConcs.reduce((a, b) => a + b, 0);
        const sumTLC = termTimes.slice(0, n).reduce((a, t, i) => a + t * logConcs[i], 0);
        const sumT2 = termTimes.slice(0, n).reduce((a, t) => a + t * t, 0);
        lambdaZ = -(n * sumTLC - sumT * sumLC) / (n * sumT2 - sumT * sumT);
      }

      setPkMetrics({
        Cmax: cmax,
        Tmax: tmax,
        AUC_0_t: auc,
        AUC_0_inf: lambdaZ > 0 ? auc + concs[concs.length - 1] / lambdaZ : auc,
        halfLife: lambdaZ > 0 ? Math.LN2 / lambdaZ : Infinity,
        clearance: lambdaZ > 0 ? dose / (auc + concs[concs.length - 1] / lambdaZ) : 0,
        Vss: 0,
        MRT: 0,
      });
    }
  }, [results, dose]);

  // Auto-compute metrics when results change
  React.useEffect(() => { computeMetrics(); }, [computeMetrics]);

  // Chart data
  const chartData = useMemo(() => {
    if (!results?.data) return [];
    return results.data.map(d => {
      const point: Record<string, number> = { time: d.time };
      for (const key of results.headers) {
        if (key === 'time') continue;
        point[key] = logScale ? Math.max(1e-10, d[key] || 0) : (d[key] || 0);
      }
      return point;
    });
  }, [results, logScale]);

  const observableNames = useMemo(() =>
    results?.headers?.filter(h => h !== 'time') || [], [results]);

  return (
    <div className="space-y-4 h-full flex flex-col overflow-auto p-2">
      <div className="p-3 rounded-md bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 flex items-start gap-3 shrink-0">
        <InfoIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <p className="text-sm">
          <b>PK/PD Framework:</b> Generate pharmacokinetic models from templates (1-comp, 2-comp,
          TMDD, PBPK), design dosing schedules, compute standard PK metrics (Cmax, AUC, t½),
          and run virtual patient population simulations. BNGL rules naturally describe
          drug-target binding — the TMDD model demonstrates this.
        </p>
      </div>

      {/* Template Selector */}
      <Card className="p-4 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">PK Model</label>
            <Select value={modelType} onChange={e => setModelType(e.target.value as PKModelType)}>
              {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Route</label>
            <Select value={route} onChange={e => setRoute(e.target.value as RouteType)}>
              {ROUTE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Drug Name</label>
            <input value={drugName} onChange={e => setDrugName(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Dose (mg)</label>
            <input type="number" value={dose} onChange={e => setDose(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" step="any" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleGenerateModel}>Generate Model</Button>
          </div>
        </div>
      </Card>

      {error && (
        <div className="p-2 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs">{error}</div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Dosing Schedule (left) */}
        <Card className="w-56 shrink-0 p-3 overflow-auto">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 uppercase tracking-wide">
            Dosing Schedule
          </h3>
          <div className="space-y-1 mb-3">
            {DOSING_PRESETS.map(preset => (
              <button key={preset.name} onClick={() => applyDosingPreset(preset)}
                className="w-full text-left px-2 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300">
                {preset.name}
              </button>
            ))}
          </div>
          {route === 'iv_infusion' && (
            <div className="mb-3">
              <label className="text-xs text-slate-500 block mb-1">Infusion Duration (hr)</label>
              <input type="number" value={infusionDuration} onChange={e => setInfusionDuration(Number(e.target.value))}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs" step="0.1" />
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-slate-500">{dosingEvents.length} dose(s)</p>
            {dosingEvents.slice(0, 10).map((ev, i) => (
              <div key={i} className="text-xs bg-slate-50 dark:bg-slate-800 p-1 rounded flex justify-between">
                <span>t={ev.time}h</span>
                <span>{ev.amount}mg</span>
              </div>
            ))}
            {dosingEvents.length > 10 && (
              <p className="text-xs text-slate-400">...and {dosingEvents.length - 10} more</p>
            )}
          </div>
        </Card>

        {/* Concentration-Time Curve (center) */}
        <div className="flex-1 flex flex-col min-w-0">
          <Card className="flex-1 p-3 min-h-[250px]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Concentration-Time Curve
              </h3>
              <button onClick={() => setLogScale(!logScale)}
                className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {logScale ? 'Semi-Log' : 'Linear'}
              </button>
            </div>
            {chartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart data={chartData} margin={{ ...CHART_MARGIN, bottom: 35 }}>
                    <CartesianGrid {...CHART_GRID} />
                    <XAxis dataKey="time" type="number" tickCount={10}
                      axisLine={CHART_AXIS_LINE} tickLine={CHART_TICK_LINE} tick={CHART_TICK}
                      tickFormatter={(v: number) => formatValue(v)}
                      label={{ value: 'Time (hr)', position: 'insideBottom', offset: -12, ...CHART_AXIS_LABEL_STYLE }} />
                    <YAxis
                      scale={logScale ? 'log' : 'auto'}
                      domain={logScale ? ['auto', 'auto'] : [0, 'auto']}
                      axisLine={CHART_AXIS_LINE} tickLine={CHART_TICK_LINE} tick={CHART_TICK}
                      tickFormatter={(v: number) => formatValue(v)}
                      label={{ value: 'Concentration', angle: -90, position: 'insideLeft', offset: -10, ...CHART_AXIS_LABEL_STYLE, style: { textAnchor: 'middle' } }}
                      allowDataOverflow
                    />
                    <Tooltip cursor={CHART_TOOLTIP_CURSOR} formatter={(v: number) => v.toPrecision(4)} />
                    {therapeutic_min !== null && therapeutic_max !== null && (
                      <ReferenceArea y1={therapeutic_min} y2={therapeutic_max} fill="#10b98120" />
                    )}
                    {dosingEvents.map((ev, i) => (
                      <ReferenceLine key={i} x={ev.time} stroke="#ef444480" strokeDasharray="3 3" />
                    ))}
                    {observableNames.map((name, i) => (
                      <Line key={name} type="monotone" dataKey={name}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2.25} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                {/* External legend — matches TimeSeriesChart pattern */}
                <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 py-3 border-t border-slate-100 dark:border-slate-800/20">
                  {observableNames.map((name, i) => (
                    <span key={name} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      {name}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Generate a model and run simulation to see results.
              </div>
            )}
          </Card>
        </div>

        {/* PK Metrics (right) */}
        <Card className="w-48 shrink-0 p-3 overflow-auto">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 uppercase tracking-wide">
            PK Metrics
          </h3>
          {pkMetrics ? (
            <div className="space-y-2">
              {([
                ['Cmax', pkMetrics.Cmax, 'mg/L'],
                ['Tmax', pkMetrics.Tmax, 'hr'],
                ['AUC₀₋ₜ', pkMetrics.AUC_0_t, 'mg·hr/L'],
                ['AUC₀₋∞', pkMetrics.AUC_0_inf, 'mg·hr/L'],
                ['t½', pkMetrics.halfLife, 'hr'],
                ['CL', pkMetrics.clearance, 'L/hr'],
                ['Vss', pkMetrics.Vss, 'L'],
                ['MRT', pkMetrics.MRT, 'hr'],
              ] as [string, number, string][]).map(([label, value, unit]) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-mono text-slate-700 dark:text-slate-200">
                    {isFinite(value) ? value.toPrecision(4) : '—'} <span className="text-slate-400">{unit}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Run simulation to compute metrics.</p>
          )}
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-semibold text-slate-500 mb-1">Therapeutic Window</h4>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-slate-400 w-10">Min:</label>
                <input type="number" placeholder="Cmin_eff"
                  onChange={e => setTherapeuticMin(e.target.value ? Number(e.target.value) : null)}
                  className="flex-1 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs" step="any" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-slate-400 w-10">Max:</label>
                <input type="number" placeholder="Cmax_tox"
                  onChange={e => setTherapeuticMax(e.target.value ? Number(e.target.value) : null)}
                  className="flex-1 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs" step="any" />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
