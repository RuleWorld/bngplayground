import React, { useState, useCallback, useMemo } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { CHART_COLORS } from '../constants';
import { validateObservablePattern } from '@bngplayground/engine';
import { BNGLParser } from '@bngplayground/engine';

export interface CustomExpression {
  id: string;
  name: string;
  expression: string;
  color: string;
  type: 'math' | 'bngl';  // math = computed from observable values, bngl = computed from species patterns
}

interface ExpressionInputPanelProps {
  expressions: CustomExpression[];
  onExpressionsChange: (expressions: CustomExpression[]) => void;
  observableNames: string[];
  parameterNames?: string[];
  speciesNames?: string[];
  hasSpeciesData?: boolean;  // Whether species-level data is available for BNGL patterns
}

/**
 * Evaluate a mathematical expression with complex entity names (including BNGL patterns)
 * Consolidated version using the central BNGLParser.
 */
export function evaluateExpression(expression: string, variables: Record<string, number>): number | null {
  const variablesMap = new Map<string, number>();
  for (const [name, val] of Object.entries(variables)) {
    variablesMap.set(name, val);
  }

  const result = BNGLParser.evaluateExpression(expression, variablesMap, new Set());
  return isNaN(result) ? null : result;
}

export const ExpressionInputPanel: React.FC<ExpressionInputPanelProps> = ({
  expressions,
  onExpressionsChange,
  observableNames,
  parameterNames = [],
  speciesNames = [],
  hasSpeciesData = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newExprName, setNewExprName] = useState('');
  const [newExpr, setNewExpr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'math' | 'bngl'>('math');

  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState('');
  const [cursorPos, setCursorPos] = useState(0);

  const suggestions = useMemo(() => {
    if (!suggestionFilter && !showSuggestions) return [];

    const all = [
      ...observableNames.map(name => ({ name, type: 'observable' })),
      ...parameterNames.map(name => ({ name, type: 'parameter' })),
      ...speciesNames.map(name => ({ name, type: 'species' })),
      { name: 'time', type: 'variable' }
    ];

    return all
      .filter(s => s.name.toLowerCase().includes(suggestionFilter.toLowerCase()))
      .slice(0, 10);
  }, [suggestionFilter, showSuggestions, observableNames, parameterNames, speciesNames]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const pos = e.target.selectionStart || 0;
    setNewExpr(value);
    setCursorPos(pos);

    // Trigger autocomplete after '@' or just by typing characters if in math mode
    const lastWordMatch = value.substring(0, pos).match(/([A-Za-z0-9_()*!.]+?)$/);
    if (lastWordMatch) {
      setSuggestionFilter(lastWordMatch[1]);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const applySuggestion = (suggestion: string) => {
    const before = newExpr.substring(0, cursorPos - suggestionFilter.length);
    const after = newExpr.substring(cursorPos);
    setNewExpr(before + suggestion + after);
    setShowSuggestions(false);
  };

  const addExpression = useCallback(() => {
    const input = newExpr.trim();
    if (!input) {
      setError('Provide an expression.');
      return;
    }

    // Split input by newlines to support bulk add
    const lines = input.split('\n').filter(line => line.trim());
    const newExpressions: CustomExpression[] = [...expressions];
    const testVars: Record<string, number> = { time: 1 };
    observableNames.forEach((name) => { testVars[name] = 1; });
    parameterNames.forEach((name) => { testVars[name] = 1; });
    speciesNames.forEach((name) => { testVars[name] = 1; });

    let addedCount = 0;
    let lastError: string | null = null;

    for (const line of lines) {
      let name = newExprName.trim();
      let expression = line.trim();

      // Check if the line follows "Name = Expression" format
      if (expression.includes('=')) {
        const parts = expression.split('=');
        name = parts[0].trim();
        expression = parts.slice(1).join('=').trim();
      }

      if (!name) {
        lastError = `Missing name for expression: ${expression}`;
        continue;
      }

      if (!expression) {
        lastError = `Missing expression for name: ${name}`;
        continue;
      }

      if (mode === 'math') {
        const testResult = evaluateExpression(expression, testVars);
        if (testResult === null) {
          lastError = `Invalid math expression: ${expression}`;
          continue;
        }
      } else {
        const validationError = validateObservablePattern(expression);
        if (validationError) {
          lastError = `Invalid BNGL pattern "${expression}": ${validationError}`;
          continue;
        }
      }

      const newId = `expr_${Date.now()}_${addedCount}`;
      const colorIndex = (newExpressions.length + observableNames.length) % CHART_COLORS.length;

      newExpressions.push({
        id: newId,
        name,
        expression,
        color: CHART_COLORS[colorIndex],
        type: mode,
      });
      addedCount++;
    }

    if (addedCount > 0) {
      onExpressionsChange(newExpressions);
      setNewExprName('');
      setNewExpr('');
      setError(lastError); // Show any partial errors
    } else if (lastError) {
      setError(lastError);
    }
  }, [newExprName, newExpr, observableNames, parameterNames, speciesNames, expressions, onExpressionsChange, mode]);

  const removeExpression = useCallback((id: string) => {
    onExpressionsChange(expressions.filter((e) => e.id !== id));
  }, [expressions, onExpressionsChange]);

  return (
    <div className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-primary transition-colors"
      >
        <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="font-medium">Custom Expressions</span>
        {expressions.length > 0 && (
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">
            {expressions.length}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3 pl-4">
          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Mode:</span>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              <button
                onClick={() => setMode('math')}
                className={`px-2.5 py-1 rounded-l-lg transition-colors ${mode === 'math'
                    ? 'bg-primary text-white'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
              >
                Math
              </button>
              <button
                onClick={() => setMode('bngl')}
                disabled={!hasSpeciesData}
                title={hasSpeciesData ? 'Define observable using BNGL pattern' : 'Requires species-level simulation data'}
                className={`px-2.5 py-1 rounded-r-lg transition-colors ${mode === 'bngl'
                    ? 'bg-primary text-white'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                  } ${!hasSpeciesData ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                BNGL Pattern
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            {mode === 'math' ? (
              <>
                Compute from observables: {' '}
                {observableNames.slice(0, 3).map((n, i) => (
                  <code key={n} className="bg-slate-100 dark:bg-slate-700 px-1 rounded text-xs">
                    {n}{i < 2 && observableNames.length > i + 1 ? ', ' : ''}
                  </code>
                ))}
                {observableNames.length > 3 && '...'}
              </>
            ) : (
              <>Define a BNGL observable pattern like <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">A(b!+)</code> or <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">A.B</code></>
            )}
          </p>

          <div className="flex flex-wrap gap-2 items-end">
            <Input
              value={newExprName}
              onChange={(e) => setNewExprName(e.target.value)}
              placeholder="Name"
              className="w-24 text-sm"
            />
            <div className="flex-1 min-w-[120px] relative">
              <Input
                value={newExpr}
                onChange={handleInputChange}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder={mode === 'math' ? 'e.g., A / (A + B)' : 'e.g., A(b!+)'}
                className="w-full text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addExpression();
                  if (e.key === 'Escape') setShowSuggestions(false);
                }}
              />

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute bottom-full left-0 w-full mb-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => applySuggestion(s.name)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between border-b border-slate-50 dark:border-slate-700 last:border-0"
                    >
                      <span className="font-mono truncate mr-2">{s.name}</span>
                      <span className="text-[10px] uppercase text-slate-400 font-bold shrink-0">{s.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={addExpression} className="text-sm py-1 px-3">Add</Button>
          </div>

          {error && (
            <div className="text-xs text-red-500">{error}</div>
          )}

          {expressions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {expressions.map((expr) => (
                <div
                  key={expr.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border"
                  style={{ borderColor: expr.color, backgroundColor: `${expr.color}15` }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: expr.color }} />
                  <span className="font-medium">{expr.name}</span>
                  <span className="text-slate-500">
                    {expr.type === 'bngl' && '📦 '}
                    = {expr.expression}
                  </span>
                  <button
                    onClick={() => removeExpression(expr.id)}
                    className="ml-1 text-slate-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
