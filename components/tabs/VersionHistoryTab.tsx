import React, { useState, useCallback, useMemo } from 'react';
import { BNGLModel, SimulationOptions, SimulationResults } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { InfoIcon } from '../icons/InfoIcon';

interface SemanticDiffUI {
  addedRules: Array<{ rule: string; name?: string; humanDescription: string }>;
  removedRules: Array<{ rule: string; name?: string; humanDescription: string }>;
  modifiedRules: Array<{
    oldRule: string; newRule: string; name?: string;
    changeType: string; humanDescription: string;
  }>;
  parameterChanges: Array<{ name: string; oldValue?: number; newValue?: number; changeType: string }>;
  speciesChanges: Array<{ name: string; changeType: string }>;
  observableChanges: Array<{ name: string; changeType: string }>;
  moleculeTypeChanges: Array<{ name: string; changeType: string }>;
  structuralChanges: number;
  parametricChanges: number;
  totalChanges: number;
}

interface ModelVersionUI {
  id: string;
  parentId: string | null;
  branchName: string;
  timestamp: number;
  code: string;
  diff: SemanticDiffUI;
  label?: string;
  metadata?: { source: string; tool?: string };
}

interface VersionDAGUI {
  versions: Map<string, ModelVersionUI>;
  rootId: string;
  headId: string;
  branches: Map<string, string>;
}

interface VersionHistoryTabProps {
  model: BNGLModel | null;
  bnglCode: string;
  onCodeChange: (code: string) => void;
  results: SimulationResults | null;
  onSimulate: (options: SimulationOptions) => void;
  isSimulating: boolean;
}

export const VersionHistoryTab: React.FC<VersionHistoryTabProps> = ({
  model, bnglCode, onCodeChange, results, onSimulate, isSimulating,
}) => {
  const [dag, setDag] = useState<VersionDAGUI | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ModelVersionUI | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [bisectionProperty, setBisectionProperty] = useState<string>('');
  const [bisectionObservable, setBisectionObservable] = useState<string>('');
  const [bisectionThreshold, setBisectionThreshold] = useState<number>(0);
  const [bisectionResult, setBisectionResult] = useState<any>(null);
  const [isBisecting, setIsBisecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize DAG from current code
  const initializeDAG = useCallback(async () => {
    try {
      const engine = await import('@bngplayground/engine');
      if (engine.createVersionDAG) {
        const newDag = engine.createVersionDAG(bnglCode, 'Initial model');
        setDag(newDag);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [bnglCode]);

  // Save current code as a new version
  const saveVersion = useCallback(async () => {
    if (!dag) {
      await initializeDAG();
      return;
    }
    try {
      const engine = await import('@bngplayground/engine');
      if (engine.recordVersion) {
        const version = engine.recordVersion(dag, bnglCode, { source: 'ui' });
        setDag({ ...dag });
        setSelectedVersion(version);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [dag, bnglCode, initializeDAG]);

  // Get history as array
  const history = useMemo(() => {
    if (!dag) return [];
    try {
      const versions: ModelVersionUI[] = [];
      let currentId: string | null = dag.headId;
      while (currentId) {
        const version = dag.versions.get(currentId);
        if (!version) break;
        versions.push(version);
        currentId = version.parentId;
      }
      return versions;
    } catch {
      return [];
    }
  }, [dag]);

  // Load a version's code into the editor
  const loadVersion = useCallback((version: ModelVersionUI) => {
    onCodeChange(version.code);
  }, [onCodeChange]);

  // Run behavioral bisection
  const handleBisect = useCallback(async () => {
    if (!dag || !bisectionObservable) return;
    setIsBisecting(true);
    setBisectionResult(null);
    setError(null);

    try {
      const engine = await import('@bngplayground/engine');
      if (engine.bisectBehavior) {
        const property = {
          kind: 'observable_value' as const,
          observable: bisectionObservable,
          time: model?.simulationOptions?.t_end || 100,
          predicate: 'above' as const,
          threshold: bisectionThreshold,
        };
        const simulatorFn = async (code: string, options: any) => {
          // Simulate and return results
          const m = engine.parseBNGLWithANTLR(code);
          if (!m.model) throw new Error('Parse error');
          const expanded = await engine.generateExpandedNetwork(m.model);
          return await engine.simulate(0, expanded, options, {
            checkCancelled: () => {},
            postMessage: () => {},
          });
        };
        const result = await engine.bisectBehavior(
          dag,
          property,
          simulatorFn,
          { method: 'ode', t_end: 100, n_steps: 200 },
        );
        setBisectionResult(result);
      }
    } catch (err: any) {
      setError(err.message || 'Bisection failed');
    } finally {
      setIsBisecting(false);
    }
  }, [dag, bisectionObservable, bisectionThreshold, model]);

  // Format timestamp
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  };

  if (!model) {
    return (
      <div className="text-slate-500 dark:text-slate-400 p-4">
        Parse a model to use version tracking.
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col overflow-auto p-2">
      <div className="p-3 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 flex items-start gap-3 shrink-0">
        <InfoIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <p className="text-sm">
          <b>Model Version History:</b> Track every edit with semantic diffs (rule additions,
          rate changes, etc.). Binary search through history to find which edit caused a behavioral
          change.
        </p>
      </div>

      {/* Controls */}
      <Card className="p-4 shrink-0">
        <div className="flex gap-2 items-center">
          <Button onClick={saveVersion}>
            {dag ? 'Save Version' : 'Start Tracking'}
          </Button>
          {history.length > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {history.length} version{history.length !== 1 ? 's' : ''} tracked
            </span>
          )}
        </div>
      </Card>

      {error && (
        <div className="p-3 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Timeline (left panel) */}
        <Card className="w-64 p-3 overflow-auto shrink-0">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 uppercase tracking-wide">
            Version Timeline
          </h3>
          {history.length === 0 ? (
            <p className="text-xs text-slate-400">No versions yet. Click "Start Tracking" to begin.</p>
          ) : (
            <div className="space-y-1">
              {history.map((version, idx) => {
                const isHead = version.id === dag?.headId;
                const isSelected = selectedVersion?.id === version.id;
                const changeColor = version.diff.structuralChanges > 0
                  ? 'bg-blue-500' : version.diff.parametricChanges > 0
                  ? 'bg-orange-500' : 'bg-slate-400';

                return (
                  <button
                    key={version.id}
                    onClick={() => setSelectedVersion(version)}
                    className={`w-full text-left p-2 rounded-md text-xs transition-colors ${
                      isSelected
                        ? 'bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${changeColor} shrink-0`}
                        style={{ transform: `scale(${Math.min(1.5, 0.8 + version.diff.totalChanges * 0.15)})` }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {version.label || `Version ${history.length - idx}`}
                          {isHead && <span className="ml-1 text-blue-600 dark:text-blue-400">(HEAD)</span>}
                        </div>
                        <div className="text-slate-400 truncate">
                          {formatTime(version.timestamp)} · {version.diff.totalChanges} change{version.diff.totalChanges !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Detail panel (center) */}
        <div className="flex-1 space-y-4 overflow-auto">
          {selectedVersion ? (
            <>
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {selectedVersion.label || `Version ${selectedVersion.id.slice(0, 8)}`}
                  </h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => loadVersion(selectedVersion)}>
                      Load This Version
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={() => setCompareVersionId(selectedVersion.id)}>
                      Compare From Here
                    </Button>
                  </div>
                </div>

                {/* Semantic Diff */}
                <div className="space-y-2">
                  {selectedVersion.diff.addedRules.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">
                        Added Rules ({selectedVersion.diff.addedRules.length})
                      </h4>
                      {selectedVersion.diff.addedRules.map((r, i) => (
                        <div key={i} className="text-xs p-1.5 bg-green-50 dark:bg-green-900/20 rounded mb-1 font-mono">
                          <span className="text-green-700 dark:text-green-300">+ {r.rule}</span>
                          <div className="text-green-600 dark:text-green-400 font-sans mt-0.5">
                            {r.humanDescription}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedVersion.diff.removedRules.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                        Removed Rules ({selectedVersion.diff.removedRules.length})
                      </h4>
                      {selectedVersion.diff.removedRules.map((r, i) => (
                        <div key={i} className="text-xs p-1.5 bg-red-50 dark:bg-red-900/20 rounded mb-1 font-mono">
                          <span className="text-red-700 dark:text-red-300">- {r.rule}</span>
                          <div className="text-red-600 dark:text-red-400 font-sans mt-0.5">
                            {r.humanDescription}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedVersion.diff.modifiedRules.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                        Modified Rules ({selectedVersion.diff.modifiedRules.length})
                      </h4>
                      {selectedVersion.diff.modifiedRules.map((r, i) => (
                        <div key={i} className="text-xs p-1.5 bg-amber-50 dark:bg-amber-900/20 rounded mb-1 font-mono">
                          <div className="text-red-600 dark:text-red-400">- {r.oldRule}</div>
                          <div className="text-green-600 dark:text-green-400">+ {r.newRule}</div>
                          <div className="text-amber-600 dark:text-amber-400 font-sans mt-0.5">
                            {r.humanDescription}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedVersion.diff.parameterChanges.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-1">
                        Parameter Changes ({selectedVersion.diff.parameterChanges.length})
                      </h4>
                      <table className="text-xs w-full">
                        <tbody>
                          {selectedVersion.diff.parameterChanges.map((p, i) => (
                            <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                              <td className="py-0.5 font-mono">{p.name}</td>
                              <td className="py-0.5 text-right">
                                {p.changeType === 'modified' ? (
                                  <span>
                                    <span className="text-red-500">{p.oldValue}</span>
                                    {' → '}
                                    <span className="text-green-500">{p.newValue}</span>
                                  </span>
                                ) : p.changeType === 'added' ? (
                                  <span className="text-green-500">+ {p.newValue}</span>
                                ) : (
                                  <span className="text-red-500">- {p.oldValue}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {selectedVersion.diff.totalChanges === 0 && (
                    <p className="text-xs text-slate-400">Initial version — no changes.</p>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Select a version from the timeline to view its details.
            </div>
          )}

          {/* Bisection Interface */}
          {history.length >= 3 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
                Behavioral Bisection
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Find which version caused a behavioral change using binary search.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
                    Observable
                  </label>
                  <select
                    value={bisectionObservable}
                    onChange={e => setBisectionObservable(e.target.value)}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="">Select...</option>
                    {model?.observables?.map(o => (
                      <option key={o.name} value={o.name}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
                    Threshold
                  </label>
                  <input
                    type="number"
                    value={bisectionThreshold}
                    onChange={e => setBisectionThreshold(Number(e.target.value))}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                    step="any"
                  />
                </div>
                <div className="flex items-end">
                  <Button size="sm" onClick={handleBisect}
                    disabled={isBisecting || !bisectionObservable}>
                    {isBisecting && <LoadingSpinner className="w-3 h-3 mr-1" />}
                    {isBisecting ? 'Bisecting...' : 'Find Causing Edit'}
                  </Button>
                </div>
              </div>
              {bisectionResult && (
                <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs">
                  <p className="font-semibold text-amber-700 dark:text-amber-400">
                    Behavioral change found at version: {bisectionResult.transitionVersion?.label || bisectionResult.transitionVersion?.id?.slice(0, 8)}
                  </p>
                  <p className="text-amber-600 dark:text-amber-300 mt-1">
                    {bisectionResult.explanation}
                  </p>
                  <p className="text-slate-500 mt-1">
                    {bisectionResult.simulationsRun} simulations performed
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
