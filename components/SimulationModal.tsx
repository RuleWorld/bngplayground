import { useMemo } from 'react';
import { BNGLModel } from '../types';
import { ParticleAnimation } from './ParticleAnimation';

interface SimulationModalProps {
  isGenerating: boolean;
  progressMessage: string;
  onCancel: () => void;
  speciesCount?: number;
  reactionCount?: number;
  iteration?: number;
  simulationProgress?: number;  // 0-100, simulation time progress
  simTime?: number; // simulation model time (t)
  simTimeLabel?: string; // exact sim time string from logs
  phase?: 'generating' | 'simulating';
  hideNetworkStats?: boolean;
  model?: BNGLModel | null;
}

export function SimulationModal({
  isGenerating,
  progressMessage,
  onCancel,
  speciesCount = 0,
  reactionCount = 0,
  iteration = 0,
  simulationProgress,
  simTime,
  simTimeLabel,
  phase = 'generating',
  hideNetworkStats = false,
  model
}: SimulationModalProps) {
  // Determine if we're in simulation phase (have simulation progress) or generation phase
  const isSimulating = phase === 'simulating' || (simulationProgress !== undefined && simulationProgress > 0);

  // For simulation, show actual progress. For generation, show indeterminate.
  const progressPercent = useMemo(() => {
    if (isSimulating && simulationProgress !== undefined) {
      return Math.min(100, Math.round(simulationProgress));
    }
    // During generation, we don't know the final size - return null for indeterminate
    return null;
  }, [isSimulating, simulationProgress]);

  if (!isGenerating) return null;

  // Color for simulation progress
  const progressColor = 'from-teal-400 to-teal-500';

  // Determine simulation method for particle animation and display.
  // PLA is rendered with SSA-style particle animation because both are stochastic count trajectories.
  const simulationMethod = useMemo(() => {
    if (!model || !model.simulationPhases || model.simulationPhases.length === 0) return 'ode';
    
    // Check if multiphase (more than one phase)
    if (model.simulationPhases.length > 1) return 'multiphase';
    
    const phase = model.simulationPhases[0];
    if (phase.method === 'nf' || phase.method === 'nfsim') return 'nfsim';
    if (phase.method === 'pla') return 'ssa';
    if (phase.method === 'ssa') return 'ssa';
    return 'ode';
  }, [model]);

  const simulationLabel = useMemo(() => {
    if (!model || !model.simulationPhases || model.simulationPhases.length === 0) return null;
    if (model.simulationPhases.length !== 1) return null;
    const phase = model.simulationPhases[0];
    return phase.method === 'pla' ? 'PLA (Partitioned Leaping)' : null;
  }, [model]);

  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-label="Simulation progress">
      <div className="bg-white dark:bg-slate-900 dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl relative overflow-hidden">

        {/* Particle Animation Background */}
        {isSimulating && model && (
          <div className="h-64 w-full mb-4 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded overflow-hidden relative bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900">
            <ParticleAnimation type={simulationMethod as 'nfsim' | 'ode' | 'ssa' | 'multiphase'} />
            <div className="absolute bottom-2 right-2 text-xs text-slate-400 dark:text-slate-300 bg-white dark:bg-slate-900/80 dark:bg-slate-800/80 px-2 py-1 rounded">
              {simulationLabel ?? (simulationMethod === 'nfsim' 
                ? 'Network-Free Stochastic' 
                : simulationMethod === 'ssa' 
                ? 'Gillespie SSA' 
                : simulationMethod === 'multiphase'
                ? 'Multi-Phase Simulation'
                : 'ODE Integration')}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4 relative z-10">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isSimulating ? 'Simulating...' : 'Generating Network...'}
          </h3>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" aria-hidden="true" />
        </div>

        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 min-h-[1.5rem]">
          {isSimulating
            ? (simTimeLabel
                ? `Sim time: ${simTimeLabel}`
                : (typeof simTime === 'number' ? `Sim time: ${simTime.toFixed(2)}` : 'Initializing...'))
            : (progressMessage || 'Initializing...')}
        </p>

        {/* Progress Stats */}
        {!hideNetworkStats && (
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-700 rounded p-2">
              <div className="text-lg font-bold text-teal-600 dark:text-teal-400">{speciesCount.toLocaleString()}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Species</div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-700 rounded p-2">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{reactionCount.toLocaleString()}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Reactions</div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-700 rounded p-2">
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{iteration}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{isSimulating ? 'Step' : 'Iteration'}</div>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{isSimulating ? 'Simulation Progress' : 'Network Generation'}</span>
            <span>
              {isSimulating 
                ? (simTimeLabel
                    ? `t = ${simTimeLabel}`
                    : (typeof simTime === 'number'
                        ? `t = ${simTime.toFixed(2)}`
                        : (progressPercent !== null ? `${progressPercent}%` : 'Simulating...')))
                : (progressPercent !== null
                    ? `${progressPercent}%`
                    : `${speciesCount.toLocaleString()} species generated`)}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-3 overflow-hidden" role="progressbar" aria-valuenow={progressPercent ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label="Simulation progress">
            {progressPercent !== null ? (
              <div
                className={`h-full bg-gradient-to-r ${progressColor} transition-all duration-300 ease-out`}
                style={{ width: `${Math.max(2, progressPercent)}%` }}
              />
            ) : (
              // Indeterminate progress bar animation for network generation
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-teal-500 animate-pulse"
                style={{ width: '100%', opacity: 0.7 }}
              />
            )}
          </div>
        </div>

        {/* Info Message */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 text-center">
          {isSimulating
            ? 'Running simulation...'
            : 'Network size depends on model complexity'}
        </p>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
            aria-label="Cancel simulation"
          >
            Cancel
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">Large models may take up to 60 seconds</p>
      </div>
    </div>
  );
}

export default SimulationModal;
