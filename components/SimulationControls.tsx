
import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/Button';
import { SettingsIcon } from './icons/SettingsIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { SimulationOptions } from '../types';

interface SimulationControlsProps {
  onRun: (options: SimulationOptions) => void;
  isSimulating: boolean;
  modelExists: boolean;
  defaultMethod?: 'ode' | 'ssa' | 'nf' | 'default';
  simulationMethod?: 'ode' | 'ssa' | 'nf' | 'default';
  onMethodChange?: (method: 'ode' | 'ssa' | 'nf' | 'default') => void;
  model?: any; // BNGLModel - to extract simulation phases
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  onRun,
  isSimulating,
  modelExists,
  defaultMethod = 'default',
  simulationMethod: initialMethod,
  onMethodChange,
  model
}) => {
  const [showOptions, setShowOptions] = useState(false);
  // Local state if not controlled
  const [localMethod, setLocalMethod] = useState<'default' | 'ode' | 'ssa' | 'nf'>(defaultMethod);

  const method = initialMethod !== undefined ? initialMethod : localMethod;
  const setMethod = (m: 'default' | 'ode' | 'ssa' | 'nf') => {
    setLocalMethod(m);
    onMethodChange?.(m);
  };

  const [solver, setSolver] = useState('auto');
  const [atol, setAtol] = useState('');
  const [rtol, setRtol] = useState('');
  const [includeInfluence, setIncludeInfluence] = useState(true);

  // Determine if model has single or multiple phases
  const isMultiPhase = model?.simulationPhases && model.simulationPhases.length > 1;
  const firstPhase = model?.simulationPhases?.[0];

  // Use model's t_start/t_end for single-phase, defaults for multi-phase
  const defaultTEnd = isMultiPhase ? '100' : (firstPhase?.t_end?.toString() || '100');
  const defaultTStart = isMultiPhase ? '0' : (firstPhase?.t_start?.toString() || '0');
  const defaultNSteps = isMultiPhase ? '100' : (firstPhase?.n_steps?.toString() || '100');

  const [tEnd, setTEnd] = useState(defaultTEnd);
  const [tStart, setTStart] = useState(defaultTStart);
  const [nSteps, setNSteps] = useState(defaultNSteps);

  // Update defaults when model changes
  useEffect(() => {
    const isMulti = model?.simulationPhases && model.simulationPhases.length > 1;
    const phase = model?.simulationPhases?.[0];

    if (isMulti) {
      // Multi-phase: use defaults
      setTEnd('100');
      setTStart('0');
      setNSteps('100');
    } else if (phase) {
      // Single-phase: use model's values
      setTEnd(phase.t_end?.toString() || '100');
      setTStart(phase.t_start?.toString() || '0');
      setNSteps(phase.n_steps?.toString() || '100');
    }
  }, [model]);

  // NFsim-specific parameters
  const [utl, setUtl] = useState('');
  const [gml, setGml] = useState('');
  const [equilibrate, setEquilibrate] = useState('');
  const [nfsimVerbose, setNfsimVerbose] = useState(false);
  const [nfsimSeed, setNfsimSeed] = useState('');

  const optionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleRun = () => {
    const baseOptions: SimulationOptions = {
      method: method,
      solver: method === 'ode' ? (solver as any) : undefined,
      atol: atol ? parseFloat(atol) : undefined,
      rtol: rtol ? parseFloat(rtol) : undefined,
      t_end: parseFloat(tEnd),
      n_steps: parseFloat(nSteps),
      includeInfluence: method === 'ssa' ? includeInfluence : undefined,
    };

    // Add NFsim-specific options if NFsim method is selected
    if (method === 'nf') {
      onRun({
        ...baseOptions,
        utl: utl ? parseInt(utl) : undefined,
        gml: gml ? parseInt(gml) : undefined,
        equilibrate: equilibrate ? parseFloat(equilibrate) : undefined,
        seed: nfsimSeed ? parseInt(nfsimSeed) : undefined,
        // Note: verbose logging is handled internally by NFsim services
      } as any);
    } else {
      onRun(baseOptions);
    }
  };

  // Summary text showing current config
  const configSummary = method === 'default'
    ? 'Auto'
    : method === 'nf'
      ? 'NFsim'
      : `${method.toUpperCase()}${method === 'ode' && solver !== 'auto' ? ` • ${solver}` : ''}`;

  return (
    <div className="flex items-center gap-2">
      {/* Primary action button */}
      <Button
        onClick={handleRun}
        disabled={!modelExists || isSimulating}
        variant="primary"
        className="min-w-[100px]"
      >
        {isSimulating ? (
          <>
            <LoadingSpinner className="w-4 h-4 mr-2" />
            Running...
          </>
        ) : (
          <>▶ Run</>
        )}
      </Button>

      {/* Options button with current config summary */}
      <div className="relative" ref={optionsRef}>
        <button
          onClick={() => setShowOptions(!showOptions)}
          title="Configure simulation options"
          className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600 
                     hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200
                     hover:bg-slate-100 dark:hover:bg-slate-700 rounded border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-all"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span className="font-medium">{configSummary}</span>
          <ChevronDownIcon className={`w-3 h-3 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
        </button>

        {/* Options popover */}
        {showOptions && (
          <div className="absolute bottom-full right-0 mb-1 w-72 p-4 bg-white dark:bg-slate-800 
                          border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 ring-1 ring-black ring-opacity-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Simulation Options
              </h4>
            </div>

            {/* Method selection */}
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                Simulation Method
              </label>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-md">
                {['default', 'ode', 'ssa', 'nf'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMethod(m as typeof method)}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-all ${method === m
                      ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                  >
                    {m === 'default' ? 'Auto' : m === 'nf' ? 'NFsim' : m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">T End</label>
                <input
                  type="number"
                  value={tEnd}
                  onChange={e => setTEnd(e.target.value)}
                  className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">Steps</label>
                <input
                  type="number"
                  value={nSteps}
                  onChange={e => setNSteps(e.target.value)}
                  className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                />
              </div>
            </div>

            {/* SSA-specific options */}
            {method === 'ssa' && (
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    Track Rule Influence
                    <span
                      className="cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="Enables Dynamic Influence Network (DIN) visualization. Disabling this makes SSA significantly faster."
                    >
                      ⓘ
                    </span>
                  </label>
                  <input
                    type="checkbox"
                    checked={includeInfluence}
                    onChange={e => setIncludeInfluence(e.target.checked)}
                    className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  />
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                  Required for the "Dynamics Graph" visualization.
                </div>
              </div>
            )}

            {/* ODE-specific options */}
            {method === 'ode' && (
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">
                    Solver Algorithm
                  </label>
                  <select
                    value={solver}
                    onChange={e => setSolver(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                  >
                    <option value="auto">Auto (recommended)</option>
                    <option value="cvode">CVODE (Stiff)</option>
                    <option value="rosenbrock23">Rosenbrock23 (Stiff)</option>
                    <option value="rk45">RK45 (Non-stiff)</option>
                    <option value="cvode_sparse">CVODE Sparse</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">atol</label>
                    <input
                      type="text"
                      value={atol}
                      onChange={e => setAtol(e.target.value)}
                      placeholder="1e-6"
                      className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">rtol</label>
                    <input
                      type="text"
                      value={rtol}
                      onChange={e => setRtol(e.target.value)}
                      placeholder="1e-3"
                      className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* NFsim-specific options */}
            {method === 'nf' && (
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  <strong>NFsim Parameters</strong> - Network-free stochastic simulation
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block flex items-center gap-1">
                      UTL
                      <span
                        className="cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="Universal Traversal Limit: Controls pattern matching depth. Higher values allow more complex patterns but may slow simulation. Leave empty for auto-optimization."
                      >
                        ⓘ
                      </span>
                    </label>
                    <input
                      type="number"
                      value={utl}
                      onChange={e => setUtl(e.target.value)}
                      placeholder="Auto"
                      className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block flex items-center gap-1">
                      GML
                      <span
                        className="cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="Global Molecule Limit: Maximum number of molecules in the simulation. Prevents memory exhaustion. Leave empty for default (1,000,000)."
                      >
                        ⓘ
                      </span>
                    </label>
                    <input
                      type="number"
                      value={gml}
                      onChange={e => setGml(e.target.value)}
                      placeholder="1000000"
                      className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block flex items-center gap-1">
                      Equilibrate
                      <span
                        className="cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="Equilibration time: Run simulation for this duration before recording data. Useful for reaching steady state."
                      >
                        ⓘ
                      </span>
                    </label>
                    <input
                      type="number"
                      value={equilibrate}
                      onChange={e => setEquilibrate(e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block flex items-center gap-1">
                      Seed
                      <span
                        className="cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="Random seed: Set for reproducible stochastic simulations. Leave empty for random seed."
                      >
                        ⓘ
                      </span>
                    </label>
                    <input
                      type="number"
                      value={nfsimSeed}
                      onChange={e => setNfsimSeed(e.target.value)}
                      placeholder="Random"
                      className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                    />
                  </div>
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                  <strong>Note:</strong> NFsim is ideal for models with large or infinite state spaces.
                  For small models, ODE or SSA methods may be faster.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
