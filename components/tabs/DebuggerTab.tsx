import React from 'react';
import type { BNGLModel } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { DebuggerPanel } from '../debugger/DebuggerPanel';
import { NetworkTracer } from '@bngplayground/engine';
import type { TraceResult } from '@bngplayground/engine';

const tracer = new NetworkTracer();

interface DebuggerTabProps {
  model: BNGLModel | null;
}

export const DebuggerTab: React.FC<DebuggerTabProps> = ({ model }) => {
  const [traceResult, setTraceResult] = React.useState<TraceResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isTracing, setIsTracing] = React.useState(false);

  const handleRun = async () => {
    if (!model) {
      setError('Parse a model before running the debugger.');
      return;
    }

    setIsTracing(true);
    setError(null);

    try {
      const result = await tracer.trace(model);
      setTraceResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to trace network generation.';
      setError(message);
      setTraceResult(null);
    } finally {
      setIsTracing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-xs inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-slate-700">Advanced</span>
        <div className="text-sm text-slate-500">Dev tooling to inspect rule firing and network generation.</div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={handleRun} disabled={!model || isTracing}>
          {isTracing ? 'Tracing…' : 'Run network debugger'}
        </Button>
        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>

      {traceResult ? (
        <DebuggerPanel trace={traceResult.trace} model={model} network={traceResult.network} isLoading={isTracing} />
      ) : (
        <Card className="text-sm text-slate-500 dark:text-slate-300">
          Capture a full rule firing trace and see why certain rules fail to match by running the debugger.
        </Card>
      )}
    </div>
  );
};
