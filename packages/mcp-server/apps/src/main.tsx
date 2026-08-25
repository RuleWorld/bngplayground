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
import { TimeSeriesChart, type TimeSeriesSeries } from '../../../../components/charts/TimeSeriesChart';
import { CHART_COLORS } from '../../../../src/utils/chartColors';
import '../../../../index.css';

import {
  classifyResultPayload,
  extractResultPayload,
  getSimulationData,
  getSimulationSeries,
  isContactMapPayload,
  isSimulationPayload,
  type ContactMapPayload,
  type ResultPayload,
  type SimulationPayload,
  type ToolResultLike,
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

const ErrorView: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => (
  <StatusCard title="BioNetGen tool error" tone="error">
    <p className="text-sm font-medium">{String(payload.error)}</p>
    {typeof payload.diagnosis === 'string' && <p className="mt-2 text-sm">{payload.diagnosis}</p>}
    {typeof payload.recovery === 'string' && <p className="mt-2 text-sm">Try: {payload.recovery}</p>}
  </StatusCard>
);

const ResultView: React.FC<{ payload: ResultPayload }> = ({ payload }) => {
  const kind = classifyResultPayload(payload);
  if (isSimulationPayload(payload)) return <SimulationView payload={payload} />;
  if (isContactMapPayload(payload)) return <ContactMapView payload={payload} />;
  if (kind === 'error') return <ErrorView payload={payload} />;

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
