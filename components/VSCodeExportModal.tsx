import React, { useState } from 'react';
import { Button } from './ui/Button';
import { downloadTextFile } from '../src/utils/download';

export interface VSCodeAnalysisPayload {
  version: 1;
  source: 'bng-playground';
  modelName?: string | null;
  code: string;
  analyses?: {
    activeTabIndex?: number;
    simulationOptions?: Record<string, unknown> | null;
    simulationResults?: Record<string, unknown> | null;
    exportedAt: string;
  };
}

interface VSCodeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  modelName?: string | null;
  payload?: VSCodeAnalysisPayload | null;
}

export const VSCodeExportModal: React.FC<VSCodeExportModalProps> = ({
  isOpen,
  onClose,
  code,
  modelName,
  payload,
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (!isOpen) return null;

  const effectivePayload: VSCodeAnalysisPayload = payload ?? {
    version: 1,
    source: 'bng-playground',
    modelName,
    code,
    analyses: {
      exportedAt: new Date().toISOString(),
    },
  };
  const serializedPayload = JSON.stringify(effectivePayload);

  const isTooLongForUrl = serializedPayload.length > 2000;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleDownloadOnly = () => {
    const filename = modelName ? `${modelName.replace(/\s+/g, '_')}.bngl` : 'model.bngl';
    downloadTextFile(code, filename, 'text/plain');
  };

  const showToast = (msg: string, ms = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const attemptUri = (uri: string) => {
    try {
      window.location.href = uri;
    } catch (err) {
      console.warn('Protocol open failed:', err);
    }
  };

  const encodeBase64Url = (value: string) => {
    const utf8 = new TextEncoder().encode(value);
    let binary = '';
    utf8.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };

  const handleOpenInVSCode = async () => {
    const filename = modelName ? `${modelName.replace(/\s+/g, '_')}.bngl` : 'model.bngl';
    const inlinePayload = isTooLongForUrl ? null : encodeBase64Url(serializedPayload);

    try {
      await navigator.clipboard.writeText(serializedPayload);
      setCopyStatus('copied');
    } catch (err) {
      console.warn('Clipboard copy failed before opening VS Code:', err);
      showToast('Failed to copy export package');
      return;
    }

    showToast(isTooLongForUrl ? 'Analysis package copied to clipboard' : 'Opening in VS Code...');

    const uris = inlinePayload
      ? [
          `vscode://als251.bngl/open?filename=${encodeURIComponent(filename)}&payload=${encodeURIComponent(inlinePayload)}`,
          `vscode://als251.bngl/open?source=clipboard&format=bngplayground&filename=${encodeURIComponent(filename)}`,
          `vscode://als251.bngl/command?cmd=openFromClipboard&format=bngplayground&filename=${encodeURIComponent(filename)}`,
        ]
      : [
          `vscode://als251.bngl/open?source=clipboard&format=bngplayground&filename=${encodeURIComponent(filename)}`,
          `vscode://als251.bngl/command?cmd=openFromClipboard&format=bngplayground&filename=${encodeURIComponent(filename)}`,
        ];

    for (const uri of uris) {
      attemptUri(uri);
      await sleep(350);
    }

    setTimeout(() => setShowHelp(true), 2200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <div className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.1 22.1l-11.2-4.5-9.6 4.5v-2.1L7.9 16.5l-7.9-3.5v-2L7.9 7.5L0 4.1V2l9.6 4.5L19.1 2z M10.6 12l8.5-4L24 12l-4.9 4z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Open in VS Code</h3>
          </div>

          <div className="mb-6 space-y-4">
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {isTooLongForUrl
                  ? 'Model plus analysis snapshot is large. The extension will import it from your clipboard.'
                  : 'The extension will open the BNGL file and a sidecar analysis snapshot in VS Code.'}
              </p>
            </div>
          </div>

          <div className="mb-8 space-y-3">
            <div className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/50">
              <span className="flex-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400">{modelName || 'model'}.bngl</span>
              <Button variant="secondary" onClick={handleDownloadOnly} className="h-7 px-2 text-[10px]">
                Download
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/50">
              <span className="flex-1 font-mono text-xs text-slate-500 dark:text-slate-400">Copy code to clipboard</span>
              <Button variant="secondary" onClick={handleCopy} className="h-7 min-w-[70px] px-2 text-[10px]">
                {copyStatus === 'copied' ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} className="flex-1">Close</Button>
            <Button
              onClick={handleOpenInVSCode}
              title="Open in locally installed VS Code (requires BioNetGen extension)"
              className="flex-1 bg-blue-600 text-white shadow-lg hover:bg-blue-700"
            >
              Open in VS Code
            </Button>
          </div>

          {toast && (
            <div className="mt-4 rounded border border-green-100 bg-green-50 p-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20">
              {toast}
            </div>
          )}

          {showHelp && (
            <div className="mt-4 rounded border border-slate-100 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/50">
              <strong>VS Code opened but model did not appear?</strong>
              <ul className="mt-2 list-inside list-disc text-xs">
                <li>Ensure the <a href="https://marketplace.visualstudio.com/items?itemName=als251.bngl" target="_blank" rel="noreferrer" className="text-blue-500 underline">BioNetGen extension</a> is installed.</li>
                <li>If installed, try the command palette action for opening an imported model or re-run this action.</li>
                <li>Alternatively, download the BNGL file and open it in VS Code manually.</li>
              </ul>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => { setShowHelp(false); }} className="px-2 text-[10px]">Dismiss</Button>
                <Button variant="secondary" onClick={handleDownloadOnly} className="px-2 text-[10px]">Download</Button>
                <Button variant="secondary" onClick={handleCopy} className="px-2 text-[10px]">Copy</Button>
              </div>
            </div>
          )}

          <p className="mt-4 text-center">
            <a
              href="https://marketplace.visualstudio.com/items?itemName=als251.bngl"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-500 hover:underline"
            >
              Get BioNetGen Extension →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
