import React from 'react';
import type { NetworkTrace, RuleBlockerReport } from '@bngplayground/engine';

export interface DebuggerContextValue {
  trace: NetworkTrace | null;
  blockerReports: Map<string, RuleBlockerReport>;
  selectedEventIndex: number;
  selectEvent(index: number): void;
  selectedRule: string | null;
  selectRule(rule: string | null): void;
}

export const DebuggerContext = React.createContext<DebuggerContextValue | null>(null);

export const useDebuggerContext = (): DebuggerContextValue => {
  const ctx = React.useContext(DebuggerContext);
  if (!ctx) {
    throw new Error('useDebuggerContext must be used within a DebuggerContext provider');
  }
  return ctx;
};
