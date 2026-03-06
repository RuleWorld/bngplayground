import React from 'react';
import type { BNGLModel } from '../../types';
import type { DebuggerNetwork, ExpansionEvent, NetworkTrace } from '@bngplayground/engine';
import { RuleBlocker } from '@bngplayground/engine';
import { DebuggerContext } from './DebuggerContext';
import { TimelineViewer } from './TimelineViewer';
import { MatchVisualizerGlyph } from './MatchVisualizerGlyph';
import { RuleBlockerBanner } from './RuleBlockerBanner';
import { Card } from '../ui/Card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '../ui/Tabs';

interface DebuggerPanelProps {
  trace: NetworkTrace | null;
  model: BNGLModel | null;
  network: DebuggerNetwork | null;
  isLoading: boolean;
}

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <Card className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-slate-300">
    {message}
  </Card>
);

export const DebuggerPanel: React.FC<DebuggerPanelProps> = ({ trace, model, network, isLoading }) => {
  const [selectedEventIndex, setSelectedEventIndex] = React.useState(0);
  const [selectedRule, setSelectedRule] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!trace || !trace.events.length) {
      setSelectedEventIndex(0);
      return;
    }
    if (selectedEventIndex >= trace.events.length) {
      setSelectedEventIndex(trace.events.length - 1);
    }
  }, [trace, selectedEventIndex]);

  const blockerReports = React.useMemo(() => {
    const reports = new Map<string, ReturnType<typeof RuleBlocker.explain>>();
    if (!trace || !model || !network) {
      return reports;
    }

    trace.rulesNeverFired.forEach((ruleName) => {
      const rule = (model.reactionRules ?? []).find((candidate) => {
        const candidateName = candidate.name?.trim();
        if (candidateName) {
          return candidateName === ruleName;
        }
        const fallback = `${candidate.reactants.join(' + ')}->${candidate.products.join(' + ')}`;
        return fallback === ruleName;
      });
      if (rule) {
        reports.set(ruleName, RuleBlocker.explain(rule, { expandedNetwork: network, model }));
      }
    });

    return reports;
  }, [trace, model, network]);

  const selectedEvent: ExpansionEvent | undefined = trace?.events[selectedEventIndex];

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center gap-3 py-12">
        <LoadingSpinner />
        <span className="text-sm text-slate-600 dark:text-slate-200">Tracing network expansion…</span>
      </Card>
    );
  }

  if (!trace) {
    return <EmptyState message="Run the network debugger to capture rule firings and matches." />;
  }

  if (!trace.events.length) {
    return <EmptyState message="No expansion events were recorded. Check your seed species and rules." />;
  }

  const contextValue = {
    trace,
    blockerReports,
    selectedEventIndex,
    selectEvent: setSelectedEventIndex,
    selectedRule,
    selectRule: setSelectedRule,
  };

  return (
    <DebuggerContext.Provider value={contextValue}>
      <div className="flex flex-col gap-4">
        {!!trace.rulesNeverFired.length && (
          <div className="space-y-3">
            {trace.rulesNeverFired.map((ruleName) => (
              <RuleBlockerBanner key={ruleName} ruleName={ruleName} report={blockerReports.get(ruleName)} />
            ))}
          </div>
        )}

        <Tabs>
          <TabList>
            <Tab>Timeline</Tab>
            <Tab>Match Details</Tab>
            <Tab>Statistics</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <TimelineViewer trace={trace} selectedStep={selectedEventIndex} onSelectStep={setSelectedEventIndex} />
            </TabPanel>
            <TabPanel>
              {selectedEvent ? (
                <div className="flex flex-col gap-4">
                  <Card>
                    <div className="space-y-2 text-sm">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">
                        Event #{selectedEvent.stepId}: “{selectedEvent.ruleName}”
                      </div>
                      <div>Reactants: {selectedEvent.reactantSpeciesNames.join(', ') || '—'}</div>
                      <div>Products: {selectedEvent.productSpeciesNames.join(', ') || '—'}</div>
                      <div>
                        Degeneracy: <code>{selectedEvent.degeneracy}</code>{' '}
                        | Propensity factor: <code>{selectedEvent.propensityFactor.toFixed(3)}</code>
                      </div>
                    </div>
                  </Card>
                  <MatchVisualizerGlyph event={selectedEvent} />
                  <Card>
                    <div className="text-xs text-slate-500 dark:text-slate-300">
                      Total species so far: {selectedEvent.totalSpeciesAfter} · Total reactions: {selectedEvent.totalReactionsAfter}
                    </div>
                  </Card>
                </div>
              ) : (
                <EmptyState message="Select an event in the timeline to inspect match details." />
              )}
            </TabPanel>
            <TabPanel>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <div className="text-2xl font-semibold text-primary">{trace.totalEvents}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-300">Expansion steps</div>
                </Card>
                <Card>
                  <div className="text-2xl font-semibold text-green-600">{trace.totalSpeciesGenerated}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-300">Species discovered</div>
                </Card>
                <Card>
                  <div className="text-2xl font-semibold text-purple-600">{trace.totalReactionsGenerated}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-300">Reactions generated</div>
                </Card>
                <Card>
                  <div className="text-2xl font-semibold text-orange-600">{(trace.durationMs / 1000).toFixed(2)}s</div>
                  <div className="text-sm text-slate-500 dark:text-slate-300">Generation time</div>
                </Card>
              </div>

              <Card className="mt-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Top firing rules</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 dark:border-slate-700 text-left">
                        <th className="py-2">Rule</th>
                        <th className="py-2 text-right">Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(trace.eventsByRule)
                        .map(([ruleName, events]) => ({ ruleName, count: events.length }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 12)
                        .map(({ ruleName, count }) => (
                          <tr
                            key={ruleName}
                            className="border-b border-stone-100 last:border-0 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            onClick={() => setSelectedRule(ruleName)}
                          >
                            <td className="py-2 pr-4 font-mono text-xs">{ruleName}</td>
                            <td className="py-2 text-right font-semibold">{count}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </DebuggerContext.Provider>
  );
};
