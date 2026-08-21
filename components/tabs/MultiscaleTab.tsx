import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // Clean up worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const handleCancel = useCallback(() => {
    if (workerRef.current) {
      const msg: MultiscaleWorkerRequest = { type: 'cancel' };
      workerRef.current.postMessage(msg);
    }
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

      worker.onmessage = (event: MessageEvent<MultiscaleWorkerResponse>) => {
        const msg = event.data ?? { type: 'error', message: 'Empty or undefined worker response' };

        switch (msg.type) {
          case 'progress':
            setProgress(msg.fraction);
            break;

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

          default:
            console.warn('[MultiscaleTab] Received unexpected worker response:', msg);
            setError(`Unexpected response from multiscale worker: ${String((msg as any)?.type ?? 'unknown')}`);
            setIsRunning(false);
            if (workerRef.current) {
              workerRef.current.terminate();
              workerRef.current = null;
            }
            break;
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
    } catch (err: any) {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      setError(err.message || 'Failed to start simulation');
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

    const w = canvas.width;
    const h = canvas.height;
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

    const scaleX = w / maxX;
    const scaleY = h / maxY;

    // Unique cell types for coloring
    const cellTypes = Array.from(new Set(snapshot.cells.map(c => c.cellType)));

    // Draw cells
    for (const cell of snapshot.cells) {
      if (cell.phase === 'dead') continue;

      const x = cell.position[0] * scaleX;
      const y = cell.position[1] * scaleY;
      const r = Math.max(2, cell.radius * Math.min(scaleX, scaleY));
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

      <div className="flex gap-4 flex-1 min-h-0">
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
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              Cell Population View
            </h3>
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={500}
                height={400}
                className="w-full rounded bg-slate-900"
                style={{ imageRendering: 'auto', maxHeight: '350px' }}
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
    </div>
  );
};
