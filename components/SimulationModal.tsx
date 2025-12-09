import { useMemo } from 'react';

interface SimulationModalProps {
  isGenerating: boolean;
  progressMessage: string;
  onCancel: () => void;
  speciesCount?: number;
  reactionCount?: number;
  iteration?: number;
  simulationProgress?: number;  // 0-100, simulation time progress
  phase?: 'generating' | 'simulating';
}

export function SimulationModal({ 
  isGenerating, 
  progressMessage, 
  onCancel,
  speciesCount = 0,
  reactionCount = 0,
  iteration = 0,
  simulationProgress,
  phase = 'generating'
}: SimulationModalProps) {
  if (!isGenerating) return null;

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

  // Color for simulation progress
  const progressColor = 'from-teal-400 to-teal-500';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isSimulating ? 'Simulating...' : 'Generating Network...'}
          </h3>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" />
        </div>

        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 min-h-[1.5rem]">{progressMessage || 'Initializing...'}</p>

        {/* Progress Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div className="bg-slate-100 dark:bg-slate-700 rounded p-2">
            <div className="text-lg font-bold text-teal-600 dark:text-teal-400">{speciesCount.toLocaleString()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Species</div>
          </div>
          <div className="bg-slate-100 dark:bg-slate-700 rounded p-2">
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{reactionCount.toLocaleString()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Reactions</div>
          </div>
          <div className="bg-slate-100 dark:bg-slate-700 rounded p-2">
            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{iteration}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{isSimulating ? 'Step' : 'Iteration'}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{isSimulating ? 'Simulation Progress' : 'Network Generation'}</span>
            <span>
              {progressPercent !== null
                ? `${progressPercent}%`
                : `${speciesCount.toLocaleString()} species generated`}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-3 overflow-hidden">
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
            ? 'Running ODE simulation...'
            : 'Network size depends on model complexity'}
        </p>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
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
