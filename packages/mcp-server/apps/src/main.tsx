import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';

import { ContactMapViewer } from '../../../../components/ContactMapViewer';
import { HeatmapChart } from '../../../../components/HeatmapChart';
import { InfluenceGraphViewer } from '../../../../components/InfluenceGraphViewer';
import { TimeSeriesChart, type TimeSeriesSeries } from '../../../../components/charts/TimeSeriesChart';
import { RegulatoryTab } from '../../../../components/tabs/RegulatoryTab';
import { getRuleId } from '../../../../services/ruleIdentity';
import { buildRuleOverlays } from '../../../../services/visualization/buildRuleOverlays';
import { computeInfluenceGraph } from '../../../../services/visualization/computeInfluence';
import { CHART_COLORS } from '../../../../src/utils/chartColors';
import type { BNGLModel } from '../../../../types';
import '../../../../index.css';

import {
  classifyResultPayload,
  extractResultPayload,
  getParameterScanHeatmap,
  getParameterScanRows,
  getParameterScanSeries,
  getSimulationData,
  getSimulationSeries,
  isContactMapPayload,
  isModelParsePayload,
  isParameterScanPayload,
  isSimulationPayload,
  isValidationPayload,
  type ContactMapPayload,
  type ModelParsePayload,
  type ParameterScanPayload,
  type ResultPayload,
  type SimulationPayload,
  type ToolResultLike,
  type ValidationMessagePayload,
  type ValidationPayload,
} from './resultAdapters';

function applyHostContext(context: Partial<McpUiHostContext> | undefined): void {
  if (!context) return;
  if (context.theme) {
    applyDocumentTheme(context.theme);
    document.documentElement.classList.toggle('dark', context.theme === 'dark');
    document.documentElement.classList.toggle('light', context.theme === 'light');
  }
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

const StatusCard: React.FC<{ title: string; children: React.ReactNode; tone?: 'neutral' | 'error' }> = ({
  title,
  children,
  tone = 'neutral',
}) => (
  <section
    className={`rounded-lg border p-4 ${
      tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100'
        : 'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
    }`}
  >
    <h2 className="mb-2 text-sm font-semibold">{title}</h2>
    {children}
  </section>
);

const SimulationView: React.FC<{ payload: SimulationPayload }> = ({ payload }) => {
  const suffixes = useMemo(() => Object.keys(payload.dataBySuffix ?? {}), [payload.dataBySuffix]);
  const [selectedSuffix, setSelectedSuffix] = useState<string>();
  const names = useMemo(() => getSimulationSeries(payload), [payload]);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const suffix = selectedSuffix && suffixes.includes(selectedSuffix) ? selectedSuffix : suffixes[0];
  const visible = useMemo(
    () => new Set(names.filter((name) => !hidden.has(name))),
    [hidden, names],
  );

  const data = useMemo(() => getSimulationData(payload, suffix), [payload, suffix]);
  const series = useMemo<TimeSeriesSeries[]>(
    () => names.map((name, index) => ({ name, color: CHART_COLORS[index % CHART_COLORS.length] })),
    [names],
  );

  const toggleSeries = (name: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-50">Simulation trajectories</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {data.length} time points · {names.length} observables
          </p>
        </div>
        {suffixes.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            Phase
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
              value={suffix}
              onChange={(event) => setSelectedSuffix(event.target.value)}
            >
              {suffixes.map((name) => (
                <option key={name} value={name}>{name === '__default__' ? 'Default' : name}</option>
              ))}
            </select>
          </label>
        )}
      </header>
      {data.length > 0 && series.length > 0 ? (
        <TimeSeriesChart
          data={data}
          series={series}
          visibleSeries={visible}
          onSeriesToggle={toggleSeries}
          onSeriesIsolate={(name) => setHidden(new Set(names.filter((candidate) => candidate !== name)))}
          xAxisLabel="Time"
          yAxisLabel="Value"
          height={440}
          showGrid
        />
      ) : (
        <StatusCard title="No plottable trajectories">
          <p className="text-sm">The tool completed, but the result did not contain numeric observable data.</p>
        </StatusCard>
      )}
    </section>
  );
};

const ContactMapView: React.FC<{ payload: ContactMapPayload }> = ({ payload }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <header className="mb-3">
      <h1 className="text-base font-semibold text-slate-900 dark:text-slate-50">Contact map</h1>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {payload.nodes.length} nodes · {payload.edges.length} interactions
      </p>
    </header>
    <div style={{ height: 'min(680px, 75vh)', minHeight: 480 }}>
      <ContactMapViewer contactMap={payload} showExportControls={false} />
    </div>
  </section>
);

const Metric: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/70">
    <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">{value}</div>
    <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
  </div>
);

const ModelStructureView: React.FC<{ payload: ModelParsePayload }> = ({ payload }) => {
  const model = payload.model;
  const rules = model?.reactionRules ?? [];
  const [selectedRuleId, setSelectedRuleId] = useState<string>();
  const [graphView, setGraphView] = useState<'regulatory' | 'influence'>('regulatory');
  const influenceGraph = useMemo(() => {
    const typedRules = rules as Parameters<typeof buildRuleOverlays>[0];
    return computeInfluenceGraph(buildRuleOverlays(typedRules), typedRules);
  }, [rules]);
  const selectedRule = rules.find((rule, index) => (
    getRuleId(rule as Parameters<typeof getRuleId>[0], index) === selectedRuleId
  ));

  if (!payload.success || !model) {
    return (
      <StatusCard title="BNGL model could not be parsed" tone="error">
        {payload.errors.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {payload.errors.map((error, index) => (
              <li key={`${error.line ?? 0}-${error.column ?? 0}-${index}`}>
                {error.line !== undefined ? `Line ${error.line}:${error.column ?? 0} — ` : ''}
                {error.message ?? 'Unknown parse error'}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm">No parsed model was returned.</p>}
      </StatusCard>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <header className="mb-3">
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-50">Model structure</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Rule-to-pattern flow with a compact inventory of the parsed BNGL model.
          </p>
        </header>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Metric label="Molecule types" value={model.moleculeTypes?.length ?? 0} />
          <Metric label="Seed species" value={model.species?.length ?? 0} />
          <Metric label="Rules" value={rules.length} />
          <Metric label="Observables" value={model.observables?.length ?? 0} />
          <Metric label="Parameters" value={Object.keys(model.parameters ?? {}).length} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Rule-based network views</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inspect atom–rule dependencies or causal activation and inhibition between rules.
            </p>
          </div>
          <div className="flex rounded-md border border-slate-200 p-0.5 text-xs dark:border-slate-700">
            <button
              type="button"
              onClick={() => setGraphView('regulatory')}
              className={`rounded px-2 py-1 ${graphView === 'regulatory' ? 'bg-sky-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              Regulatory graph
            </button>
            <button
              type="button"
              onClick={() => setGraphView('influence')}
              className={`rounded px-2 py-1 ${graphView === 'influence' ? 'bg-sky-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              Influence graph
            </button>
          </div>
        </div>
        {rules.length > 0 ? (
          <div className="h-[680px] min-h-[520px]">
            {graphView === 'regulatory' ? (
              <RegulatoryTab
                model={model as unknown as BNGLModel}
                selectedRuleId={selectedRuleId}
                onSelectRule={(ruleId) => setSelectedRuleId(ruleId ?? undefined)}
              />
            ) : (
              <InfluenceGraphViewer graphData={influenceGraph} />
            )}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">No reaction rules were available for the graph.</p>
        )}
      </section>

      {selectedRule && (
        <section className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-800 dark:bg-violet-950/30">
          <h2 className="font-semibold">{selectedRule.name ?? selectedRuleId}</h2>
          <p className="mt-1 font-mono text-xs">
            {selectedRule.reactionString
              ?? `${selectedRule.reactants.join(' + ')} ${selectedRule.isBidirectional ? '<->' : '->'} ${selectedRule.products.join(' + ')}`}
          </p>
          {selectedRule.rate && <p className="mt-1 text-xs">Rate: {selectedRule.rate}{selectedRule.reverseRate ? `, ${selectedRule.reverseRate}` : ''}</p>}
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">Reaction rules</h2>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr><th className="px-2 py-2">Rule</th><th className="px-2 py-2">Reaction</th><th className="px-2 py-2">Rate</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rules.map((rule, index) => {
                const id = getRuleId(rule as Parameters<typeof getRuleId>[0], index);
                return (
                  <tr key={`${id}-${index}`} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60" onClick={() => setSelectedRuleId(id)}>
                    <td className="px-2 py-2 font-medium">{rule.name ?? `Rule ${index + 1}`}</td>
                    <td className="px-2 py-2 font-mono">
                      {rule.reactionString ?? `${rule.reactants.join(' + ')} ${rule.isBidirectional ? '<->' : '->'} ${rule.products.join(' + ')}`}
                    </td>
                    <td className="px-2 py-2 font-mono">{rule.rate ?? '—'}{rule.reverseRate ? ` / ${rule.reverseRate}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const ParameterScanView: React.FC<{ payload: ParameterScanPayload }> = ({ payload }) => {
  const names = useMemo(() => getParameterScanSeries(payload), [payload]);
  const [selectedObservable, setSelectedObservable] = useState<string>();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const activeObservable = selectedObservable && names.includes(selectedObservable)
    ? selectedObservable
    : names[0];
  const rows = useMemo(() => getParameterScanRows(payload), [payload]);
  const heatmap = useMemo(
    () => activeObservable ? getParameterScanHeatmap(payload, activeObservable) : [],
    [activeObservable, payload],
  );
  const series = useMemo<TimeSeriesSeries[]>(
    () => names.map((name, index) => ({ name, color: CHART_COLORS[index % CHART_COLORS.length] })),
    [names],
  );
  const visible = useMemo(() => new Set(names.filter((name) => !hidden.has(name))), [hidden, names]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Parameter scan</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {payload.mode === '1d'
              ? `${payload.xValues.length} values of ${payload.parameter}`
              : `${payload.xValues.length} × ${payload.yValues?.length ?? 0} grid for ${payload.parameter} and ${payload.parameter2}`}
          </p>
        </div>
        {payload.mode === '2d' && names.length > 1 && (
          <label className="flex items-center gap-2 text-xs">
            Observable
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={activeObservable}
              onChange={(event) => setSelectedObservable(event.target.value)}
            >
              {names.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
      </header>
      {payload.mode === '1d' && rows.length > 0 ? (
        <TimeSeriesChart
          data={rows}
          series={series}
          visibleSeries={visible}
          onSeriesToggle={(name) => setHidden((current) => {
            const next = new Set(current);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
          })}
          onSeriesIsolate={(name) => setHidden(new Set(names.filter((candidate) => candidate !== name)))}
          xAxisKey={payload.parameter}
          xAxisLabel={payload.parameter}
          yAxisLabel="Endpoint observable"
          height={440}
          showGrid
        />
      ) : payload.mode === '2d' && activeObservable && heatmap.length > 0 ? (
        <div className="h-[520px] min-h-[360px]">
          <HeatmapChart
            data={heatmap}
            xAxisLabel={payload.parameter}
            yAxisLabel={payload.parameter2 ?? 'Parameter 2'}
            zAxisLabel={activeObservable}
          />
        </div>
      ) : (
        <StatusCard title="No plottable scan data"><p className="text-sm">The scan result contained no numeric observable grid.</p></StatusCard>
      )}
    </section>
  );
};

const ValidationGroup: React.FC<{ title: string; messages: ValidationMessagePayload[]; tone: string }> = ({ title, messages, tone }) => {
  if (messages.length === 0) return null;
  return (
    <section className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <h2 className={`mb-2 text-sm font-semibold ${tone}`}>{title} ({messages.length})</h2>
      <ul className="space-y-2">
        {messages.map((message, index) => (
          <li key={`${message.code}-${index}`} className="text-sm">
            <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-slate-800">{message.code}</span>
            {message.message}
            {message.relatedElement && <span className="ml-2 text-xs text-slate-500">({message.relatedElement})</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};

const ValidationView: React.FC<{ payload: ValidationPayload }> = ({ payload }) => {
  const nfsimValid = payload.nfsim && typeof payload.nfsim.valid === 'boolean'
    ? payload.nfsim.valid
    : undefined;
  return (
    <div className="space-y-3">
      <section className={`rounded-lg border p-4 ${payload.valid
        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
        : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'}`}>
        <h1 className="text-base font-semibold">{payload.valid ? 'Model is valid' : 'Model needs attention'}</h1>
        <p className="mt-1 text-sm">
          Parser: {payload.parseSuccess ? 'passed' : 'failed'}
          {nfsimValid !== undefined ? ` · NFsim: ${nfsimValid ? 'compatible' : 'incompatible'}` : ''}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Errors" value={payload.summary.errors} />
          <Metric label="Warnings" value={payload.summary.warnings} />
          <Metric label="Information" value={payload.summary.info} />
        </div>
      </section>
      <ValidationGroup title="Errors" messages={payload.errors} tone="text-red-700 dark:text-red-300" />
      <ValidationGroup title="Warnings" messages={payload.warnings} tone="text-amber-700 dark:text-amber-300" />
      <ValidationGroup title="Information" messages={payload.info} tone="text-sky-700 dark:text-sky-300" />
      {payload.nfsim && (
        <details className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer font-semibold">NFsim compatibility details</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-950">{JSON.stringify(payload.nfsim, null, 2)}</pre>
        </details>
      )}
    </div>
  );
};

const ErrorView: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => (
  <StatusCard title="BioNetGen tool error" tone="error">
    <p className="text-sm font-medium">{String(payload.error)}</p>
    {typeof payload.diagnosis === 'string' && <p className="mt-2 text-sm">{payload.diagnosis}</p>}
    {typeof payload.recovery === 'string' && <p className="mt-2 text-sm">Try: {payload.recovery}</p>}
  </StatusCard>
);

const ResultView: React.FC<{ payload: ResultPayload }> = ({ payload }) => {
  const kind = classifyResultPayload(payload);
  if (kind === 'error') return <ErrorView payload={payload} />;
  if (isValidationPayload(payload)) return <ValidationView payload={payload} />;
  if (isParameterScanPayload(payload)) return <ParameterScanView payload={payload} />;
  if (isModelParsePayload(payload)) return <ModelStructureView payload={payload} />;
  if (isSimulationPayload(payload)) return <SimulationView payload={payload} />;
  if (isContactMapPayload(payload)) return <ContactMapView payload={payload} />;

  return (
    <StatusCard title="Result available">
      <p className="mb-2 text-sm">This result does not yet have a specialized interactive view.</p>
      <pre className="max-h-80 overflow-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-950">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </StatusCard>
  );
};

const ResultsApp: React.FC = () => {
  const [payload, setPayload] = useState<ResultPayload>();
  const [connectionError, setConnectionError] = useState<string>();

  useEffect(() => {
    const app = new App({ name: 'BioNetGen results', version: '1.0.0' }, {}, { autoResize: true });

    const handleToolResult = (result: ToolResultLike) => {
      const nextPayload = extractResultPayload(result);
      if (nextPayload) setPayload(nextPayload);
      else setConnectionError('The host returned a result without structured or JSON content.');
    };

    app.addEventListener('toolresult', handleToolResult);
    app.addEventListener('hostcontextchanged', applyHostContext);

    void app.connect()
      .then(() => applyHostContext(app.getHostContext()))
      .catch((error: unknown) => {
        setConnectionError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      app.removeEventListener('toolresult', handleToolResult);
      app.removeEventListener('hostcontextchanged', applyHostContext);
      void app.close();
    };
  }, []);

  return (
    <main className="min-h-full bg-slate-50 p-2 text-slate-900 dark:bg-slate-950 dark:text-slate-50 sm:p-3">
      {connectionError ? (
        <StatusCard title="Unable to display the interactive result" tone="error">
          <p className="text-sm">{connectionError}</p>
        </StatusCard>
      ) : payload ? (
        <ResultView payload={payload} />
      ) : (
        <StatusCard title="Preparing BioNetGen result">
          <p role="status" className="text-sm">Waiting for the tool result…</p>
        </StatusCard>
      )}
    </main>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing MCP App root element');
createRoot(rootElement).render(<ResultsApp />);
