import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { UploadIcon } from './icons/UploadIcon';
import { XIcon } from './icons/XIcon';
import { SimulationControls } from './SimulationControls';
import { ExampleGalleryModal } from './ExampleGalleryModal';

import { ParameterPanel } from './ParameterPanel';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { Dropdown, DropdownItem } from './ui/Dropdown';
import { BioModelsImportModal } from './BioModelsImportModal';
import { HelpSection } from './HelpSection';

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
import { BNGLModel, SimulationOptions, ValidationWarning, EditorMarker } from '../types';
import { getSimulationOptionsFromParsedModel } from '@bngplayground/engine';

interface EditorPanelProps {
  code: string;
  onCodeChange: (code: string) => void;
  onLoadCode?: (code: string) => void;
  editorResetKey?: number;
  onParse: (codeOverride?: string) => void | Promise<unknown>;
  onSimulate: (options: SimulationOptions) => void;
  isSimulating: boolean;
  modelExists: boolean;
  model?: BNGLModel | null;
  validationWarnings: ValidationWarning[];
  editorMarkers: EditorMarker[];
  loadedModelName?: string | null;
  onModelNameChange?: (name: string | null) => void;
  onModelIdChange?: (id: string | null) => void;
  selection?: {
    startLineNumber: number;
    endLineNumber: number;
    startColumn?: number;
    endColumn?: number;
  };
  // New: allow importing SBML from the editor load button and exporting SBML
  onImportSBML?: (file: File) => void | Promise<void>;
  onExportSBML?: () => void;
  onExportSedML?: () => void;
  onExportOMEX?: () => void;
  onExportBNGL?: () => void;
  onExportNET?: () => void;
  lastResized?: number;
  isCollapsed?: boolean;
  onExpand?: () => void;
  onRunQuick?: () => void;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  code,
  onCodeChange,
  onLoadCode,
  editorResetKey,
  onParse,
  onSimulate,

  isSimulating,
  modelExists,
  model,
  validationWarnings,
  editorMarkers,
  loadedModelName,
  onModelNameChange,
  onModelIdChange,
  selection,
  onImportSBML,
  onExportSBML,
  onExportSedML,
  onExportOMEX,
  onExportBNGL,
  onExportNET,
  lastResized,
  isCollapsed,
  onExpand,
  onRunQuick,
}) => {
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  // removed first-time-open example gallery state
  const [showIntroBanner, setShowIntroBanner] = useState(
    () => localStorage.getItem('bng-banner-dismissed') !== 'true'
  );

  const [isParamsOpen, setIsParamsOpen] = useState(false);
  const [isBioModelsOpen, setIsBioModelsOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();

    // If it's an SBML/XML file, delegate to the app's atomizer flow if provided
    if (ext === 'sbml' || ext === 'xml') {
      if (onImportSBML) {
        onImportSBML(file);
      } else {
        console.warn('SBML import requested but no onImportSBML handler provided');
      }
      // Reset the input value so the same file can be reselected later
      event.target.value = '';
      return;
    }

    // Otherwise treat as a BNGL (.bngl) file
    const reader = new FileReader();
    reader.onload = (e) => {
      const newCode = e.target?.result as string;
      console.log('[EditorPanel] Local BNGL file loaded', {
        fileName: file.name,
        length: newCode?.length ?? 0,
        firstLine: (newCode || '').split('\n')[0] || '',
        usesOnLoadCode: Boolean(onLoadCode),
      });
      if (onLoadCode) onLoadCode(newCode);
      else onCodeChange(newCode);
      // Clear model name when loading from file
      onModelNameChange?.(file.name.replace(/\.bngl$/i, ''));
      onModelIdChange?.(null);
      // automatically parse newly loaded file
      void onParse(newCode);
    };
    reader.readAsText(file);
  };

  const handleLoadExample = (exampleCode: string, modelName?: string, modelId?: string) => {
    console.log('[EditorPanel] handleLoadExample', {
      modelId,
      modelName,
      length: exampleCode.length,
      firstLine: exampleCode.split('\n')[0] || '',
      usesOnLoadCode: Boolean(onLoadCode),
      isCollapsed: Boolean(isCollapsed),
    });
    if (onLoadCode) onLoadCode(exampleCode);
    else onCodeChange(exampleCode);
    onModelNameChange?.(modelName ?? null);
    onModelIdChange?.(modelId ?? null);
    setIsGalleryOpen(false);
    void onParse(exampleCode);
    if (isCollapsed) onExpand?.();
  };

  if (isCollapsed) {
    return (
      <>
      <Card 
        className="flex h-full w-full flex-col bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 items-center justify-start py-6 overflow-hidden cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" 
        data-testid="editor-panel-collapsed"
        onClick={() => onExpand?.()}
      >
         <div 
           className="whitespace-nowrap flex items-center gap-3 mt-4 mb-auto pointer-events-none select-none"
           style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
         >
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 dark:text-slate-500">BNGL Editor</span>
            {loadedModelName && (
               <span className="text-sm font-bold text-teal-600 dark:text-teal-400 max-h-[300px] truncate">{loadedModelName}</span>
            )}
         </div>
         
         <div className="mt-auto flex flex-col items-center gap-5 pb-4">
            <div className="flex flex-col items-center gap-1 group">
               <button 
                onClick={(e) => { e.stopPropagation(); setIsGalleryOpen(true); }} 
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-teal-600 hover:scale-110 active:scale-95 transition-all" 
                title="Models"
              >
                  <span className="text-xl">🧬</span>
               </button>
               <span className="text-[8px] font-black uppercase text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">Models</span>
            </div>

            <div className="flex flex-col items-center gap-1 group">
               <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (onRunQuick) {
                    onRunQuick();
                  } else {
                    onParse();
                  }
                }} 
                className="w-11 h-11 flex items-center justify-center rounded-full bg-teal-600 shadow-lg border border-teal-500 text-white hover:scale-110 active:scale-95 transition-all" 
                title="Quick Run"
                disabled={isSimulating}
              >
                  {isSimulating ? <LoadingSpinner className="w-5 h-5" /> : <span className="text-xl">▶</span>}
               </button>
               <span className="text-[8px] font-black uppercase text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">Run</span>
            </div>
          </div>
        </Card>
        <ExampleGalleryModal
          isOpen={isGalleryOpen}
          onClose={() => setIsGalleryOpen(false)}
          onSelect={handleLoadExample}
          onImportSBML={onImportSBML}
        />
      </>
    );
  }

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="editor-panel">
      <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto pr-1">
        {/* Header with Status */}
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-50 tracking-tight flex flex-wrap items-center gap-2">
            <span className="shrink-0">BNGL Editor</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {modelExists && validationWarnings.length === 0 && (
                <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800/30">
                  Ready
                </span>
              )}
              {validationWarnings.length > 0 && (
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${validationWarnings.some(w => w.severity === 'error')
                  ? 'text-rose-600 bg-rose-50 border-rose-100 dark:text-rose-400 dark:bg-rose-900/20 dark:border-rose-800/30'
                  : 'text-amber-600 bg-amber-50 border-amber-100 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800/30'
                  }`}>
                  {validationWarnings.some(w => w.severity === 'error') ? 'Error' : `${validationWarnings.length} Warn`}
                </span>
              )}
              {loadedModelName && (
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 dark:border-slate-700 truncate max-w-[120px]" title={loadedModelName}>
                  {loadedModelName}
                </span>
              )}
            </div>
          </h2>
        </div>

        {/* Compact intro banner */}
        {showIntroBanner && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 px-3 py-2 text-sm">
            <span className="text-blue-800 dark:text-blue-200">
              🧬 Welcome! Click <strong>Models</strong> to browse examples, then <strong>Run Simulation</strong>.
            </span>
            <button
              aria-label="Dismiss"
              onClick={() => {
                setShowIntroBanner(false);
                localStorage.setItem('bng-banner-dismissed', 'true');
              }}
              className="p-1 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 rounded hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors flex-shrink-0"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}


        <div className="relative flex-1 min-h-[24rem] overflow-hidden">
          <MonacoEditor
            key={editorResetKey ?? 0}
            language="bngl"
            value={code}
            onChange={(value) => onCodeChange(value || '')}
            markers={editorMarkers}
            selection={selection}
            lastResized={lastResized}
            onRun={() => {
              // Ctrl+Enter: parse first, then simulate with model-default options
              onParse();
              if (model) {
                const opts = getSimulationOptionsFromParsedModel(model, 'default');
                onSimulate(opts);
              }
            }}
          />
        </div>

        {/* Collapsible Validation Detail handled by gutter mainly, strictly critical errors can persist if needed */}
        {/* Removed redundant big warning panel as per request */}
      </div>

      <div className="mt-4 flex flex-col gap-3 shrink-0 border-t border-slate-200 dark:border-slate-700 pt-4 dark:border-slate-700">
        {/* Row 1: Actions & Simulation Controls */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setIsGalleryOpen(true)} className="h-9 px-3">Models</Button>
            
            <Dropdown align="left" trigger={
              <Button variant="subtle" className="h-9 px-3 inline-flex items-center gap-2">
                <UploadIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Load</span>
              </Button>
            }>
              <DropdownItem onClick={() => fileInputRef.current?.click()}>Local file (BNGL / SBML)</DropdownItem>
              <DropdownItem onClick={() => setIsBioModelsOpen(true)}>Import from BioModels...</DropdownItem>
            </Dropdown>

            <Dropdown trigger={
              <Button variant="subtle" className="h-9 px-3 inline-flex items-center gap-2" disabled={!modelExists && !code?.trim()} title="Export current model">
                <span>Export</span>
                <ChevronDownIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              </Button>
            }>
              <DropdownItem onClick={() => onExportBNGL?.()} disabled={!code?.trim()}>Export BNGL</DropdownItem>
              <DropdownItem onClick={() => onExportSBML?.()} disabled={!modelExists}>Export SBML</DropdownItem>
              <DropdownItem onClick={() => onExportSedML?.()} disabled={!modelExists}>Export SED-ML</DropdownItem>
              <DropdownItem onClick={() => onExportOMEX?.()} disabled={!modelExists}>Export OMEX</DropdownItem>
              <DropdownItem onClick={() => onExportNET?.()} disabled={!modelExists}>Export NET</DropdownItem>
            </Dropdown>

            <Button variant="subtle" onClick={() => onCodeChange(formatBNGLMini(code))} className="h-9 px-3">
              <span className="hidden md:inline">Format</span>
              <span className="md:hidden">✨</span>
            </Button>

            <Button onClick={() => onParse()} variant="secondary" className="h-9 px-4 font-bold">Parse</Button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".bngl,.sbml,.xml"
              data-testid="editor-load-input"
            />
          </div>

          <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
            <SimulationControls
              onRun={onSimulate}
              isSimulating={isSimulating}
              modelExists={modelExists}
              model={model}
            />
          </div>
        </div>

        {/* Row 2: Collapsible Parameter Sliders */}
        <div className="border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 overflow-hidden">
          <button
            onClick={() => setIsParamsOpen(!isParamsOpen)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <span>Parameter Sliders</span>
            <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${isParamsOpen ? 'rotate-180' : ''}`} />
          </button>

          {isParamsOpen && (
            <div className="border-t border-slate-200 dark:border-slate-700 dark:border-slate-700 p-2">
              <ParameterPanel code={code} onCodeChange={onCodeChange} />
            </div>
          )}
        </div>
      </div>
      <ExampleGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        onSelect={handleLoadExample}
        onImportSBML={onImportSBML}
      />
      <BioModelsImportModal
        isOpen={isBioModelsOpen}
        onClose={() => setIsBioModelsOpen(false)}
        onImportSBML={(file) => {
          if (onImportSBML) onImportSBML(file);
          else console.warn('Header requested BioModels import but no onImportSBML handler supplied');
        }}
      />
    </Card>
  );
};