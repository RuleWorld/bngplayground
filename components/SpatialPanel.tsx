/**
 * SpatialPanel.tsx — Spatial simulation tab panel.
 *
 * Integrates: SpatialViewer (3D), spatialService (worker), and simulation controls.
 * Docks into the existing VisualizationPanel tab system.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SpatialViewer } from './SpatialViewer';
import { spatialService } from '../services/spatialService';
import type { SpatialSimulationState } from '../services/spatialService';
import type {
  SpatialSnapshot,
  SpatialSimulationResult,
  SpatialSimulationConfig,
  CompartmentGeometry,
} from '@bngplayground/engine';
import { DEFAULT_SPATIAL_CONFIG } from '@bngplayground/engine';

interface SpatialPanelProps {
  /** Current BNGL model text from the editor */
  bnglText: string;
}

export const SpatialPanel: React.FC<SpatialPanelProps> = ({ bnglText }) => {
  const [state, setState] = useState<SpatialSimulationState>('idle');
  const [snapshot, setSnapshot] = useState<SpatialSnapshot | null>(null);
  const [result, setResult] = useState<SpatialSimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [geometries, setGeometries] = useState<CompartmentGeometry[]>([]);
  const [speciesNames, setSpeciesNames] = useState<Map<number, string>>(new Map());
  const [viewerSize, setViewerSize] = useState({ width: 800, height: 600 });

  // Configuration state
  const [config, setConfig] = useState<Partial<SpatialSimulationConfig>>({
    ...DEFAULT_SPATIAL_CONFIG,
    tEnd: 1e-3,
    nOutput: 100,
    seed: 1,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const tEndRef = useRef<HTMLInputElement>(null);
  const dtRef = useRef<HTMLInputElement>(null);
  const controlsHeight = 48;

  // Resize observer for responsive viewer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewerSize({
        width: entry.contentRect.width,
        height: Math.max(200, entry.contentRect.height - controlsHeight),
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleRun = useCallback(async () => {
    setError(null);
    setValidationError(null);
    setResult(null);
    setSnapshot(null);

    const tEndRaw = parseFloat(tEndRef.current?.value ?? '');
    const dtRaw = parseFloat(dtRef.current?.value ?? '');
    const tEnd = !isNaN(tEndRaw) ? tEndRaw : DEFAULT_SPATIAL_CONFIG.tEnd;
    const dt = !isNaN(dtRaw) ? dtRaw : DEFAULT_SPATIAL_CONFIG.dt;

    // Validation
    const errors: string[] = [];
    if (dt <= 0) errors.push('dt must be positive');
    if (tEnd <= 0) errors.push('t_end must be positive');
    if (dt > tEnd) errors.push(`dt (${dt}) cannot exceed t_end (${tEnd})`);
    if (errors.length > 0) {
      setValidationError(errors.join('; '));
      return;
    }

    const runConfig = { ...config, tEnd, dt };

    await spatialService.init(bnglText, runConfig, {
      onStateChange: (s) => setState(s),
      onInitialized: ({ geometries, speciesNames }) => {
        setGeometries(geometries);
        setSpeciesNames(new Map(Object.entries(speciesNames).map(([k, v]) => [parseInt(k), v])));
      },
      onSnapshot: (snap) => setSnapshot(snap),
      onComplete: (res) => {
        setResult(res);
      },
      onError: (msg) => {
        setError(msg);
        setState('error');
      },
    });
  }, [bnglText, config]);

  const handleStop = useCallback(() => {
    spatialService.cancel();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      spatialService.terminate();
    };
  }, []);

  const isRunning = state === 'running' || state === 'initializing';

  return (
    <div ref={containerRef} className="flex flex-col w-full h-full bg-gray-950 text-gray-200">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900/80 border-b border-gray-800">
        <button
          onClick={isRunning ? handleStop : handleRun}
          disabled={state === 'initializing'}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all
            ${isRunning
              ? 'bg-red-600/90 hover:bg-red-500 text-white'
              : 'bg-primary-600 hover:bg-primary-500 text-white'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          {state === 'initializing' ? '⏳ Loading...' : isRunning ? '⏹ Stop' : '▶ Run Spatial'}
        </button>

        {/* Parameter inputs */}
        <div className="flex items-center gap-2 text-xs">
          <label className="text-gray-400">
            t_end:
            <input
              type="text"
              ref={tEndRef}
              defaultValue={DEFAULT_SPATIAL_CONFIG.tEnd}
              className="w-20 ml-1 px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-200"
              disabled={isRunning}
            />
          </label>
          <label className="text-gray-400">
            dt:
            <input
              type="text"
              ref={dtRef}
              defaultValue={DEFAULT_SPATIAL_CONFIG.dt}
              className="w-20 ml-1 px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-200"
              disabled={isRunning}
            />
          </label>
          <label className="text-gray-400">
            seed:
            <input
              type="number"
              value={config.seed ?? DEFAULT_SPATIAL_CONFIG.seed}
              onChange={(e) => setConfig(c => ({ ...c, seed: parseInt(e.target.value) || DEFAULT_SPATIAL_CONFIG.seed }))}
              className="w-16 ml-1 px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-200"
              disabled={isRunning}
            />
          </label>
        </div>

        {/* Validation error */}
        {validationError && (
          <div className="ml-4 text-xs text-red-400 font-mono truncate" title={validationError}>
            {validationError}
          </div>
        )}

        {/* Status badges */}
        <div className="ml-auto flex items-center gap-2 text-xs">
          {state === 'complete' && (
            <span className="px-2 py-0.5 bg-green-900/60 text-green-300 rounded-full">
              ✓ Complete
            </span>
          )}
          {state === 'error' && (
            <span className="px-2 py-0.5 bg-red-900/60 text-red-300 rounded-full" title={error ?? ''}>
              ✕ Error
            </span>
          )}
          {snapshot && (
            <span className="text-gray-500">
              {snapshot.moleculeCount} molecules
            </span>
          )}
        </div>
      </div>

      {/* 3D Viewer */}
      <div className="flex-1 relative">
        {state === 'idle' && !result ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center space-y-3">
              <div className="text-5xl">🔬</div>
              <div className="text-lg font-medium">Spatial Simulation</div>
              <div className="text-sm max-w-sm">
                Run a particle-based spatial simulation of your BNGL model.
                Molecules diffuse in 3D and react upon collision using rule-based reaction resolution.
              </div>
              <button
                onClick={handleRun}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-all"
              >
                ▶ Start Simulation
              </button>
            </div>
          </div>
        ) : (
          <SpatialViewer
            snapshot={snapshot}
            geometries={geometries}
            speciesNames={speciesNames}
            width={viewerSize.width}
            height={viewerSize.height}
            isRunning={isRunning}
          />
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 bg-red-900/40 border-t border-red-800 text-red-200 text-xs font-mono">
          {error}
        </div>
      )}
    </div>
  );
};
