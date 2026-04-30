import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { BioParser } from '../services/grammar/parser';
import { BNGLGenerator } from '../services/grammar/generator';
import { CheatsheetModal } from './CheatsheetModal';
import { Button } from './ui/Button';
import { BNGLModel } from '../types';
import { Card } from './ui/Card';
import { INDRAService, type INDRADBQueryParams, type ReviewableStatement } from '../services/indra';

interface DesignerPanelProps {
  isCollapsed?: boolean;
  onExpand?: () => void;
  text: string;
  onTextChange: (text: string) => void;
  modelName?: string | null;
  onModelNameChange?: (name: string | null) => void;
  onCodeChange: (code: string) => void;
  onParse: (codeOverride?: string) => Promise<BNGLModel | null>;
  onSimulate: (model?: BNGLModel) => void;
}

type DesignerTab = 'grammar' | 'indra-nlp' | 'indra-db';
type AssemblyPolicy = 'one_step' | 'two_step' | 'interactions_only';

const DEFAULT_TEXT = `# Welcome to Bio-Designer
# Write biology in natural language!

# Define your molecules
Define Lck
Define TCR with sites itam
Define Zap70
Define SHP1

# Describe interactions (many synonyms work!)
Lck binds TCR
Lck phosphorylates TCR at itam

# The parser understands flexible phrasing:
# "binds", "interacts with", "associates with", "recruits" all work!

# Initialize molecules
Start with 100 of Lck
Start with 100 of TCR
Start with 50 of Zap70
Start with 20 of SHP1

# Run simulation
Simulate for 0.25s with 200 steps
`;

const DEFAULT_INDRA_NLP_INPUT = `EGFR binds GRB2.
RAS activates RAF.
RAF phosphorylates MEK at Ser-217 and Ser-221.
MEK phosphorylates ERK at Thr-202 and Tyr-204.
ERK inhibits SOS by phosphorylation.`;

const DEFAULT_DB_QUERY: INDRADBQueryParams = {
  subject: 'BRAF',
  object: 'MAP2K1',
  type: 'Phosphorylation',
  minEvidence: 5,
  minBelief: 0.8,
};

const DB_STATEMENT_TYPES = [
  '',
  'Phosphorylation',
  'Dephosphorylation',
  'Activation',
  'Inhibition',
  'IncreaseAmount',
  'DecreaseAmount',
  'Complex',
  'Translocation',
  'Autophosphorylation',
];

const INDRA_DOCS_URL = 'https://indra.readthedocs.io/en/latest/rest_api.html';
const INDRA_API_URL = 'https://api.indra.bio/';

function statementBadgeText(statement: ReviewableStatement): string {
  const belief = typeof statement.statement.belief === 'number'
    ? `, ${statement.statement.belief.toFixed(2)} belief`
    : '';
  return `${statement.evidenceCount} ev${belief}`;
}

function previewLineCount(code: string | null): string {
  if (!code) return 'No code generated';
  return `${code.split('\n').length} lines`;
}

function getIndraBannerText(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'INDRA is not reachable from the browser right now. This is usually a local proxy or endpoint issue, not your Wi-Fi.';
  }
  return 'INDRA is not reachable from this browser session. This is often a server, proxy, or mixed-content issue rather than a local internet outage.';
}

export const DesignerPanel: React.FC<DesignerPanelProps> = ({
  isCollapsed,
  onExpand,
  text,
  onTextChange,
  modelName,
  onModelNameChange,
  onCodeChange,
  onParse,
  onSimulate,
}) => {
  const displayText = text || DEFAULT_TEXT;
  const [activeTab, setActiveTab] = useState<DesignerTab>('grammar');
  const [isCheatsheetOpen, setIsCheatsheetOpen] = useState(false);
  const [isIndraGuideOpen, setIsIndraGuideOpen] = useState(false);
  const [indraAvailable, setIndraAvailable] = useState<boolean | null>(null);
  const [checkingIndraAvailability, setCheckingIndraAvailability] = useState(false);

  const [nlpInput, setNlpInput] = useState(DEFAULT_INDRA_NLP_INPUT);
  const [nlpStatements, setNlpStatements] = useState<ReviewableStatement[]>([]);
  const [nlpLoading, setNlpLoading] = useState(false);
  const [nlpError, setNlpError] = useState<string | null>(null);
  const [nlpPolicy, setNlpPolicy] = useState<AssemblyPolicy>('one_step');

  const [dbQuery, setDbQuery] = useState<INDRADBQueryParams>(DEFAULT_DB_QUERY);
  const [dbStatements, setDbStatements] = useState<ReviewableStatement[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbPolicy, setDbPolicy] = useState<AssemblyPolicy>('two_step');

  const [assembledBNGL, setAssembledBNGL] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);

  const sentences = useMemo(() => BioParser.parseDocument(displayText), [displayText]);

  const lastGeneratedCode = useMemo(() => {
    const validSentences = sentences.filter((sentence) => sentence.isValid);
    if (validSentences.length === 0 && displayText.trim() !== '') return '';

    try {
      return BNGLGenerator.generate(sentences);
    } catch (error) {
      console.error('Generation failed', error);
      return '';
    }
  }, [sentences, displayText]);

  const currentStatements = activeTab === 'indra-db' ? dbStatements : nlpStatements;
  const hasSelectedStatements = currentStatements.some((statement) => statement.selected);
  const currentAssemblyPolicy = activeTab === 'indra-db' ? dbPolicy : nlpPolicy;

  useEffect(() => {
    if (!text) {
      onTextChange(DEFAULT_TEXT);
    }
  }, [onTextChange, text]);

  useEffect(() => {
    if (activeTab === 'grammar' && lastGeneratedCode) {
      onCodeChange(lastGeneratedCode);
    }
  }, [activeTab, lastGeneratedCode, onCodeChange]);

  useEffect(() => {
    if ((activeTab === 'indra-nlp' || activeTab === 'indra-db') && indraAvailable === null && !checkingIndraAvailability) {
      void checkIndraAvailability();
    }
  }, [activeTab, checkingIndraAvailability, indraAvailable]);

  async function checkIndraAvailability() {
    setCheckingIndraAvailability(true);
    try {
      setIndraAvailable(await INDRAService.isAvailable());
    } finally {
      setCheckingIndraAvailability(false);
    }
  }

  async function handleGrammarSync() {
    if (!lastGeneratedCode) return;
    onCodeChange(lastGeneratedCode);
    const parsedModel = await onParse(lastGeneratedCode);
    if (parsedModel) {
      onSimulate(parsedModel);
    }
  }

  function handleModelNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    onModelNameChange?.(value.trim() ? value : null);
  }

  function updateStatementSelection(hash: string, selected: boolean, source: 'nlp' | 'db') {
    const update = (statements: ReviewableStatement[]) => statements.map((statement) => (
      statement.hash === hash ? { ...statement, selected } : statement
    ));

    if (source === 'nlp') {
      setNlpStatements(update);
    } else {
      setDbStatements(update);
    }
  }

  async function handleProcessNlp() {
    setNlpLoading(true);
    setNlpError(null);
    setAssembledBNGL(null);
    try {
      const statements = await INDRAService.processTextForReview(nlpInput);
      setNlpStatements(statements);
      if (statements.length === 0) {
        setNlpError('INDRA returned no statements for this text.');
      }
    } catch (error) {
      setNlpStatements([]);
      setNlpError(error instanceof Error ? error.message : 'INDRA NLP processing failed.');
    } finally {
      setNlpLoading(false);
    }
  }

  async function handleQueryDb() {
    setDbLoading(true);
    setDbError(null);
    setAssembledBNGL(null);
    try {
      const statements = await INDRAService.queryAgentsForReview(dbQuery);
      setDbStatements(statements);
      if (statements.length === 0) {
        setDbError('No INDRA DB statements matched this query.');
      }
    } catch (error) {
      setDbStatements([]);
      setDbError(error instanceof Error ? error.message : 'INDRA DB query failed.');
    } finally {
      setDbLoading(false);
    }
  }

  async function handleAssembleSelected() {
    const selectedStatements = currentStatements.filter((statement) => statement.selected).map((statement) => statement.statement);
    if (selectedStatements.length === 0) {
      return;
    }

    setAssembling(true);
    try {
      const bngl = await INDRAService.assembleBNGL(selectedStatements, {
        policy: currentAssemblyPolicy,
      });
      setAssembledBNGL(bngl || '');
      if (bngl) {
        onCodeChange(bngl);
      }
      if (!bngl) {
        if (activeTab === 'indra-db') {
          setDbError('INDRA assembly returned empty BNGL output.');
        } else {
          setNlpError('INDRA assembly returned empty BNGL output.');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'INDRA assembly failed.';
      if (activeTab === 'indra-db') {
        setDbError(message);
      } else {
        setNlpError(message);
      }
      setAssembledBNGL(null);
    } finally {
      setAssembling(false);
    }
  }

  async function handleParseAndSimulate(code: string) {
    onCodeChange(code);
    const parsedModel = await onParse(code);
    if (parsedModel) {
      onSimulate(parsedModel);
    }
  }

  if (isCollapsed) {
    return (
      <Card
        className="flex h-full w-full cursor-pointer flex-col items-center justify-start overflow-hidden border-r border-slate-200 bg-slate-50 py-6 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        onClick={() => onExpand?.()}
        data-testid="designer-panel-collapsed"
      >
        <div
          className="mt-4 mb-auto flex items-center gap-3 whitespace-nowrap pointer-events-none"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-300">Designer</span>
        </div>

        <div className="mt-auto flex flex-col items-center gap-5 pb-4">
          <div className="group flex flex-col items-center gap-1">
            <button
              onClick={(event) => {
                event.stopPropagation();
                void handleGrammarSync();
              }}
              className="h-11 w-11 rounded-full border border-blue-500 bg-blue-600 text-xl text-white shadow-lg transition-all hover:scale-110 active:scale-95"
              title="Sync and visualize"
              aria-label="Sync and visualize"
            >
              <span className="pl-1">↻</span>
            </button>
            <span className="text-[8px] font-black uppercase text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">Sync</span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Designer Mode</h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              Build models from local grammar or INDRA-backed biological statements.
            </p>
          </div>
          <div className="flex gap-2">
            {activeTab === 'grammar' && (
              <>
                <Button variant="subtle" onClick={() => setIsCheatsheetOpen(true)} className="text-xs">
                  Cheatsheet
                </Button>
                <Button variant="primary" onClick={() => void handleGrammarSync()} className="text-xs">
                  Sync and Visualize
                </Button>
              </>
            )}
            {(activeTab === 'indra-nlp' || activeTab === 'indra-db') && (
              <Button variant="subtle" onClick={() => setIsIndraGuideOpen(true)} className="text-xs">
                INDRA Guide
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ['grammar', 'Local Grammar'],
            ['indra-nlp', 'INDRA NLP'],
            ['indra-db', 'INDRA Database'],
          ] as Array<[DesignerTab, string]>).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="mb-3">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">
            Model Name
          </label>
          <input
            type="text"
            value={modelName ?? ''}
            onChange={handleModelNameChange}
            placeholder="Optional model title (for editor/export)"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {(activeTab === 'indra-nlp' || activeTab === 'indra-db') && indraAvailable === false && (
        <div className="mx-4 mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-center justify-between gap-3">
            <span>{getIndraBannerText()}</span>
            <Button variant="subtle" className="px-3 py-1 text-xs" onClick={() => void checkIndraAvailability()}>
              Retry
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        {activeTab === 'grammar' ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
            <div className="flex min-h-0 flex-[1.35] gap-4">
              <div className="flex min-h-0 flex-1 flex-col">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Natural Language Input</h3>
                <textarea
                  className="flex-1 resize-none rounded-md border border-slate-200 bg-white p-4 font-mono text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
                  value={displayText}
                  onChange={(event) => onTextChange(event.target.value)}
                  spellCheck={false}
                  placeholder="Type your biological sentences here..."
                />
              </div>

              <div className="flex w-1/4 min-h-0 flex-col">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Logic Parser</h3>
                <div className="flex-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                  <div className="space-y-1">
                    {sentences.filter((sentence) => sentence.type !== 'COMMENT' && sentence.type !== 'COMPARTMENT').map((sentence) => (
                      <div
                        key={sentence.id}
                        className={`rounded border-l-4 p-2 text-xs ${
                          sentence.type === 'INVALID'
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                            : 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        }`}
                      >
                        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-70">{sentence.type}</div>
                        {sentence.type === 'INVALID' ? (
                          <div className="font-medium text-red-600 dark:text-red-400">{sentence.error?.message || 'Syntax Error'}</div>
                        ) : (
                          <div className="truncate font-medium text-slate-700 dark:text-slate-200" title={sentence.text}>
                            {sentence.text}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-1 flex h-40 flex-col border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Generated BNGL Code</h3>
                <span className="text-xs text-slate-400">{previewLineCount(lastGeneratedCode || null)}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-slate-200 shadow-sm dark:border-slate-700">
                <Editor
                  height="100%"
                  defaultLanguage="bngl"
                  value={lastGeneratedCode || '# BNGL code will appear here as you type...'}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                    lineNumbers: 'on',
                    renderLineHighlight: 'none',
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    domReadOnly: true,
                    readOnlyMessage: { value: 'Generated from natural language. Edit above to change.' },
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                {activeTab === 'indra-nlp' ? (
                  <>
                    <div className="flex min-h-0 flex-col">
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Describe Biological Mechanisms</h3>
                      <textarea
                        className="min-h-[220px] flex-1 resize-none rounded-md border border-slate-200 bg-white p-4 font-mono text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                        value={nlpInput}
                        onChange={(event) => setNlpInput(event.target.value)}
                        spellCheck={false}
                        placeholder="Describe interactions in English..."
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button variant="primary" className="text-xs" onClick={() => void handleProcessNlp()} disabled={nlpLoading || checkingIndraAvailability || indraAvailable === false}>
                        Process with INDRA
                      </Button>
                      <label className="text-xs text-slate-500 dark:text-slate-300">
                        Policy
                        <select
                          className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                          value={nlpPolicy}
                          onChange={(event) => setNlpPolicy(event.target.value as AssemblyPolicy)}
                        >
                          <option value="one_step">one_step</option>
                          <option value="two_step">two_step</option>
                          <option value="interactions_only">interactions_only</option>
                        </select>
                      </label>
                      <Button variant="subtle" className="px-3 py-1 text-xs" onClick={() => setIsIndraGuideOpen(true)}>
                        What do these mean?
                      </Button>
                      {nlpLoading && <span className="text-xs text-slate-500 dark:text-slate-300">Processing...</span>}
                    </div>
                    <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                      <span className="font-semibold">Policy:</span> `one_step` is the simplest default for NLP text. Open `INDRA Guide` for assembly details and docs links.
                    </div>
                    {nlpError && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                        {nlpError}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-sm text-slate-600 dark:text-slate-300">
                        Subject (HGNC)
                        <input
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                          value={dbQuery.subject ?? ''}
                          onChange={(event) => setDbQuery((prev) => ({ ...prev, subject: event.target.value }))}
                        />
                      </label>
                      <label className="text-sm text-slate-600 dark:text-slate-300">
                        Object (HGNC)
                        <input
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                          value={dbQuery.object ?? ''}
                          onChange={(event) => setDbQuery((prev) => ({ ...prev, object: event.target.value }))}
                        />
                      </label>
                      <label className="text-sm text-slate-600 dark:text-slate-300">
                        Type
                        <select
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                          value={dbQuery.type ?? ''}
                          onChange={(event) => setDbQuery((prev) => ({ ...prev, type: event.target.value || undefined }))}
                        >
                          {DB_STATEMENT_TYPES.map((type) => (
                            <option key={type || 'all'} value={type}>
                              {type || 'All types'}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm text-slate-600 dark:text-slate-300">
                        Min evidence
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                          value={dbQuery.minEvidence ?? 0}
                          onChange={(event) => setDbQuery((prev) => ({ ...prev, minEvidence: Number(event.target.value) }))}
                        />
                      </label>
                      <label className="text-sm text-slate-600 dark:text-slate-300">
                        Min belief
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step="0.01"
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                          value={dbQuery.minBelief ?? 0}
                          onChange={(event) => setDbQuery((prev) => ({ ...prev, minBelief: Number(event.target.value) }))}
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button variant="primary" className="text-xs" onClick={() => void handleQueryDb()} disabled={dbLoading || checkingIndraAvailability || indraAvailable === false}>
                        Search INDRA DB
                      </Button>
                      <label className="text-xs text-slate-500 dark:text-slate-300">
                        Policy
                        <select
                          className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                          value={dbPolicy}
                          onChange={(event) => setDbPolicy(event.target.value as AssemblyPolicy)}
                        >
                          <option value="two_step">two_step</option>
                          <option value="one_step">one_step</option>
                          <option value="interactions_only">interactions_only</option>
                        </select>
                      </label>
                      <Button variant="subtle" className="px-3 py-1 text-xs" onClick={() => setIsIndraGuideOpen(true)}>
                        What do these mean?
                      </Button>
                      {dbLoading && <span className="text-xs text-slate-500 dark:text-slate-300">Searching...</span>}
                    </div>
                    <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                      <span className="font-semibold">Policy:</span> `two_step` is usually best for curated INDRA DB statements because it preserves more mechanism.
                    </div>
                    {dbError && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                        {dbError}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex min-h-[320px] flex-col rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                    Extracted Statements
                  </h3>
                  <span className="text-xs text-slate-400">{currentStatements.length} found</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                  {currentStatements.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500 dark:text-slate-300">
                      {checkingIndraAvailability ? 'Checking INDRA availability...' : 'Run an INDRA action to populate statements for review.'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                      {currentStatements.map((statement) => (
                        <label key={statement.hash} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <input
                            type="checkbox"
                            checked={statement.selected}
                            onChange={(event) => updateStatementSelection(statement.hash, event.target.checked, statement.sourceType)}
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={statement.english}>
                              {statement.english}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                              {statement.statement.type} · {statement.sourceType.toUpperCase()} · {statementBadgeText(statement)}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    className="text-xs"
                    onClick={() => void handleAssembleSelected()}
                    disabled={!hasSelectedStatements || assembling}
                  >
                    {assembling ? 'Assembling...' : 'Assemble Selected to BNGL'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Generated BNGL</h3>
                  <span className="text-xs text-slate-400">{previewLineCount(assembledBNGL)}</span>
                </div>
                <Button
                  variant="primary"
                  className="text-xs"
                  onClick={() => assembledBNGL && void handleParseAndSimulate(assembledBNGL)}
                  disabled={!assembledBNGL}
                >
                  Sync and Visualize
                </Button>
              </div>
              <div className="overflow-hidden rounded-md border border-slate-200 shadow-sm dark:border-slate-700">
                <div className="h-64 min-h-[16rem]">
                  <Editor
                    height="100%"
                    defaultLanguage="bngl"
                    value={assembledBNGL || '# Assembled BNGL will appear here after statement review.'}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                      lineNumbers: 'on',
                      renderLineHighlight: 'none',
                      overviewRulerLanes: 0,
                      hideCursorInOverviewRuler: true,
                      domReadOnly: true,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <CheatsheetModal isOpen={isCheatsheetOpen} onClose={() => setIsCheatsheetOpen(false)} />
      {isIndraGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">INDRA Guide</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  INDRA assembles natural-language or literature-backed statements into BNGL. The assembly policy controls how detailed the generated mechanism is.
                </p>
              </div>
              <Button variant="subtle" className="px-3 py-1 text-xs" onClick={() => setIsIndraGuideOpen(false)}>
                Close
              </Button>
            </div>
            <div className="mt-4 space-y-4 text-sm text-slate-700 dark:text-slate-200">
              <div className="grid gap-2 sm:grid-cols-2">
                <a
                  href={INDRA_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Docs</div>
                  <div className="mt-1 font-semibold">INDRA REST API Docs</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">ReadTheDocs reference for the REST service.</div>
                </a>
                <a
                  href={INDRA_API_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Live API</div>
                  <div className="mt-1 font-semibold">api.indra.bio</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Swagger UI for the currently deployed INDRA endpoints.</div>
                </a>
              </div>
              <div>
                <div className="font-semibold">`one_step`</div>
                <div className="mt-1">Collapses an interaction into a direct rule. Best when you want a compact model or when NLP output is noisy.</div>
              </div>
              <div>
                <div className="font-semibold">`two_step`</div>
                <div className="mt-1">Separates recognition/binding from the state change. Usually more mechanistic and a better default for curated INDRA DB statements.</div>
              </div>
              <div>
                <div className="font-semibold">`interactions_only`</div>
                <div className="mt-1">Keeps only the interaction scaffold with minimal mechanistic detail. Useful for quick inspection or lightweight drafts.</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Assembled BNGL is automatically pushed into the main editor. Use `Sync and Visualize` once the preview looks right.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
