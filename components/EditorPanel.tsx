import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { UploadIcon } from './icons/UploadIcon';
import { XIcon } from './icons/XIcon';
import { ExampleGalleryModal } from './ExampleGalleryModal';
import { RadioGroup } from './ui/RadioGroup';

// Minimal BNGL tidy helper (inlined to avoid module resolution issues)
function formatBNGLMini(code: string): string {
  if (!code) return '';
  const normalized = code.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const out: string[] = [];
  let blank = false;
  let insideBlock = false;
  
  // Block keywords that mark the start of indented sections
  const blockStarts = ['begin', 'setOption'];
  const blockEnds = ['end'];
  
  for (const ln of lines) {
    // Strip comments and trailing whitespace
    const withoutComment = ln.replace(/#.*/g, '').trimEnd();
    const trimmed = withoutComment.trim();
    
    // Handle blank lines (collapse multiple blanks into one)
    if (!trimmed) {
      if (!blank) out.push('');
      blank = true;
      continue;
    }
    blank = false;
    
    // Check if this line starts or ends a block
    const isBlockStart = blockStarts.some(kw => trimmed.toLowerCase().startsWith(kw.toLowerCase()));
    const isBlockEnd = blockEnds.some(kw => trimmed.toLowerCase().startsWith(kw.toLowerCase()));
    
    // Update block state
    if (isBlockEnd) {
      insideBlock = false;
    }
    
    // Format the line content (collapse multiple spaces, but preserve structure)
    const formattedContent = trimmed.replace(/\s+/g, ' ');
    
    // Apply indentation: 1 tab inside blocks, none for block start/end
    if (insideBlock && !isBlockStart && !isBlockEnd) {
      out.push('\t' + formattedContent);
    } else {
      out.push(formattedContent);
    }
    
    // After processing, update block state for next line
    if (isBlockStart) {
      insideBlock = true;
    }
  }
  return out.join('\n').trim() + '\n';
}
import MonacoEditor from './MonacoEditor';
import { SimulationOptions, ValidationWarning, EditorMarker } from '../types';

interface EditorPanelProps {
  code: string;
  onCodeChange: (code: string) => void;
  onParse: () => void;
  onSimulate: (options: SimulationOptions) => void;
  onCancelSimulation: () => void;
  isSimulating: boolean;
  modelExists: boolean;
  validationWarnings: ValidationWarning[];
  editorMarkers: EditorMarker[];
  loadedModelName?: string | null;
  onModelNameChange?: (name: string | null) => void;
  selection?: {
    startLineNumber: number;
    endLineNumber: number;
    startColumn?: number;
    endColumn?: number;
  };
}

type ParsedSimulateOptions = {
  t_end?: number;
  n_steps?: number;
  atol?: number;
  rtol?: number;
};

const SIMULATE_REGEX = /simulate(?:_(ode|ssa))?\s*\(\s*\{([\s\S]*?)\}\s*\)/gi;

const DEFAULT_SIMULATION: Record<'ode' | 'ssa', { t_end: number; n_steps: number }> = {
  ode: { t_end: 100, n_steps: 100 },
  ssa: { t_end: 100, n_steps: 100 },
};

function extractSimulateOptions(source: string, preferredMethod: 'ode' | 'ssa'): ParsedSimulateOptions {
  const matches: Array<{ method?: 'ode' | 'ssa'; options: ParsedSimulateOptions }> = [];

  SIMULATE_REGEX.lastIndex = 0;
  let simulateMatch: RegExpExecArray | null;
  while ((simulateMatch = SIMULATE_REGEX.exec(source)) !== null) {
    const [, methodSuffixRaw, block] = simulateMatch;
    const entry: { method?: 'ode' | 'ssa'; options: ParsedSimulateOptions } = {
      method: methodSuffixRaw ? (methodSuffixRaw.toLowerCase() as 'ode' | 'ssa') : undefined,
      options: {},
    };

    const keyValueRegex = /(\w+)\s*=>\s*(?:"([^"]*)"|'([^']*)'|([^,\s}]+))/g;
    let kvMatch: RegExpExecArray | null;
    while ((kvMatch = keyValueRegex.exec(block)) !== null) {
      const key = kvMatch[1];
      const rawValue = kvMatch[2] ?? kvMatch[3] ?? kvMatch[4] ?? '';
      if (key === 'method' && rawValue) {
        const normalized = rawValue.toLowerCase();
        if (normalized === 'ode' || normalized === 'ssa') {
          entry.method = normalized;
        }
      } else if (key === 't_end') {
        const num = Number(rawValue);
        if (!Number.isNaN(num)) {
          entry.options.t_end = num;
        }
      } else if (key === 'n_steps') {
        const num = Number(rawValue);
        if (!Number.isNaN(num)) {
          entry.options.n_steps = num;
        }
      } else if (key === 'atol') {
        const num = Number(rawValue);
        if (!Number.isNaN(num)) {
          entry.options.atol = num;
        }
      } else if (key === 'rtol') {
        const num = Number(rawValue);
        if (!Number.isNaN(num)) {
          entry.options.rtol = num;
        }
      }
    }

    matches.push(entry);
  }

  if (matches.length === 0) {
    return {};
  }

  const exact = matches.find((entry) => entry.method === preferredMethod);
  const methodless = matches.find((entry) => entry.method === undefined);
  const chosen = exact ?? methodless ?? matches[0];

  return chosen.options;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  code,
  onCodeChange,
  onParse,
  onSimulate,
  onCancelSimulation,
  isSimulating,
  modelExists,
  validationWarnings,
  editorMarkers,
  loadedModelName,
  onModelNameChange,
  selection,
}) => {
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  // removed first-time-open example gallery state
  const [showIntroBanner, setShowIntroBanner] = useState(true);
  // Auto-open on first visit removed so the page isn't blocked by a modal on first load.
  const [simulationMethod, setSimulationMethod] = useState<'ode' | 'ssa'>('ode');
  const [customAtol, setCustomAtol] = useState<string>('');
  const [customRtol, setCustomRtol] = useState<string>('');
  const [odeSolver, setOdeSolver] = useState<'auto' | 'cvode' | 'cvode_auto' | 'cvode_sparse' | 'cvode_jac' | 'rosenbrock23' | 'rk45' | 'rk4'>('auto');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        onCodeChange(e.target?.result as string);
        // Clear model name when loading from file
        onModelNameChange?.(file.name.replace(/\.bngl$/i, ''));
      };
      reader.readAsText(file);
    }
  };

  const handleLoadExample = (exampleCode: string, modelName?: string) => {
    onCodeChange(exampleCode);
    onModelNameChange?.(modelName ?? null);
    setIsGalleryOpen(false);
  };

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto pr-1">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">BNGL Model Editor</h2>
        {/* Intro banner for first-time users (dismissible) */}
        {showIntroBanner && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 relative">
            <strong>Welcome!</strong>
            <ul className="list-disc pl-5 mt-2">
              <li>Write or load a BNGL model in the editor.</li>
              <li>Click <strong>Models</strong> to load a starter model, then click <strong>Run Simulation</strong>.</li>
              <li>Explore the Regulatory Graph and Identifiability tabs to analyze your model.</li>
            </ul>
            <button
              aria-label="Dismiss intro"
              onClick={() => setShowIntroBanner(false)}
              className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}
        {/* Model parse status bar */}
        <div className="mb-2 flex items-center gap-3 flex-wrap">
          {validationWarnings.length === 0 && modelExists ? (
            <div className="inline-flex items-center gap-2 rounded px-3 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm">✅ Parsed OK</div>
          ) : modelExists && validationWarnings.some(w => w.severity === 'error') ? (
            <div className="inline-flex items-center gap-2 rounded px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">❌ Parsed with errors</div>
          ) : modelExists && validationWarnings.length > 0 ? (
            <div className="inline-flex items-center gap-2 rounded px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm">⚠️ Parsed with warnings</div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded px-3 py-1 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm">📝 No model parsed</div>
          )}
          {loadedModelName && (
            <div className="inline-flex items-center gap-2 rounded px-3 py-1 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium">
              📁 {loadedModelName}
            </div>
          )}
          {validationWarnings.length > 0 && (
            <button onClick={onParse} className="text-xs underline text-slate-600 dark:text-slate-400">Re-parse</button>
          )}
        </div>
        <div className="relative flex-1 min-h-[16rem] overflow-hidden">
          <MonacoEditor
            language="bngl"
            value={code}
            onChange={(value) => onCodeChange(value || '')}
            markers={editorMarkers}
            selection={selection}
          />
        </div>
        {validationWarnings.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/50">
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Model validation</h3>
            <div className="max-h-48 overflow-y-auto pr-1">
              <ul className="space-y-2">
                {validationWarnings.map((warning, index) => {
                  const badgeClass = warning.severity === 'error'
                    ? 'bg-red-500'
                    : warning.severity === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-blue-500';
                  const badgeLabel = warning.severity === 'error' ? 'Error' : warning.severity === 'warning' ? 'Warning' : 'Info';
                  return (
                    <li key={`${warning.message}-${index}`} className="rounded border border-slate-200 bg-white p-3 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-semibold text-white ${badgeClass}`}>
                          {badgeLabel}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium">{warning.message}</p>
                          {warning.relatedElement && (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Related: {warning.relatedElement}</p>
                          )}
                          {warning.suggestion && (
                            <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-100 p-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{warning.suggestion}</pre>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2 shrink-0 border-t border-slate-200 pt-3 dark:border-slate-700">
        {/* Row 1: All action buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          <Button onClick={() => setIsGalleryOpen(true)}>Models</Button>
          <Button variant="subtle" onClick={() => fileInputRef.current?.click()}>
            <UploadIcon className="w-4 h-4 mr-1" />
            Load
          </Button>
          <Button variant="subtle" onClick={() => onCodeChange(formatBNGLMini(code))}>
            Format
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".bngl"
          />
          <div className="border-l border-slate-300 dark:border-slate-600 h-6 mx-1" />
          <Button onClick={onParse}>Parse Model</Button>
          <Button
            onClick={() => {
              const parsed = extractSimulateOptions(code, simulationMethod);
              const defaults = DEFAULT_SIMULATION[simulationMethod];
              const atolValue = customAtol ? Number(customAtol) : (parsed.atol ?? 1e-6);
              const rtolValue = customRtol ? Number(customRtol) : (parsed.rtol ?? 1e-3);
              onSimulate({
                method: simulationMethod,
                t_end: parsed.t_end ?? defaults.t_end,
                n_steps: parsed.n_steps ?? defaults.n_steps,
                ...(simulationMethod === 'ode' ? { atol: atolValue, rtol: rtolValue, solver: odeSolver } : {}),
              });
            }}
            disabled={isSimulating || !modelExists}
            variant="primary"
          >
            {isSimulating && <LoadingSpinner className="w-4 h-4 mr-2" />}
            {isSimulating ? 'Simulating...' : 'Run Simulation'}
          </Button>
          {isSimulating && (
            <Button variant="danger" onClick={onCancelSimulation}>
              Cancel
            </Button>
          )}
        </div>
        {/* Row 2: Simulation options */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <RadioGroup
            name="simulationMethod"
            value={simulationMethod}
            onChange={(val) => setSimulationMethod(val as 'ode' | 'ssa')}
            options={[
              { label: 'ODE', value: 'ode' },
              { label: 'SSA', value: 'ssa' },
            ]}
          />
          {simulationMethod === 'ode' && (
            <>
              <div className="border-l border-slate-300 dark:border-slate-600 h-4" />
              <label className="text-slate-600 dark:text-slate-400">Solver:</label>
              <select
                value={odeSolver}
                onChange={(e) => setOdeSolver(e.target.value as any)}
                className="rounded border border-slate-300 px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="auto">Auto</option>
                <option value="cvode">CVODE</option>
                <option value="cvode_auto">CVODE + Fallback</option>
                <option value="cvode_sparse">CVODE Sparse</option>
                <option value="cvode_jac">CVODE + Jac</option>
                <option value="rosenbrock23">Rosenbrock23</option>
                <option value="rk45">RK45</option>
                <option value="rk4">RK4</option>
              </select>
              <label className="text-slate-600 dark:text-slate-400">atol:</label>
              <input
                type="text"
                value={customAtol}
                onChange={(e) => setCustomAtol(e.target.value)}
                placeholder="auto"
                className="w-12 rounded border border-slate-300 px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
              <label className="text-slate-600 dark:text-slate-400">rtol:</label>
              <input
                type="text"
                value={customRtol}
                onChange={(e) => setCustomRtol(e.target.value)}
                placeholder="auto"
                className="w-12 rounded border border-slate-300 px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </>
          )}
        </div>
      </div>
      <ExampleGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        onSelect={handleLoadExample}
      />
    </Card>
  );
};