import React from 'react';
import type { RuleBlockerReport } from '@bngplayground/engine';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface RuleBlockerBannerProps {
  ruleName: string;
  report?: RuleBlockerReport;
}

export const RuleBlockerBanner: React.FC<RuleBlockerBannerProps> = ({ ruleName, report }) => {
  const [expanded, setExpanded] = React.useState(false);

  const toggle = () => setExpanded((prev) => !prev);

  return (
    <Card className="border-amber-300 bg-amber-50 text-sm text-amber-950 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-200">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-semibold">Rule “{ruleName}” never fired</div>
          <div className="text-xs opacity-80">
            {report ? `${report.blockers.length} reactant pattern(s) missing required atoms.` : 'No matches were found for this rule.'}
          </div>
        </div>
        <Button variant="secondary" onClick={toggle}>
          {expanded ? 'Hide details' : 'Show details'}
        </Button>
      </div>
      {expanded && report && (
        <div className="mt-3 space-y-4 border-t border-amber-200 pt-3 text-xs dark:border-amber-700">
          {report.blockers.map((blocker) => (
            <div key={`${ruleName}-${blocker.reactantIndex}`} className="space-y-1">
              <div className="font-semibold">Reactant {blocker.reactantIndex + 1}</div>
              <div className="rounded bg-white p-2 font-mono text-[11px] text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                {blocker.pattern}
              </div>
              {blocker.missing.length ? (
                <ul className="ml-3 space-y-1">
                  {blocker.missing.map((atom, index) => (
                    <li key={index} className="rounded border border-amber-200 bg-white p-2 dark:border-amber-600/40 dark:bg-slate-900">
                      <div className="font-semibold text-amber-800 dark:text-amber-200">{atom.kind}</div>
                      <div className="text-slate-700 dark:text-slate-200">
                        {atom.molecule}
                        {atom.component ? `.${atom.component}` : ''}
                        {atom.state ? `~${atom.state}` : ''}
                        {atom.bondLabel ? ` !${atom.bondLabel}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="ml-3 text-green-700 dark:text-green-300">All atoms present</div>
              )}
            </div>
          ))}
          {report.suggestions.length > 0 && (
            <div className="space-y-1">
              <div className="font-semibold">Suggestions</div>
              <ul className="ml-3 space-y-1">
                {report.suggestions.map((suggestion, index) => (
                  <li key={index} className="rounded border border-amber-200 bg-white p-2 dark:border-amber-600/40 dark:bg-slate-900">
                    <div className="font-semibold text-amber-800 dark:text-amber-200">{suggestion.atomDescription}</div>
                    {suggestion.createdByRules.length ? (
                      <div className="text-slate-700 dark:text-slate-200">
                        Produced by: {suggestion.createdByRules.join(', ')}
                      </div>
                    ) : (
                      <div className="text-slate-500 dark:text-slate-300">No existing rules generate this atom.</div>
                    )}
                    {suggestion.mentionedInObservables && (
                      <div className="text-xs text-amber-700 dark:text-amber-300">Tracked by an observable</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
