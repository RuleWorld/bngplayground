import React, { useState, useCallback, useMemo, useRef } from 'react';
import { BNGLModel, SimulationOptions, SimulationResults } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { InfoIcon } from '../icons/InfoIcon';
import { CHART_COLORS } from '../../src/utils/chartColors';


interface TemporalAnalysisTabProps {
  model: BNGLModel | null;
  results: SimulationResults | null;
  onSimulate: (options: SimulationOptions) => void;
  onCancelSimulation: () => void;
  isSimulating: boolean;
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
  model, results, onSimulate, onCancelSimulation, isSimulating,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [itResult, setItResult] = useState<ITResultUI | null>(null);
  const [causalComparison, setCausalComparison] = useState<CausalComparisonUI | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'piano_roll' | 'mutual_info' | 'transfer_entropy' | 'causal'>('piano_roll');
  const svgRef = useRef<SVGSVGElement>(null);

  const firingLog = results?.firingLog;

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

    try {
      const engine = await import('@bngplayground/engine');
      if (engine.analyzeReactionInformation) {
        const nReactions = new Set(firingLog.map(e => e.reactionIndex)).size;
        const result = engine.analyzeReactionInformation({
          firingLog,
          nReactions,
        });
        setItResult(result);

        // Compare to structural causal graph if contact map available
        if (engine.compareCausalGraphs) {
          // Build structural edges from model rules
          const structuralEdges = (model?.reactions || []).map((r, i) => ({
            source: i,
            target: i,
            ruleName: r.name,
          }));
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
  }, [firingLog, model]);

  // Piano roll data: group firings by reaction
  const pianoRollData = useMemo(() => {
    if (!firingLog || firingLog.length === 0) return null;

    const reactionNames = new Map<number, string>();
    const reactionTimes = new Map<number, number[]>();

    for (const event of firingLog) {
      if (!reactionNames.has(event.reactionIndex)) {
        reactionNames.set(event.reactionIndex, event.ruleName || `R${event.reactionIndex + 1}`);
      }
      if (!reactionTimes.has(event.reactionIndex)) {
        reactionTimes.set(event.reactionIndex, []);
      }
      reactionTimes.get(event.reactionIndex)!.push(event.time);
    }

    return { reactionNames, reactionTimes };
  }, [firingLog]);

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
        </div>
      </Card>

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
          <svg
            ref={svgRef}
            width="100%"
            height={Math.max(300, pianoRollData.reactionNames.size * 40 + 50)}
            viewBox={`0 0 1000 ${Math.max(300, pianoRollData.reactionNames.size * 40 + 50)}`}
            className="bg-white dark:bg-slate-900 rounded"
            role="img"
            aria-label="Reaction firing piano roll visualization"
          >
            {/* Time axis */}
            {(() => {
              const tMin = firingLog![0]?.time || 0;
              const tMax = firingLog![firingLog!.length - 1]?.time || 1;
              const reactions = Array.from(pianoRollData.reactionNames.entries())
                .sort((a, b) => a[0] - b[0]);

              return (
                <>
                  {/* Grid lines */}
                  {Array.from({ length: 11 }, (_, i) => {
                    const x = 100 + (i / 10) * 870;
                    const t = tMin + (i / 10) * (tMax - tMin);
                    return (
                      <g key={`grid-${i}`}>
                        <line x1={x} y1={15} x2={x} y2={reactions.length * 40 + 15}
                          stroke="#e2e8f0" strokeWidth={0.5} />
                        <text x={x} y={reactions.length * 40 + 35} textAnchor="middle"
                          fontSize="11" fill="#94a3b8" fontWeight="500">{t.toPrecision(3)}</text>
                      </g>
                    );
                  })}

                  {/* Reaction rows */}
                  {reactions.map(([rxnIdx, name], row) => {
                    const y = row * 40 + 15;
                    const rowH = 34;
                    const times = pianoRollData.reactionTimes.get(rxnIdx) || [];
                    const color = CHART_COLORS[row % CHART_COLORS.length];
                    return (
                      <g key={`rxn-${rxnIdx}`}>
                        {/* Row label */}
                        <text x={95} y={y + rowH / 2 + 4} textAnchor="end" fontSize="11" fill="#334155" fontWeight="500">
                          {name.length > 14 ? name.substring(0, 14) + '…' : name}
                        </text>
                        {/* Background stripe */}
                        <rect x={100} y={y} width={870} height={rowH}
                          fill={row % 2 === 0 ? '#f8fafc' : '#f1f5f9'} opacity={0.6}
                          rx={2} />
                        {/* Firing count badge */}
                        <text x={975} y={y + rowH / 2 + 4} textAnchor="start" fontSize="9" fill="#94a3b8">
                          {times.length.toLocaleString()}
                        </text>
                        {/* Firing ticks */}
                        {(times.length > 3000
                          ? times.filter((_, i) => i % Math.ceil(times.length / 3000) === 0)
                          : times
                        ).map((t, i) => {
                          const x = 100 + ((t - tMin) / (tMax - tMin)) * 870;
                          return (
                            <line key={i} x1={x} y1={y + 2} x2={x} y2={y + rowH - 2}
                              stroke={color} strokeWidth={1} opacity={0.75} />
                          );
                        })}
                      </g>
                    );
                  })}

                </>
              );
            })()}
          </svg>
          {/* Time axis label — outside SVG to avoid overlap */}
          <div className="text-center pt-1 pb-2 border-t border-slate-100 dark:border-slate-800/20">
            <span className="text-[13px] font-bold text-slate-900 dark:text-slate-100">Time</span>
          </div>
        </Card>
      )}

      {/* Mutual Information Heatmap */}
      {viewMode === 'mutual_info' && itResult && (
        <Card className="p-5 flex-1 min-h-[400px]">
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
        <Card className="p-5 flex-1 min-h-[400px]">
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
        <Card className="p-5 flex-1 min-h-[400px]">
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
