import React, { useState, useCallback, useMemo, useRef } from 'react';
import { BNGLModel, SimulationOptions, SimulationResults } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { InfoIcon } from '../icons/InfoIcon';
import { CHART_COLORS } from '../../src/utils/chartColors';
import { ResultsExportControl } from '../ResultsExportDialog';
import { createStructuredAnalysisResultsExportDescriptor } from '../../services/resultsExport';


interface TemporalAnalysisTabProps {
  model: BNGLModel | null;
  results: SimulationResults | null;
  onSimulate: (options: SimulationOptions) => void;
  onCancelSimulation: () => void;
  isSimulating: boolean;
  modelSource?: string | null;
}

interface MutualInformationUI {
  pair: {
    reaction1: number;
    reaction2: number;
    reaction1Name?: string;
    reaction2Name?: string;
  };
  mutualInformation: number;
  normalizedMI: number;
  pValue: number;
}

interface TransferEntropyUI {
  source: number;
  target: number;
  sourceName?: string;
  targetName?: string;
  transferEntropy: number;
  reverseTE: number;
  netInformationFlow: number;
  pValue: number;
}

interface PhaseLockingUI {
  pair: { reaction1: number; reaction2: number };
  phaseLockingValue: number;
  dominantPhaseOffset: number;
  isLocked: boolean;
}

interface CausalComparisonUI {
  concordant: Array<{ source: number; target: number; empiricalWeight: number }>;
  structuralOnly: Array<{ source: number; target: number }>;
  emergent: Array<{ source: number; target: number; empiricalWeight: number }>;
}

interface ITResultUI {
  mutualInformation: MutualInformationUI[];
  transferEntropy: TransferEntropyUI[];
  phaseLocking: PhaseLockingUI[];
  entropy: Array<{ reactionIndex: number; name?: string; entropy: number }>;
  empiricalCausalGraph: Array<{ source: number; target: number; weight: number }>;
}

export const TemporalAnalysisTab: React.FC<TemporalAnalysisTabProps> = ({
  model, results, onSimulate, onCancelSimulation, isSimulating, modelSource,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [itResult, setItResult] = useState<ITResultUI | null>(null);
  const [causalComparison, setCausalComparison] = useState<CausalComparisonUI | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'piano_roll' | 'mutual_info' | 'transfer_entropy' | 'causal'>('piano_roll');
  const [zoom, setZoom] = useState<{ min: number; max: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const firingLog = results?.firingLog;

  React.useEffect(() => {
    setItResult(null);
    setCausalComparison(null);
    setZoom(null);
  }, [results]);

  const handleRunSSA = useCallback(() => {
    if (!model) return;
    onSimulate({
      method: 'ssa',
      t_end: model.simulationOptions?.t_end || 100,
      n_steps: model.simulationOptions?.n_steps || 200,
      recordFirings: true,
      maxFiringEvents: 100000,
    } as SimulationOptions);
  }, [model, onSimulate]);

  const handleAnalyze = useCallback(async () => {
    if (!firingLog || firingLog.length === 0) return;
    setIsAnalyzing(true);
    setError(null);
    await new Promise((resolve) => setTimeout(resolve, 30));

    try {
      const engine = await import('@bngplayground/engine');
      if (engine.analyzeReactionInformation) {
        const reactionsList = results?.expandedReactions || model?.reactions || [];
        const nReactions = reactionsList.length > 0
          ? reactionsList.length
          : Math.max(...firingLog.map(e => e.reactionIndex), -1) + 1;

        const result = engine.analyzeReactionInformation({
          firingLog,
          nReactions,
        });
        setItResult(result);

        if (engine.compareCausalGraphs) {
          const structuralEdges: Array<{ source: number; target: number }> = [];
          for (let i = 0; i < reactionsList.length; i++) {
            const productsI = new Set(reactionsList[i].products ?? []);
            if (productsI.size === 0) continue;
            for (let j = 0; j < reactionsList.length; j++) {
              if (i === j) continue;
              const reactantsJ = reactionsList[j].reactants ?? [];
              if (reactantsJ.some((r) => productsI.has(r))) {
                structuralEdges.push({ source: i, target: j });
              }
            }
          }

          const comparison = engine.compareCausalGraphs(
            result.empiricalCausalGraph,
            structuralEdges,
          );
          setCausalComparison(comparison);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [firingLog, model, results]);

  const pianoRollData = useMemo(() => {
    if (!firingLog || firingLog.length === 0) return null;

    const keyToGroup = new Map<string, number>();
    const reactionNames = new Map<number, string>();
    const reactionTimes = new Map<number, number[]>();

    for (const event of firingLog) {
      const key = event.ruleName || `R${event.reactionIndex + 1}`;
      let group = keyToGroup.get(key);
      if (group === undefined) {
        group = keyToGroup.size;
        keyToGroup.set(key, group);
        reactionNames.set(group, key);
        reactionTimes.set(group, []);
      }
      reactionTimes.get(group)!.push(event.time);
    }

    for (const times of reactionTimes.values()) {
      times.sort((a, b) => a - b);
    }

    return { reactionNames, reactionTimes };
  }, [firingLog]);

  const exportDescriptor = useMemo(() => {
    if (!firingLog || firingLog.length === 0) return null;
    const firingRows = firingLog.map((event) => ({
      time: event.time,
      reaction_index: event.reactionIndex,
      reaction: event.ruleName ?? `R${event.reactionIndex + 1}`,
      propensity: event.propensity,
    }));
    const firingHeaders = ['time', 'reaction_index', 'reaction', 'propensity'];
    let currentRows: Record<string, unknown>[] = firingRows;
    let currentHeaders: string[] = firingHeaders;

    if (viewMode === 'mutual_info' && itResult) {
      currentRows = itResult.mutualInformation.map((entry) => ({
        reaction_1: entry.pair.reaction1Name ?? `R${entry.pair.reaction1 + 1}`,
        reaction_2: entry.pair.reaction2Name ?? `R${entry.pair.reaction2 + 1}`,
        mutual_information: entry.mutualInformation,
        normalized_mi: entry.normalizedMI,
        p_value: entry.pValue,
      }));
      currentHeaders = ['reaction_1', 'reaction_2', 'mutual_information', 'normalized_mi', 'p_value'];
    } else if (viewMode === 'transfer_entropy' && itResult) {
      currentRows = itResult.transferEntropy.map((entry) => ({
        source: entry.sourceName ?? `R${entry.source + 1}`,
        target: entry.targetName ?? `R${entry.target + 1}`,
        transfer_entropy: entry.transferEntropy,
        reverse_transfer_entropy: entry.reverseTE,
        net_information_flow: entry.netInformationFlow,
        p_value: entry.pValue,
      }));
      currentHeaders = ['source', 'target', 'transfer_entropy', 'reverse_transfer_entropy', 'net_information_flow', 'p_value'];
    } else if (viewMode === 'causal' && causalComparison) {
      currentRows = [
        ...causalComparison.concordant.map((entry) => ({ category: 'concordant', source: entry.source, target: entry.target, weight: entry.empiricalWeight })),
        ...causalComparison.structuralOnly.map((entry) => ({ category: 'structural_only', source: entry.source, target: entry.target, weight: '' })),
        ...causalComparison.emergent.map((entry) => ({ category: 'emergent', source: entry.source, target: entry.target, weight: entry.empiricalWeight })),
      ];
      currentHeaders = ['category', 'source', 'target', 'weight'];
    } else if (zoom) {
      currentRows = firingRows.filter((row) => row.time >= zoom.min && row.time <= zoom.max);
    }

    return createStructuredAnalysisResultsExportDescriptor({
      analysisType: 'Temporal information analysis',
      filenamePrefix: 'temporal-analysis',
      result: { firingLog, information: itResult, causalComparison },
      resultFileName: 'temporal-result',
      resultLabel: 'Firing events and information-flow analysis',
      resultDescription: 'Reaction-firing events and any completed mutual-information, transfer-entropy, or causal-comparison results.',
      modelSource,
      settings: { recordedFiringEvents: firingLog.length },
      fullTable: {
        path: 'data/firing-log.csv',
        label: 'Complete reaction firing log',
        description: 'All recorded firing events from the completed SSA simulation.',
        rows: firingRows,
        headers: firingHeaders,
      },
      currentTable: {
        path: 'data/current-view.csv',
        label: 'Current temporal view',
        description: 'The currently selected temporal analysis table or firing-log window.',
        rows: currentRows,
        headers: currentHeaders,
      },
    });
  }, [causalComparison, firingLog, itResult, modelSource, viewMode, zoom]);

  if (!model) {
    return (
      <div className="text-slate-500 dark:text-slate-300 p-4">
        Parse a model to run temporal information-theoretic analysis.
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col overflow-auto p-2">
      <div className="p-3 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 flex items-start gap-3 shrink-0">
        <InfoIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <p className="text-sm">
          <b>Temporal Information Theory:</b> Analyzes individual reaction firing events from SSA
          trajectories using mutual information, transfer entropy, and phase locking to discover
          causal relationships between reactions — including emergent couplings not explicit in
          any single rule.
        </p>
      </div>

      {/* Controls */}
      <Card className="p-4 shrink-0">
        <div className="flex gap-2 items-center flex-wrap">
          <Button onClick={handleRunSSA} disabled={isSimulating}>
            {isSimulating && <LoadingSpinner className="w-4 h-4 mr-2" />}
            {isSimulating ? 'Running SSA...' : '1. Run SSA with Firing Log'}
          </Button>
          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !firingLog || firingLog.length === 0}
            variant={firingLog && firingLog.length > 0 ? 'primary' : 'secondary'}
          >
            {isAnalyzing && <LoadingSpinner className="w-4 h-4 mr-2" />}
            {isAnalyzing ? 'Analyzing...' : '2. Analyze Information Flow'}
          </Button>
          {isSimulating && (
            <Button variant="danger" onClick={onCancelSimulation}>Cancel</Button>
          )}
          {firingLog && (
            <span className="text-xs text-slate-500 dark:text-slate-300">
              {firingLog.length.toLocaleString()} firing events recorded
            </span>
          )}
          {exportDescriptor && <ResultsExportControl descriptor={exportDescriptor} className="px-3 py-1.5 text-xs" />}
        </div>
      </Card>

      {isAnalyzing && (
        <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-200 text-sm flex items-center gap-2 shrink-0" role="status" aria-live="polite">
          <LoadingSpinner className="w-4 h-4" />
          Computing information flow across reactions… this can take a few seconds for busy trajectories.
        </div>
      )}

      {error && (
        <div className="p-3 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm" role="alert">
          {error}
        </div>
      )}

      {/* View mode tabs */}
      {(firingLog || itResult) && (
        <div className="flex gap-1 shrink-0" role="tablist" aria-label="Analysis view mode">
          {(['piano_roll', 'mutual_info', 'transfer_entropy', 'causal'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              role="tab"
              aria-selected={viewMode === mode}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {mode === 'piano_roll' ? 'Piano Roll' :
               mode === 'mutual_info' ? 'Mutual Information' :
               mode === 'transfer_entropy' ? 'Transfer Entropy' :
               'Causal Comparison'}
            </button>
          ))}
        </div>
      )}

      {/* Piano Roll Visualization */}
      {viewMode === 'piano_roll' && pianoRollData && (
        <Card className="p-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
            Reaction Firing Piano Roll
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-300 mb-3">
            Each row is a reaction channel. Vertical ticks mark individual firing events.
            <b> Look for:</b> dense bands (high activity), gaps (quiescent periods), and
            correlated patterns between rows (reactions that fire together).
          </p>
          {(() => {
            const tFullMin = 0;
            const tFullMax = firingLog![firingLog!.length - 1]?.time || 1;
            const lo = zoom ? zoom.min : tFullMin;
            const hi = zoom ? zoom.max : tFullMax;
            const step = (tFullMax - tFullMin) / 1000 || 0.001;
            return (
              <div className="flex flex-col gap-1 mb-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="w-10">Start</span>
                  <input type="range" min={tFullMin} max={tFullMax} step={step} value={lo}
                    onChange={(e) => setZoom({ min: Math.min(Number(e.target.value), hi - step), max: hi })}
                    className="flex-1" aria-label="Piano roll window start time" />
                  <span className="w-16 text-right font-mono">{lo.toPrecision(3)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10">End</span>
                  <input type="range" min={tFullMin} max={tFullMax} step={step} value={hi}
                    onChange={(e) => setZoom({ min: lo, max: Math.max(Number(e.target.value), lo + step) })}
                    className="flex-1" aria-label="Piano roll window end time" />
                  <span className="w-16 text-right font-mono">{hi.toPrecision(3)}</span>
                </div>
                {zoom && (
                  <button onClick={() => setZoom(null)}
                    aria-label="Reset zoom"
                    className="self-start mt-1 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                    Reset zoom
                  </button>
                )}
              </div>
            );
          })()}
          {(() => {
            const nRows = pianoRollData.reactionNames.size;
            const rowAreaH = nRows * 40;
            const tickAreaH = 30;
            const totalH = Math.max(300, rowAreaH + tickAreaH + 16);
            return (
          <svg
            ref={svgRef}
            width="100%"
            height={totalH}
            style={{ height: `${totalH}px` }}
            viewBox={`0 0 1000 ${totalH}`}
            className="bg-white dark:bg-slate-900 rounded"
            role="img"
            aria-label="Reaction firing piano roll visualization"
          >
            {(() => {
              const tFullMin = 0;
              const tFullMax = firingLog![firingLog!.length - 1]?.time || 1;
              const tMin = zoom ? zoom.min : tFullMin;
              const tMax = zoom ? zoom.max : tFullMax;
              const reactions = Array.from(pianoRollData.reactionNames.entries())
                .sort((a, b) => a[0] - b[0]);
              const axisY = rowAreaH + 15;

              return (
                <>
                  <line x1={100} y1={axisY} x2={970} y2={axisY} stroke="#cbd5e1" strokeWidth={1} />

                  {Array.from({ length: 11 }, (_, i) => {
                    const x = 100 + (i / 10) * 870;
                    const t = tMin + (i / 10) * (tMax - tMin);
                    return (
                      <g key={`grid-${i}`}>
                        <line x1={x} y1={15} x2={x} y2={rowAreaH + 15}
                          stroke="#e2e8f0" strokeWidth={0.5} />
                        <text x={x} y={axisY + 14} textAnchor="middle"
                          fontSize="11" fill="#64748b" fontWeight="500">{t.toPrecision(3)}</text>
                      </g>
                    );
                  })}

                  {reactions.map(([rxnIdx, name], row) => {
                    const y = row * 40 + 15;
                    const rowH = 34;
                    const times = pianoRollData.reactionTimes.get(rxnIdx) || [];
                    const color = CHART_COLORS[row % CHART_COLORS.length];
                    return (
                      <g key={`rxn-${rxnIdx}`}>
                        <text x={95} y={y + rowH / 2 + 4} textAnchor="end" fontSize="11" fill="#334155" fontWeight="500">
                          {name.length > 14 ? name.substring(0, 14) + '\u2026' : name}
                        </text>
                        <rect x={100} y={y} width={870} height={rowH}
                          fill={row % 2 === 0 ? '#f8fafc' : '#f1f5f9'} opacity={0.6}
                          rx={2} />
                        <text x={975} y={y + rowH / 2 + 4} textAnchor="start" fontSize="9" fill="#94a3b8">
                          {times.length.toLocaleString()}
                        </text>
                        {(times.length > 3000
                          ? times.filter((_, i) => i % Math.ceil(times.length / 3000) === 0)
                          : times
                        ).filter((t) => t >= tMin && t <= tMax).map((t, i) => {
                          const x = 100 + ((t - tMin) / (tMax - tMin)) * 870;
                          return (
                            <line key={i} x1={x} y1={y + 2} x2={x} y2={y + rowH - 2}
                              stroke={color} strokeWidth={1} opacity={0.75} />
                          );
                        })}
                      </g>
                    );
                  })}

                  <text x={500} y={axisY + 30} textAnchor="middle" fontSize="13" fontWeight="bold" fill="#0f172a">Time</text>
                </>
              );
            })()}
          </svg>
            );
          })()}
        </Card>
      )}

      {/* Mutual Information Heatmap */}
      {viewMode === 'mutual_info' && itResult && (
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
            Mutual Information Between Reactions
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-300 mb-4">
            Mutual information (MI) measures how much knowing one reaction's firing pattern tells you about another's.
            <b> Normalized MI</b> ranges from 0 (independent) to 1 (perfectly correlated).
            <b> p-value</b> tests significance via shuffle — values below 0.05 (*) indicate the coupling is unlikely due to chance.
          </p>
          {itResult.mutualInformation.length > 0 ? (
            <div className="overflow-auto">
              <table className="text-sm border-collapse w-full table-fixed">
                <colgroup>
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '13%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-slate-200 dark:border-slate-600">
                    <th scope="col" className="p-2 text-left text-slate-600 dark:text-slate-300 font-semibold">Reaction Pair</th>
                    <th scope="col" className="p-2 text-right text-slate-600 dark:text-slate-300 font-semibold">MI (bits)</th>
                    <th scope="col" className="p-2 text-right text-slate-600 dark:text-slate-300 font-semibold">Normalized</th>
                    <th scope="col" className="p-2 text-right text-slate-600 dark:text-slate-300 font-semibold">p-value</th>
                    <th scope="col" className="p-2 text-center text-slate-600 dark:text-slate-300 font-semibold">Sig.</th>
                  </tr>
                </thead>
                <tbody>
                  {itResult.mutualInformation
                    .sort((a, b) => b.normalizedMI - a.normalizedMI)
                    .slice(0, 20)
                    .map((mi, i) => (
                      <tr key={i} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-2 font-medium truncate">
                          {mi.pair.reaction1Name || `R${mi.pair.reaction1 + 1}`} ↔{' '}
                          {mi.pair.reaction2Name || `R${mi.pair.reaction2 + 1}`}
                        </td>
                        <td className="p-2 text-right font-mono">{mi.mutualInformation.toFixed(4)}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(3, mi.normalizedMI * 100)}%`,
                                  backgroundColor: CHART_COLORS[0],
                                }}
                              />
                            </div>
                            <span className="font-mono w-12 text-right">{mi.normalizedMI.toFixed(3)}</span>
                          </div>
                        </td>
                        <td className="p-2 text-right font-mono">{mi.pValue.toFixed(3)}</td>
                        <td className="p-2 font-semibold">
                          {mi.pValue < 0.001 ? <span className="text-green-600">***</span> : mi.pValue < 0.01 ? <span className="text-green-600">**</span> : mi.pValue < 0.05 ? <span className="text-amber-600">*</span> : <span className="text-slate-400">ns</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No significant mutual information detected.</p>
          )}
        </Card>
      )}

      {/* Transfer Entropy */}
      {viewMode === 'transfer_entropy' && itResult && (
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
            Transfer Entropy — Directed Information Flow
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-300 mb-4">
            Transfer entropy (TE) measures <b>directional causality</b>: how much knowing reaction A's past reduces
            uncertainty about reaction B's future. <b>Net Flow</b> = TE(A→B) − TE(B→A).
            Positive (green) means A drives B; negative (red) means B drives A.
          </p>
          {itResult.transferEntropy.length > 0 ? (
            <div className="overflow-auto">
              <table className="text-sm border-collapse w-full table-fixed">
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-slate-200 dark:border-slate-600">
                    <th scope="col" className="p-2 text-left text-slate-600 dark:text-slate-300 font-semibold">Source → Target</th>
                    <th scope="col" className="p-2 text-right text-slate-600 dark:text-slate-300 font-semibold">TE (bits)</th>
                    <th scope="col" className="p-2 text-right text-slate-600 dark:text-slate-300 font-semibold">Reverse TE</th>
                    <th scope="col" className="p-2 text-right text-slate-600 dark:text-slate-300 font-semibold">Net Flow</th>
                    <th scope="col" className="p-2 text-right text-slate-600 dark:text-slate-300 font-semibold">p-value</th>
                  </tr>
                </thead>
                <tbody>
                  {itResult.transferEntropy
                    .sort((a, b) => Math.abs(b.netInformationFlow) - Math.abs(a.netInformationFlow))
                    .slice(0, 20)
                    .map((te, i) => (
                      <tr key={i} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-2 font-medium">
                          {te.sourceName || `R${te.source + 1}`} → {te.targetName || `R${te.target + 1}`}
                        </td>
                        <td className="p-2 text-right font-mono">{te.transferEntropy.toFixed(4)}</td>
                        <td className="p-2 text-right font-mono">{te.reverseTE.toFixed(4)}</td>
                        <td className="p-2 text-right font-mono font-semibold">
                          <span className={te.netInformationFlow > 0 ? 'text-green-600' : 'text-red-600'}>
                            {te.netInformationFlow > 0 ? '+' : ''}{te.netInformationFlow.toFixed(4)}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono">{te.pValue.toFixed(3)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No significant transfer entropy detected.</p>
          )}
        </Card>
      )}

      {/* Causal Comparison */}
      {viewMode === 'causal' && causalComparison && (
        <Card className="p-5">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
            Structural vs. Empirical Causal Graph
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-300 mb-4">
            Compares causality encoded in your BNGL rules (structural) with causality discovered from the SSA dynamics (empirical).
            <b> Concordant</b> = both agree. <b>Structural Only</b> = rule exists but doesn't matter dynamically.
            <b className="text-amber-600"> Emergent</b> = causal coupling discovered by dynamics that isn't in any single rule — <i>the most scientifically interesting category</i>.
          </p>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">
                Concordant ({causalComparison.concordant.length})
              </h4>
              <p className="text-xs text-slate-500 mb-3">Rules confirmed by dynamics</p>
              <div className="space-y-1 max-h-40 overflow-auto">
                {causalComparison.concordant.map((c, i) => (
                  <div key={i} className="text-xs p-1 bg-green-50 dark:bg-green-900/20 rounded">
                    R{c.source + 1} → R{c.target + 1}
                    <span className="text-slate-400 ml-1">({c.empiricalWeight.toFixed(3)})</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-500 mb-2">
                Structural Only ({causalComparison.structuralOnly.length})
              </h4>
              <p className="text-xs text-slate-500 mb-2">Rule exists but doesn't matter dynamically</p>
              <div className="space-y-1 max-h-40 overflow-auto">
                {causalComparison.structuralOnly.map((c, i) => (
                  <div key={i} className="text-xs p-1 bg-slate-50 dark:bg-slate-800 rounded">
                    R{c.source + 1} → R{c.target + 1}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">
                Emergent ({causalComparison.emergent.length})
              </h4>
              <p className="text-xs text-slate-500 mb-3">Not in rules — discovered by dynamics</p>
              <div className="space-y-1 max-h-40 overflow-auto">
                {causalComparison.emergent.map((c, i) => (
                  <div key={i} className="text-xs p-1 bg-amber-50 dark:bg-amber-900/20 rounded">
                    R{c.source + 1} → R{c.target + 1}
                    <span className="text-amber-600 ml-1">
                      ({c.empiricalWeight.toFixed(3)} bits)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!firingLog && !isSimulating && (
        <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-300 text-sm">
          Run an SSA simulation with firing log to begin temporal analysis.
        </div>
      )}
    </div>
  );
};
