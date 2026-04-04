import { useState, useRef, useEffect, useCallback } from 'react';
import { BNGLModel } from '../types';
import { bnglService } from '../services/bnglService';
import { generateRange } from '@bngplayground/engine';

export interface OneDPoint {
  parameterValue: number;
  observables: Record<string, number>;
}

export interface OneDResult {
  parameterName: string;
  values: OneDPoint[];
}

export interface TwoDResult {
  parameterNames: [string, string];
  xValues: number[];
  yValues: number[];
  grid: Record<string, number[][]>;
}

interface ExecutionProps {
  model: BNGLModel | null;
  scanType: '1d' | '2d';
  parameter1: string;
  parameter2: string;
  effectiveParam1Start: string;
  effectiveParam1End: string;
  effectiveParam2Start: string;
  effectiveParam2End: string;
  param1Steps: string;
  param2Steps: string;
  method: 'ode' | 'ssa';
  solver: 'auto' | 'cvode' | 'cvode_sparse' | 'rosenbrock23' | 'rk45' | 'rk4' | 'webgpu_rk4';
  tEnd: string;
  nSteps: string;
  observableNames: string[];
  paramToSpecies: Record<string, string[]>;
  isLogScale: boolean;
}

export function useParameterScanExecution(props: ExecutionProps) {
  const {
    model, scanType, parameter1, parameter2,
    effectiveParam1Start, effectiveParam1End,
    effectiveParam2Start, effectiveParam2End,
    param1Steps, param2Steps,
    method, solver, tEnd, nSteps,
    observableNames, paramToSpecies, isLogScale
  } = props;

  const [oneDResult, setOneDResult] = useState<OneDResult | null>(null);
  const [twoDResult, setTwoDResult] = useState<TwoDResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const cachedModelIdRef = useRef<number | null>(null);

  useEffect(() => {
    setOneDResult(null);
    setTwoDResult(null);
  }, [scanType]);

  const cancelActiveScan = useCallback((reason?: string) => {
    const controller = scanAbortControllerRef.current;
    if (controller) {
      controller.abort(reason ?? 'Parameter scan cancelled.');
      scanAbortControllerRef.current = null;
    }
  }, []);

  const handleRunScan = async () => {
    if (!model) {
      setError('No model is loaded to run the scan.');
      return;
    }

    cancelActiveScan('Parameter scan replaced by a new request.');

    const start1 = Number(effectiveParam1Start);
    const end1 = Number(effectiveParam1End);
    const steps1 = Math.max(1, Math.floor(Number(param1Steps)));
    if (!Number.isFinite(start1) || !Number.isFinite(end1) || Number.isNaN(steps1) || steps1 < 1) {
      setError('Please provide valid numeric settings for the primary parameter.');
      return;
    }

    const tEndValue = Number(tEnd);
    const nStepsValue = Math.max(1, Math.floor(Number(nSteps)));
    if (!Number.isFinite(tEndValue) || tEndValue <= 0 || Number.isNaN(nStepsValue) || nStepsValue < 1) {
      setError('Simulation settings must have positive numeric values for t_end and steps.');
      return;
    }

    const range1 = generateRange(start1, end1, steps1, isLogScale);
    let totalRuns = range1.length;
    let range2: number[] = [];

    if (scanType === '2d') {
      const start2 = Number(effectiveParam2Start);
      const end2 = Number(effectiveParam2End);
      const steps2 = Math.max(1, Math.floor(Number(param2Steps)));
      if (!Number.isFinite(start2) || !Number.isFinite(end2) || Number.isNaN(steps2) || steps2 < 1) {
        setError('Please provide valid numeric settings for the second parameter.');
        return;
      }
      if (parameter2 === parameter1) {
        setError('Select two different parameters for a 2D scan.');
        return;
      }
      range2 = generateRange(start2, end2, steps2, isLogScale);
      totalRuns = range1.length * range2.length;
    }

    if (totalRuns > 400) {
      setError('Please reduce the number of combinations (limit 400) to keep the scan responsive.');
      return;
    }

    setError(null);
    setIsRunning(true);
    setProgress({ current: 0, total: totalRuns });
    setOneDResult(null);
    setTwoDResult(null);

    const simulationOptions = {
      method,
      t_end: tEndValue,
      n_steps: nStepsValue,
      ...(method === 'ode' ? { solver } : {}),
    } as const;

    const controller = new AbortController();
    scanAbortControllerRef.current = controller;

    let modelId: number | null = null;

    try {
      modelId = await bnglService.prepareModel(model, { signal: controller.signal });
      cachedModelIdRef.current = modelId;

      if (scanType === '1d') {
        const result: OneDResult = { parameterName: parameter1, values: [] };
        const speciesDeps = paramToSpecies[parameter1] || [];
        let completed = 0;
        for (const value of range1) {
          const overrides: Record<string, number> = { [parameter1]: value };
          speciesDeps.forEach((sname) => {
            overrides[sname] = value;
          });

          const simResults = await bnglService.simulateCached(modelId, overrides, simulationOptions, {
            signal: controller.signal,
            description: `Parameter scan (${parameter1}=${value})`,
          });
          const lastPoint = simResults.data.at(-1) ?? {};
          const observables = observableNames.reduce<Record<string, number>>((acc, name) => {
            const raw = lastPoint[name];
            const numeric = typeof raw === 'number' ? raw : Number(raw ?? 0);
            acc[name] = Number.isFinite(numeric) ? numeric : 0;
            return acc;
          }, {});
          result.values.push({ parameterValue: value, observables });
          completed += 1;
          if (isMountedRef.current) setProgress({ current: completed, total: totalRuns });
        }
        if (isMountedRef.current) setOneDResult(result);
      } else {
        const grid: Record<string, number[][]> = {};
        observableNames.forEach((name) => {
          grid[name] = range2.map(() => new Array(range1.length).fill(0));
        });
        let completed = 0;
        const deps1 = paramToSpecies[parameter1] || [];
        const deps2 = paramToSpecies[parameter2] || [];
        for (let yi = 0; yi < range2.length; yi += 1) {
          for (let xi = 0; xi < range1.length; xi += 1) {
            const overrides: Record<string, number> = {
              [parameter1]: range1[xi],
              [parameter2]: range2[yi],
            };
            deps1.forEach((s) => (overrides[s] = range1[xi]));
            deps2.forEach((s) => (overrides[s] = range2[yi]));
            const simResults = await bnglService.simulateCached(modelId, overrides, simulationOptions, {
              signal: controller.signal,
              description: `2D parameter scan (${parameter1}, ${parameter2})`,
            });
            const lastPoint = simResults.data.at(-1) ?? {};
            observableNames.forEach((name) => {
              const raw = lastPoint[name];
              const numeric = typeof raw === 'number' ? raw : Number(raw ?? 0);
              grid[name][yi][xi] = Number.isFinite(numeric) ? numeric : 0;
            });
            completed += 1;
            if (isMountedRef.current) setProgress({ current: completed, total: totalRuns });
          }
        }
        if (isMountedRef.current) setTwoDResult({
          parameterNames: [parameter1, parameter2],
          xValues: range1,
          yValues: range2,
          grid,
        });
      }
    } catch (scanError) {
      if (scanError instanceof DOMException && scanError.name === 'AbortError') {
        const cancelledByUser = scanError.message?.includes('cancelled by user');
        if (isMountedRef.current) setError(cancelledByUser ? 'Parameter scan was cancelled.' : null);
      } else {
        const message = scanError instanceof Error ? scanError.message : String(scanError);
        if (isMountedRef.current) setError(`Parameter scan failed: ${message}`);
        if (isMountedRef.current) setOneDResult(null);
        if (isMountedRef.current) setTwoDResult(null);
      }
    } finally {
      if (isMountedRef.current) setIsRunning(false);
      const wasAborted = controller.signal.aborted;
      if (scanAbortControllerRef.current === controller) scanAbortControllerRef.current = null;

      if (typeof modelId === 'number') {
        bnglService.releaseModel(modelId).catch((err) => {
          console.warn('Failed to release cached model after parameter scan', modelId, err);
        });
        if (cachedModelIdRef.current === modelId) cachedModelIdRef.current = null;
      }

      if (!wasAborted) {
        if (isMountedRef.current) setProgress((current) => ({ ...current, current: current.total }));
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const controller = scanAbortControllerRef.current;
      if (controller) {
        try {
          controller.abort('Component unmounted: aborting parameter scan.');
        } catch (e) {
          // ignore
        }
        scanAbortControllerRef.current = null;
      }

      const id = cachedModelIdRef.current;
      if (typeof id === 'number') {
        bnglService.releaseModel(id).catch((err) => {
          console.warn('Failed to release cached model on ParameterScanTab unmount', id, err);
        });
        cachedModelIdRef.current = null;
      }
    };
  }, [model]);

  return {
    oneDResult,
    twoDResult,
    isRunning,
    progress,
    error,
    runScan: handleRunScan,
    cancelActiveScan,
    setOneDResult,
    setTwoDResult,
    setError,
    setProgress
  };
}
