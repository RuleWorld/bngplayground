import { useState, useRef, useEffect, useCallback } from 'react';
import { BNGLModel } from '../types';
import { bnglService } from '../services/bnglService';

interface SurrogateProps {
  model: BNGLModel | null;
  scanType: '1d' | '2d';
  parameter1: string;
  parameter2: string;
  observableNames: string[];
  setError: (error: string | null) => void;
}

export function useSurrogateModel({
  model,
  scanType,
  parameter1,
  parameter2,
  observableNames,
  setError
}: SurrogateProps) {
  const [useSurrogate, setUseSurrogate] = useState(false);
  const [surrogateStatus, setSurrogateStatus] = useState<'none' | 'training' | 'ready' | 'error'>('none');
  const [surrogateProgress, setSurrogateProgress] = useState<{
    phase: 'data' | 'train';
    current: number;
    total: number;
    loss: number;
  }>({ phase: 'data', current: 0, total: 0, loss: 0 });
  const [surrogateMetrics, setSurrogateMetrics] = useState<{ mse: number; mae: number; r2: number[] } | null>(null);
  const [activeBackend, setActiveBackend] = useState<string>('');

  const surrogateRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  const [surrogateTrainingSims, setSurrogateTrainingSims] = useState('200');
  const [surrogateTrainingEpochs, setSurrogateTrainingEpochs] = useState('100');
  const [surrogateNetworkSize, setSurrogateNetworkSize] = useState<'auto' | 'light' | 'standard' | 'full'>('auto');

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (surrogateRef.current) {
      surrogateRef.current.dispose?.();
      surrogateRef.current = null;
      setSurrogateStatus('none');
      setSurrogateMetrics(null);
    }
  }, [model]);

  const handleTrainSurrogate = useCallback(async () => {
    if (!model || !parameter1) return;

    const nTrainingSamples = Math.max(5, Math.min(2000, Math.floor(Number(surrogateTrainingSims) || 200)));
    const trainingEpochs = Math.max(1, Math.min(500, Math.floor(Number(surrogateTrainingEpochs) || 100)));

    setSurrogateStatus('training');
    setSurrogateProgress({ phase: 'data', current: 0, total: nTrainingSamples, loss: 0 });
    setError(null);

    try {
      const [tf, { NeuralODESurrogate, SurrogateDatasetGenerator }] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('../src/services/NeuralODESurrogate')
      ]);

      if (isMountedRef.current) {
        setActiveBackend(tf.getBackend());
      }

      const maybeSwitchBackend = async (backend: string): Promise<boolean> => {
        try {
          const current = tf.getBackend();
          if (current === backend) return true;
          const ok = await tf.setBackend(backend);
          await tf.ready();
          if (ok && isMountedRef.current) {
            setActiveBackend(backend);
          }
          return ok;
        } catch {
          return false;
        }
      };

      const isWebglBackendError = (err: unknown): boolean => {
        const msg = err instanceof Error ? err.message : String(err);
        return /(?:Failed to link vertex and fragment shaders|Failed to create WebGL context|Could not get context for WebGL|Exhausted GL driver options|Initialization of backend webgl failed|webgl creation failed|ANGLE|Exhausted GL driver)/i.test(msg);
      };

      const paramsToVary = scanType === '2d' && parameter2 ? [parameter1, parameter2] : [parameter1];
      const paramRanges: [number, number][] = paramsToVary.map(p => {
        const baseValue = model.parameters[p] ?? 1;
        return [baseValue * 0.1, baseValue * 10];
      });

      const timePoints = Array.from({ length: 51 }, (_, i) => i * 2);

      const shouldLogSample = paramRanges.every(([min, max]) => min > 0 && max / Math.max(min, 1e-12) >= 50);
      const parameterSets = shouldLogSample
        ? SurrogateDatasetGenerator
          .latinHypercubeSample(paramRanges.map(([min, max]) => [Math.log(min), Math.log(max)]), nTrainingSamples)
          .map((row) => row.map((v) => Math.exp(v)))
        : SurrogateDatasetGenerator.latinHypercubeSample(paramRanges, nTrainingSamples);

      const concentrations: number[][][] = [];
      const modelId = await bnglService.prepareModel(model, {});

      for (let i = 0; i < parameterSets.length; i++) {
        const overrides: Record<string, number> = {};
        paramsToVary.forEach((p, idx) => {
          overrides[p] = parameterSets[i][idx];
        });

        const simResult = await bnglService.simulateCached(modelId, overrides, {
          method: 'ode',
          t_end: 100,
          n_steps: 50,
          solver: 'cvode'
        } as any, {});

        const trajectory: number[][] = simResult.data.map(point =>
          observableNames.map(obs => point[obs] as number ?? 0)
        );
        concentrations.push(trajectory);

        if (isMountedRef.current) {
          setSurrogateProgress((prev) => ({
            ...prev,
            phase: 'data',
            current: i + 1,
            total: nTrainingSamples
          }));
        }

        if (i % 2 === 0) {
          await tf.nextFrame();
        }
      }

      await bnglService.releaseModel(modelId);

      const trainingData = {
        parameters: parameterSets,
        timePoints,
        concentrations
      };

      let surrogate = new NeuralODESurrogate(paramsToVary.length, observableNames.length);

      const trainWithRetry = async (): Promise<void> => {
        if (isMountedRef.current) {
          setSurrogateProgress((prev) => ({
            ...prev,
            phase: 'train',
            current: 0,
            total: trainingEpochs
          }));
        }

        try {
          await surrogate.train(trainingData, {
            epochs: trainingEpochs,
            batchSize: 16,
            validationSplit: 0.1,
            learningRate: 0.001,
            earlyStopping: true,
            patience: Math.max(10, Math.floor(trainingEpochs / 10)),
            verbose: false,
            onEpochEnd: async (epoch, logs) => {
              if (!isMountedRef.current) return;
              const loss = typeof logs?.loss === 'number' ? (logs.loss as number) : undefined;
              setSurrogateProgress((prev) => ({
                ...prev,
                phase: 'train',
                current: Math.max(prev.current, epoch + 1),
                total: trainingEpochs,
                loss: loss ?? prev.loss
              }));
            }
          });
          return;
        } catch (err) {
          console.error('Surrogate training error (attempting fallback):', err);
          if (!isWebglBackendError(err)) {
            throw err;
          }

          const switched = await maybeSwitchBackend('cpu');
          console.info('maybeSwitchBackend returned', switched, 'current backend after setBackend:', tf.getBackend());
          if (!switched) {
            throw err;
          }

          console.warn('TFJS WebGL shader link failed; falling back to CPU backend for training.');
          if (isMountedRef.current) {
            setError(`WebGL backend failed on this device. Falling back to CPU for surrogate training (slower). Error: ${String(err).slice(0, 300)}`);
          }

          surrogate.dispose();
          surrogate = new NeuralODESurrogate(paramsToVary.length, observableNames.length);

          if (isMountedRef.current) {
            setSurrogateProgress((prev) => ({
              ...prev,
              phase: 'train',
              current: 0,
              total: trainingEpochs
            }));
          }

          await surrogate.train(trainingData, {
            epochs: trainingEpochs,
            batchSize: 16,
            validationSplit: 0.1,
            learningRate: 0.001,
            earlyStopping: true,
            patience: Math.max(10, Math.floor(trainingEpochs / 10)),
            verbose: false,
            onEpochEnd: async (epoch, logs) => {
              if (!isMountedRef.current) return;
              const loss = typeof logs?.loss === 'number' ? (logs.loss as number) : undefined;
              setSurrogateProgress((prev) => ({
                ...prev,
                phase: 'train',
                current: Math.max(prev.current, epoch + 1),
                total: trainingEpochs,
                loss: loss ?? prev.loss
              }));
            }
          });
        }
      };

      try {
        await trainWithRetry();
      } catch (err) {
        console.error('Error after trainWithRetry, will attempt outer CPU retry if applicable:', err);
        if (isWebglBackendError(err)) {
          const switched = await maybeSwitchBackend('cpu');
          console.info('Outer retry maybeSwitchBackend returned', switched, 'backend now:', tf.getBackend());
          if (switched) {
            surrogate.dispose();
            surrogate = new NeuralODESurrogate(paramsToVary.length, observableNames.length);
            await trainWithRetry();
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      const testData = {
        parameters: shouldLogSample
          ? SurrogateDatasetGenerator
            .latinHypercubeSample(paramRanges.map(([min, max]) => [Math.log(min), Math.log(max)]), 20)
            .map((row) => row.map((v) => Math.exp(v)))
          : SurrogateDatasetGenerator.latinHypercubeSample(paramRanges, 20),
        timePoints,
        concentrations: [] as number[][][]
      };

      const testModelId = await bnglService.prepareModel(model, {});
      for (const params of testData.parameters) {
        const overrides: Record<string, number> = {};
        paramsToVary.forEach((p, idx) => {
          overrides[p] = params[idx];
        });

        const simResult = await bnglService.simulateCached(testModelId, overrides, {
          method: 'ode',
          t_end: 100,
          n_steps: 50,
          solver: 'cvode'
        } as any, {});

        const trajectory = simResult.data.map(point =>
          observableNames.map(obs => point[obs] as number ?? 0)
        );
        testData.concentrations.push(trajectory);
      }
      await bnglService.releaseModel(testModelId);

      const metrics = surrogate.evaluate(testData);

      surrogateRef.current = surrogate;
      if (isMountedRef.current) {
        setSurrogateStatus('ready');
        setSurrogateMetrics(metrics);
      }

    } catch (err) {
      console.error('Surrogate training failed:', err);
      if (isMountedRef.current) {
        setSurrogateStatus('error');
        setError(`Surrogate training failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [model, parameter1, parameter2, scanType, observableNames, surrogateTrainingSims, surrogateTrainingEpochs, setError]);

  return {
    useSurrogate, setUseSurrogate,
    surrogateStatus, setSurrogateStatus,
    surrogateProgress, setSurrogateProgress,
    surrogateMetrics, setSurrogateMetrics,
    activeBackend, setActiveBackend,
    surrogateTrainingSims, setSurrogateTrainingSims,
    surrogateTrainingEpochs, setSurrogateTrainingEpochs,
    surrogateNetworkSize, setSurrogateNetworkSize,
    surrogateRef,
    trainSurrogate: handleTrainSurrogate
  };
}
