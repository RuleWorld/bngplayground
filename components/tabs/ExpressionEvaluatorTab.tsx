import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SimulationResults } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { CHART_COLORS } from '../../constants';
import {
  ExternalLegend,
  InlineLegend,
  LEGEND_THRESHOLD,
  formatTooltipNumber,
  formatYAxisTick,
} from '../charts/InteractiveLegend';

interface ExpressionEvaluatorTabProps {
  results: SimulationResults | null;
  observableNames: string[];
}

interface ComputedExpression {
  id: string;
  name: string;
  expression: string;
  color: string;
}

// Simple expression evaluator that supports +, -, *, /, parentheses, and numbers
function evaluateExpression(expression: string, variables: Record<string, number>): number | null {
  try {
    // Replace variable names with their values
    let expr = expression;

    // Sort variables by length (longest first) to avoid partial replacement issues
    const sortedVars = Object.keys(variables).sort((a, b) => b.length - a.length);

    for (const varName of sortedVars) {
      const value = variables[varName];
      // Use word boundary matching to avoid partial replacements
      const regex = new RegExp(`\\b${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      expr = expr.replace(regex, `(${value})`);
    }

    // Validate: only allow numbers, operators, parentheses, spaces, dots
    if (!/^[\d\s+\-*/().e]+$/i.test(expr)) {
      return null;
    }

    // Use Function constructor for safe evaluation (only math operations)
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${expr}`)();

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

export const ExpressionEvaluatorTab: React.FC<ExpressionEvaluatorTabProps> = ({
  results,
  observableNames,
}) => {
  const [expressions, setExpressions] = useState<ComputedExpression[]>([]);
  const [newExprName, setNewExprName] = useState('');
  const [newExpr, setNewExpr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [visibleExpressions, setVisibleExpressions] = useState<Set<string>>(new Set());

  const addExpression = useCallback(() => {
    if (!newExprName.trim() || !newExpr.trim()) {
      setError('Please provide both a name and an expression.');
      return;
    }

    // Validate expression syntax by testing with sample values
    const testVars: Record<string, number> = {};
    observableNames.forEach((name) => { testVars[name] = 1; });
    testVars['time'] = 1;

    const testResult = evaluateExpression(newExpr.trim(), testVars);
    if (testResult === null) {
      setError('Invalid expression. Use observable names, numbers, and operators (+, -, *, /, parentheses).');
      return;
    }

    setError(null);
    const newId = `expr_${Date.now()}`;
    const colorIndex = expressions.length % CHART_COLORS.length;

    setExpressions((prev) => [
      ...prev,
      {
        id: newId,
        name: newExprName.trim(),
        expression: newExpr.trim(),
        color: CHART_COLORS[colorIndex],
      },
    ]);

    setNewExprName('');
    setNewExpr('');
  }, [newExprName, newExpr, observableNames, expressions.length]);

  const removeExpression = useCallback((id: string) => {
    setExpressions((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Compute data for all expressions
  const chartData = useMemo(() => {
    if (!results || !results.data || results.data.length === 0) return [];

    return results.data.map((point) => {
      const row: Record<string, number> = { time: point.time ?? 0 };

      // Add original observables
      observableNames.forEach((name) => {
        row[name] = typeof point[name] === 'number' ? point[name] : 0;
      });

      // Evaluate each expression
      expressions.forEach((expr) => {
        const result = evaluateExpression(expr.expression, row);
        row[expr.name] = result ?? 0;
      });

      return row;
    });
  }, [results, observableNames, expressions]);

  useEffect(() => {
    // Reset visibility whenever expression list changes
    setVisibleExpressions(new Set(expressions.map((e) => e.name)));
  }, [expressions.map((e) => e.name).join('|')]);

  const useExternalLegend = expressions.length > LEGEND_THRESHOLD;

  const handleToggleExpression = (name: string) => {
    setVisibleExpressions((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleIsolateExpression = (name: string) => {
    setVisibleExpressions((prev) => {
      if (prev.size === 1 && prev.has(name)) return new Set(expressions.map((e) => e.name));
      return new Set([name]);
    });
  };

  if (!results || !results.data || results.data.length === 0) {
    return (
      <Card>
        <div className="text-slate-500 dark:text-slate-400 text-center py-8">
          Run a simulation first to define custom expressions over observables.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Define Custom Expressions
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Create custom metrics by combining observables with mathematical operations.
          Available variables: <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">time</code>
          {observableNames.slice(0, 5).map((name) => (
            <span key={name}>
              , <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">{name}</code>
            </span>
          ))}
          {observableNames.length > 5 && <span>, ...</span>}
        </p>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
            <Input
              value={newExprName}
              onChange={(e) => setNewExprName(e.target.value)}
              placeholder="e.g., Ratio"
              className="w-40"
            />
          </div>
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Expression</label>
            <Input
              value={newExpr}
              onChange={(e) => setNewExpr(e.target.value)}
              placeholder="e.g., A / (A + B)"
              onKeyDown={(e) => e.key === 'Enter' && addExpression()}
            />
          </div>
          <Button onClick={addExpression}>Add</Button>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        {expressions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">Active Expressions</h4>
            <div className="flex flex-wrap gap-2">
              {expressions.map((expr) => (
                <div
                  key={expr.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                  style={{ backgroundColor: `${expr.color}20`, borderColor: expr.color, borderWidth: 1 }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: expr.color }} />
                  <span className="font-medium">{expr.name}</span>
                  <span className="text-slate-500 dark:text-slate-400 text-xs">= {expr.expression}</span>
                  <button
                    onClick={() => removeExpression(expr.id)}
                    className="ml-1 text-slate-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {expressions.length > 0 && chartData.length > 0 && (
        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Expression Results
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.3)" />
              <XAxis
                dataKey="time"
                label={{ value: 'Time', position: 'insideBottom', offset: -5 }}
                type="number"
                domain={['dataMin', 'dataMax']}
              />
              <YAxis
                label={{ value: 'Value', angle: -90, position: 'insideLeft' }}
                domain={['auto', 'auto']}
                allowDataOverflow={true}
                tickFormatter={formatYAxisTick}
              />
              <Tooltip
                formatter={(value: any) => formatTooltipNumber(value, 4)}
                labelFormatter={(label) => `Time: ${typeof label === 'number' ? label.toFixed(2) : label}`}
              />
              {!useExternalLegend && (
                <Legend
                  content={
                    <InlineLegend
                      onToggle={handleToggleExpression}
                      onIsolate={handleIsolateExpression}
                    />
                  }
                />
              )}
              {expressions.map((expr) => (
                <Line
                  key={expr.id}
                  type="monotone"
                  dataKey={expr.name}
                  stroke={expr.color}
                  strokeWidth={1.5}
                  dot={false}
                  hide={!visibleExpressions.has(expr.name)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {useExternalLegend && (
            <ExternalLegend
              entries={expressions.map((e) => ({ name: e.name, color: e.color }))}
              visible={visibleExpressions}
              onToggle={handleToggleExpression}
              onIsolate={handleIsolateExpression}
            />
          )}

          <div className="text-center text-xs text-slate-500">
            Click legend to toggle series. Double-click legend to isolate/restore.
          </div>
        </Card>
      )}
    </div>
  );
};
