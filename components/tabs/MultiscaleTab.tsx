import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { InfoIcon } from '../icons/InfoIcon';
import { CHART_COLORS } from '../../src/utils/chartColors';
import { useTheme } from '../../hooks/useTheme';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { MultiscaleWorkerRequest, MultiscaleWorkerResponse } from '../../services/multiscaleWorker';
import { ResultsExportControl } from '../ResultsExportDialog';
import { createStructuredAnalysisResultsExportDescriptor } from '../../services/resultsExport';
import { computeViewTransform } from './multiscaleView';

interface MultiscaleTabProps {
  bnglCode: string;
}

interface CellStateUI {
  id: number;
  cellType: string;
  position: [number, number, number];
  radius: number;
  phase: string;
  observables: Record<string, number>;
}

interface SnapshotUI {
  time: number;
  cells: CellStateUI[];
  populationCounts: Record<string, number>;
  meanObservables: Record<string, Record<string, number>>;
}

const EXAMPLE_DEFINITION = `{
  "name": "Simple Growth",
  "cellTypes": {
    "cell": {
      "model": "begin parameters\\n  k 0.01\\nend parameters\\nbegin molecule types\\n  A()\\nend molecule types\\nbegin seed species\\n  A() 10\\nend seed species\\nbegin observables\\n  Molecules A_count A()\\nend observables\\nbegin reaction rules\\n  A() -> 0 k\\nend reaction rules",
      "radius": 5.0,
      "motility": 0.5,
      "decisions": [
        { "name": "divide", "when": "A_count > 5", "then": "divide", "probability": 0.3 },
        { "name": "death", "when": "A_count < 1", "then": "die" }
      ]
    }
  },
  "extracellular": {
    "species": [
      { "name": "signal", "D": 100, "degradation": 0.1, "initial": 0.5 }
    ]
  },
  "domain": { "dimensions": 2, "size": [50, 50, 1], "boundary": "reflective" },
  "population": [
    { "cellType": "cell", "count": 5, "region": "center" }
  ],
  "time": { "end": 10, "dtIntra": 0.1, "dtExtra": 0.5, "dtDecision": 1.0, "outputs": 10 }
}`;

export const MultiscaleTab: React.FC<MultiscaleTabProps> = ({ bnglCode: _bnglCode }) => {
  const [theme] = useTheme();
  const isDark = theme === 'dark';

  const [definition, setDefinition] = useState(EXAMPLE_DEFINITION);
  const [isRunning, setIsRunning] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotUI[]>([]);
  const [currentSnapshotIdx, setCurrentSnapshotIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [populationTimeSeries, setPopulationTimeSeries] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);

  // Clean up worker on unmount
  useEffect(() => {
    return () => {
      runIdRef.current++;
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const handleCancel = useCallback(() => {
    runIdRef.current++;
    if (workerRef.current) {
      const msg: MultiscaleWorkerRequest = { type: 'cancel' };
      workerRef.current.postMessage(msg);
      // Fallback: forcefully terminate if worker does not acknowledge within 500ms
      const activeWorker = workerRef.current;
      setTimeout(() => {
        if (workerRef.current === activeWorker) {
          activeWorker.terminate();
          workerRef.current = null;
          setIsRunning(false);
          setProgress(0);
        }
      }, 500);
    }
    setIsRunning(false);
  }, []);
  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    setSnapshots([]);
    setPopulationTimeSeries([]);
    setProgress(0);

    // Terminate any existing worker
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    try {
      const parsed = JSON.parse(definition);

      const worker = new Worker(
        new URL('../../services/multiscaleWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      const runId = ++runIdRef.current;
      const isStale = () => runId !== runIdRef.current;

      worker.onmessage = (event: MessageEvent<MultiscaleWorkerResponse>) => {
        const msg = event.data ?? { type: 'error' as const, message: 'Empty or undefined worker response' };
        if (isStale()) return; // ignore messages from a superseded run

        switch (msg.type) {
          case 'progress':
            setProgress(msg.fraction);
            break;

          case 'cancelled': {
            setIsRunning(false);
            setProgress(0);
            if (workerRef.current) {
              workerRef.current.terminate();
              workerRef.current = null;
            }
            break;
          }

          case 'complete': {
            const result = msg.result;
            setSnapshots(result.snapshots);
            if (result.snapshots.length > 0) {
              setCurrentSnapshotIdx(result.snapshots.length - 1);
            }
            // Build population time series for chart
            const tsData = result.populationTimeSeries.time.map((t: number, i: number) => {
              const point: Record<string, number> = { time: t };
              for (const [type, counts] of Object.entries(result.populationTimeSeries.counts)) {
                point[type] = (counts as number[])[i];
              }
              return point;
            });
            setPopulationTimeSeries(tsData);
            setIsRunning(false);
            setProgress(1);
            workerRef.current = null; // worker finished naturally
            break;
          }

          case 'error':
            setError(msg.message);
            setIsRunning(false);
            if (workerRef.current) {
              workerRef.current.terminate();
              workerRef.current = null;
            }
            break;

          default: {
            const raw: unknown = event.data;
            const unknownType = typeof raw === 'object' && raw !== null && 'type' in raw
              ? String(raw.type)
              : 'unknown';
            console.warn('[MultiscaleTab] Received unexpected worker response:', msg);
            setError(`Unexpected response from multiscale worker: ${unknownType}`);
            setIsRunning(false);
            if (workerRef.current) {
              workerRef.current.terminate();
              workerRef.current = null;
            }
            break;
          }
        }
      };

      worker.onerror = (err) => {
        setError(err.message || 'Worker error');
        setIsRunning(false);
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
      };

      worker.onmessageerror = (event) => {
        console.error('[MultiscaleTab] Worker failed to deserialize message:', event.data);
        setError('Multiscale worker failed to deserialize message');
        setIsRunning(false);
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
      };

      const msg: MultiscaleWorkerRequest = { type: 'run_from_definition', definition: parsed };
      worker.postMessage(msg);
    } catch (err: unknown) {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      setError(err instanceof Error ? err.message : 'Failed to start simulation');
      setIsRunning(false);
    }
  }, [definition]);

  // Draw cells on canvas
  const drawCells = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || snapshots.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const snapshot = snapshots[currentSnapshotIdx];
    if (!snapshot) return;

    // Size the drawing buffer to the displayed box (× devicePixelRatio) so the
    // browser never stretches the bitmap; drawing happens in CSS pixels.
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 1 || h < 1) return;
    const bufW = Math.round(w * dpr);
    const bufH = Math.round(h * dpr);
    if (canvas.width !== bufW || canvas.height !== bufH) {
      canvas.width = bufW;
      canvas.height = bufH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Get domain bounds from cell positions
    let maxX = 200, maxY = 200;
    try {
      const parsed = JSON.parse(definition);
      maxX = parsed.domain?.size?.[0] || 200;
      maxY = parsed.domain?.size?.[1] || 200;
    } catch {
      // Ignore parse errors for sizing fallback
    }

    // Uniform scale + centring: the domain keeps its aspect ratio at any
    // canvas size, so cells stay circular and trajectories do not skew while
    // scrubbing the timeline slider.
    const { scale, offX, offY } = computeViewTransform(maxX, maxY, w, h);

    // Unique cell types for coloring
    const cellTypes = Array.from(new Set(snapshot.cells.map(c => c.cellType)));

    // Draw cells
    for (const cell of snapshot.cells) {
      if (cell.phase === 'dead') continue;

      const x = offX + cell.position[0] * scale;
      const y = offY + cell.position[1] * scale;
      const r = Math.max(2, cell.radius * scale);
      const colorIdx = cellTypes.indexOf(cell.cellType);
      const color = CHART_COLORS[colorIdx % CHART_COLORS.length];

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = cell.phase === 'apoptotic' ? '#64748b' : color;
      ctx.globalAlpha = cell.phase === 'apoptotic' ? 0.3 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff22';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Time label
    ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
    ctx.font = '12px Arial';
    ctx.fillText(`t = ${snapshot.time.toFixed(1)}`, 8, 18);
    ctx.fillText(`${snapshot.cells.filter(c => c.phase !== 'dead').length} cells`, 8, 34);
  }, [snapshots, currentSnapshotIdx, definition]);

  // Redraw when snapshot changes
  React.useEffect(() => { drawCells(); }, [drawCells]);

  // Keep the drawing buffer in sync with the displayed canvas size so
  // resizing the window or panel never stretches or squashes the view.
  React.useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => drawCells());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [drawCells]);

  const fullPopulationRows = populationTimeSeries;
  const currentSnapshot = snapshots[currentSnapshotIdx];
  const currentCellHeaders = useMemo(() => {
    // Observables are homogeneous across cells of a run; scanning the current
    // snapshot is sufficient and avoids O(snapshots × cells) work on each render.
    const observableHeaders = new Set<string>();
    if (currentSnapshot) {
      for (const cell of currentSnapshot.cells) {
        for (const key of Object.keys(cell.observables)) {
          observableHeaders.add(key);
        }
      }
    }
    return ['id', 'cell_type', 'x', 'y', 'z', 'radius', 'phase', ...observableHeaders];
  }, [currentSnapshot]);
  const currentCellRows = useMemo(() => {
    if (!currentSnapshot) return [] as Record<string, unknown>[];
    return currentSnapshot.cells.map((cell) => ({
      id: cell.id,
      cell_type: cell.cellType,
      x: cell.position[0],
      y: cell.position[1],
      z: cell.position[2],
      radius: cell.radius,
      phase: cell.phase,
      ...cell.observables,
    }));
  }, [currentSnapshot]);
  const exportDescriptor = useMemo(() => {
    if (snapshots.length === 0 || fullPopulationRows.length === 0) return null;
    const populationHeaders = Object.keys(fullPopulationRows[0]);
    return createStructuredAnalysisResultsExportDescriptor({
      analysisType: 'Multiscale simulation',
      filenamePrefix: 'multiscale',
      result: { definition, snapshots, populationTimeSeries },
      resultFileName: 'multiscale-result',
      resultLabel: 'Complete multiscale simulation result',
      resultDescription: 'Cell snapshots, lineage, intracellular observables, and extracellular population trajectories.',
      settings: { definition },
      fullTable: {
        path: 'data/population-time-series.csv',
        label: 'Complete population time series',
        description: 'Cell counts for every output time and cell type.',
        rows: fullPopulationRows,
        headers: populationHeaders,
      },
      currentTable: {
        path: 'data/current-snapshot-cells.csv',
        label: 'Current cell snapshot',
        description: 'The cells shown at the selected timeline position, with positions and observables.',
        rows: currentCellRows,
        headers: currentCellHeaders,
      },
    });
  }, [currentCellHeaders, currentCellRows, definition, fullPopulationRows, populationTimeSeries, snapshots]);

  return (
    <div className="space-y-4 h-full flex flex-col overflow-auto p-2">
      <div className="p-3 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 flex items-start gap-3 shrink-0">
        <InfoIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <p className="text-sm">
          <b>Multi-Scale Modeling:</b> Combine intracellular BNGL models with cell-agent decisions
          (divide, die, migrate) and extracellular diffusion. Each cell has its own intracellular
          simulation state. The first browser-native tool to combine rule-based dynamics with
          agent-based cell populations.
        </p>
      </div>

      {/* While the syntax help is open the row keeps its natural height and
          the container scrolls, instead of squeezing the row (whose children
          would otherwise paint over the expanded help). */}
      <div className={`flex gap-4 ${helpOpen ? 'flex-none' : 'flex-1 min-h-0'}`}>
        {/* Model Editor (left) */}
        <Card className="w-80 shrink-0 p-3 flex flex-col">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 uppercase tracking-wide">
            Model Definition (JSON)
          </h3>
          <textarea
            value={definition}
            onChange={e => setDefinition(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono resize-none min-h-[200px]"
            spellCheck={false}
            aria-label="Model definition JSON"
          />
          <div className="flex gap-2 mt-2">
            <Button onClick={handleRun} disabled={isRunning}>
              {isRunning && <LoadingSpinner className="w-3 h-3 mr-1" />}
              {isRunning ? `Running (${Math.round(progress * 100)}%)...` : 'Run Simulation'}
            </Button>
            {isRunning && (
              <Button variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDefinition(EXAMPLE_DEFINITION)} disabled={isRunning}>
              Reset
            </Button>
          </div>
        </Card>

        {/* Visualization (center) */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {error && (
            <div className="p-2 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Cell view */}
          <Card className="flex-1 p-3 min-h-[250px]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Cell Population View
              </h3>
              {exportDescriptor && <ResultsExportControl descriptor={exportDescriptor} className="px-3 py-1.5 text-xs" />}
            </div>
            <div className="relative" ref={canvasWrapRef}>
              <canvas
                ref={canvasRef}
                width={500}
                height={400}
                className="block w-full rounded bg-slate-900"
                style={{ imageRendering: 'auto', aspectRatio: '5 / 4', maxHeight: '350px' }}
              />
              {snapshots.length === 0 && !isRunning && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm pointer-events-none">
                  Click "Run Simulation" to visualize cell dynamics
                </div>
              )}
            </div>
          </Card>

          {/* Timeline slider */}
          {snapshots.length > 1 && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs text-slate-500">t=0</span>
              <input
                type="range"
                min={0}
                max={snapshots.length - 1}
                value={currentSnapshotIdx}
                onChange={e => setCurrentSnapshotIdx(Number(e.target.value))}
                className="flex-1"
                aria-label="Time slider"
              />
              <span className="text-xs text-slate-500">
                t={snapshots[snapshots.length - 1]?.time?.toFixed(1)}
              </span>
            </div>
          )}

          {/* Population dynamics chart */}
          {populationTimeSeries.length > 0 && (
            <Card className="p-3 h-48 shrink-0">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Population Dynamics
              </h3>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={populationTimeSeries}>
                  <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#cbd5e1" strokeOpacity={0.45} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} label={{ value: 'Time', position: 'bottom', fontSize: 10, offset: 0 }} />
                  <YAxis tick={{ fontSize: 10 }} label={{ value: 'Cell Count', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {Object.keys(populationTimeSeries[0] || {})
                    .filter(k => k !== 'time')
                    .map((key, i) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        strokeWidth={2.25}
                        dot={false}
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      </div>

      {/* Syntax help — describes the model definition JSON accepted by the editor */}
      <details
        open={helpOpen}
        onToggle={(e) => setHelpOpen(e.currentTarget.open)}
        className="shrink-0 border border-slate-200 dark:border-slate-700 rounded-lg p-4"
      >
        <summary className="font-semibold cursor-pointer select-none text-sm text-slate-700 dark:text-slate-200">
          📖 Syntax Help — model definition reference
        </summary>
        <div className="mt-3 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The editor takes one JSON object (double-quoted keys and strings). The intracellular
            model is a single string with <code>\n</code> line breaks. Fields marked
            <b> required</b> are validated before a run starts; everything else has the stated default.
          </p>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1">
              Top-level fields
            </h4>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr>
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">name</td>
                  <td className="align-top py-1">Optional label for the model.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">cellTypes</td>
                  <td className="align-top py-1"><b>Required.</b> One or more cell type definitions (below). Keys are the type names used by <code>population</code> and <code>change_type()</code>.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">extracellular</td>
                  <td className="align-top py-1">Optional diffusible signals: <code>{'{ "species": [ … ] }'}</code>.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">domain</td>
                  <td className="align-top py-1"><b>Required.</b> The spatial arena (below).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">population</td>
                  <td className="align-top py-1">Optional initial cells (below).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">time</td>
                  <td className="align-top py-1"><b>Required.</b> The four simulation clocks (below).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">maxCells</td>
                  <td className="align-top py-1">Optional cap on live cells; divisions are suppressed once reached.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">seed</td>
                  <td className="align-top py-1">Optional RNG seed for reproducible runs.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1">
              cellTypes entries
            </h4>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr>
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">model</td>
                  <td className="align-top py-1">Intracellular BNGL program as one JSON string (<code>\n</code> between lines) with <code>begin/end</code> blocks: <code>parameters</code>, <code>molecule types</code>, <code>seed species</code>, <code>observables</code>, <code>reaction rules</code>. Every cell runs its own instance.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">radius</td>
                  <td className="align-top py-1">Initial cell radius in domain units (default 5.0).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">motility</td>
                  <td className="align-top py-1">Random-walk speed in domain units per time unit: each decision step the cell drifts <code>motility × dtDecision</code>. <code>0</code> = immotile.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">decisions</td>
                  <td className="align-top py-1">Ordered rules evaluated every <code>dtDecision</code>. <b>The first rule whose condition holds fires; checking stops there.</b></td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">secretes</td>
                  <td className="align-top py-1">Optional <code>[{'{ species, driven_by, rate }'}]</code>: each step secretes into extracellular <code>species</code> at rate <code>(intracellular observable driven_by) × rate</code>.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">uptakes</td>
                  <td className="align-top py-1">Optional <code>[{'{ species, sets_parameter, rate }'}]</code>: each step reads the local extracellular <code>species</code> concentration into the intracellular observable <code>sets_parameter</code> as <code>concentration × rate</code>.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1">
              Decision rules (entries of decisions)
            </h4>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr>
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">name</td>
                  <td className="align-top py-1">Rule identifier — used to track its refractory cooldown.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">when</td>
                  <td className="align-top py-1">Condition: <code>&lt;observable&gt; &lt;op&gt; &lt;number&gt;</code>, e.g. <code>pERK &gt;= 0.5</code>. Operators: <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code>, <code>==</code>, <code>!=</code>. The observable is read from this cell's intracellular state (BNGL <code>observables</code> or values set by <code>uptakes</code>); an unknown name reads as <code>0</code>.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">then</td>
                  <td className="align-top py-1">Action performed when the rule fires — see the action table below.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">probability</td>
                  <td className="align-top py-1">Optional chance of firing on each qualifying check (default 1).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">refractory</td>
                  <td className="align-top py-1">Optional minimum time before this rule can fire again.</td>
                </tr>
              </tbody>
            </table>
            <table className="w-full text-xs border-collapse mt-2">
              <tbody>
                <tr>
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">divide</td>
                  <td className="align-top py-1">Cell divides; the daughter receives half of each molecular count.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">die</td>
                  <td className="align-top py-1">Cell enters apoptosis and is removed from the population.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">secrete(species, rate)</td>
                  <td className="align-top py-1">Start emitting the extracellular <code>species</code> at a constant <code>rate</code> until stopped.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">stop_secrete(species)</td>
                  <td className="align-top py-1">Set that secretion rate back to 0.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">migrate(random, speed)</td>
                  <td className="align-top py-1">Move <code>speed</code> domain units in a random direction this decision step.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">chemotaxis(species, speed)</td>
                  <td className="align-top py-1">Move <code>speed</code> units up the concentration gradient of <code>species</code>.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">change_type(typeName)</td>
                  <td className="align-top py-1">Switch this cell to another declared cell type (takes effect immediately).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">set_parameter(name, value)</td>
                  <td className="align-top py-1">Set an intracellular BNGL parameter for this cell.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1">
              Extracellular species, domain, population, time
            </h4>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr>
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">species[].name</td>
                  <td className="align-top py-1">Identifier referenced by <code>secrete</code>, <code>stop_secrete</code>, <code>chemotaxis</code>, and <code>uptakes</code>.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">species[].D</td>
                  <td className="align-top py-1">Diffusion constant (must be ≥ 0).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">species[].degradation</td>
                  <td className="align-top py-1">Optional first-order decay rate.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">species[].initial</td>
                  <td className="align-top py-1">Optional initial uniform concentration (default 0).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">domain.dimensions</td>
                  <td className="align-top py-1"><code>2</code> or <code>3</code>.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">domain.size</td>
                  <td className="align-top py-1"><code>[x, y]</code> (2D) or <code>[x, y, z]</code> (3D), all values &gt; 0. The view maps the whole arena to the canvas while keeping this aspect ratio.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">domain.boundary</td>
                  <td className="align-top py-1">Cell behavior at a wall: <code>reflective</code> bounces back, <code>periodic</code> wraps to the opposite side, <code>absorbing</code> kills the cell.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">domain.resolution</td>
                  <td className="align-top py-1">Optional extracellular grid resolution <code>[nx, ny]</code> / <code>[nx, ny, nz]</code>; default 20×20 (2D) or 20×20×20 (3D).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">population[].cellType</td>
                  <td className="align-top py-1">Must match a key of <code>cellTypes</code>.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">population[].count</td>
                  <td className="align-top py-1">Number of initial cells.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">population[].region</td>
                  <td className="align-top py-1">Reserved — initial cells are currently placed at the center of the domain.</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">time.end</td>
                  <td className="align-top py-1">Total simulation time (&gt; 0).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">time.dtIntra</td>
                  <td className="align-top py-1">Intracellular ODE integration step for each cell (&gt; 0).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">time.dtExtra</td>
                  <td className="align-top py-1">Extracellular PDE update step (&gt; 0).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">time.dtDecision</td>
                  <td className="align-top py-1">How often conditions, actions, and motility are evaluated (&gt; 0).</td>
                </tr>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="align-top py-1 pr-3 font-mono whitespace-nowrap">time.outputs</td>
                  <td className="align-top py-1">Snapshots after t = 0 (&gt; 0). The timeline slider shows <code>outputs + 1</code> frames, from t = 0 to t = end.</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </details>
    </div>
  );
};
