import React, { useState } from 'react';
import { Button } from './ui/Button';
import { downloadTextFile } from '../src/utils/download';

interface VSCodeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  modelName?: string | null;
}

export const VSCodeExportModal: React.FC<VSCodeExportModalProps> = ({
  isOpen,
  onClose,
  code,
  modelName,
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  
  if (!isOpen) return null;

  // Most browsers/OS have limits around 2000-4000 characters for URLs
  const isTooLongForUrl = code.length > 2000;

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

  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string, ms = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const attemptUri = (uri: string) => {
    try {
      window.location.href = uri;
    } catch (err) {
      console.warn('Protocol open failed:', err);
    }
  };

  const handleOpenInVSCode = async () => {
    // Attempt to open in VS Code with the correct extension protocol
    // Include a filename param in case the extension expects it
    const filename = modelName ? `${modelName.replace(/\s+/g, '_')}.bngl` : 'model.bngl';

    // If model is long, proactively copy to clipboard so users can paste into a new file
    if (isTooLongForUrl) {
      try {
        await navigator.clipboard.writeText(code);
        setCopyStatus('copied');
        showToast('BNGL copied to clipboard');
      } catch (err) {
        console.warn('Clipboard copy failed before opening VS Code:', err);
        showToast('Failed to copy to clipboard');
      }
    } else {
      showToast('Opening in VS Code...');
    }

    // Build parameter set (include content for maximum compatibility)
    const params = new URLSearchParams({ code, content: code, filename }).toString();

    // Try multiple protocol variants to maximize compatibility with the extension:
    const uris = [
      `vscode://als251.bngl/open?${params}`,
      `vscode://als251.bngl/open?clipboard=true&filename=${encodeURIComponent(filename)}`,
      `vscode://als251.bngl/command?cmd=openFromClipboard&filename=${encodeURIComponent(filename)}`,
    ];

    for (const u of uris) {
      attemptUri(u);
      // give the system a short moment to process the protocol; trying multiple forms increases chance the extension handles one
       
      await sleep(350);
    }

    // If VS Code opens but the extension doesn't respond, show help after a short delay
    setTimeout(() => setShowHelp(true), 2200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.1 22.1l-11.2-4.5-9.6 4.5v-2.1L7.9 16.5l-7.9-3.5v-2L7.9 7.5L0 4.1V2l9.6 4.5L19.1 2z M10.6 12l8.5-4L24 12l-4.9 4z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Open in VS Code</h3>
          </div>

          <div className="space-y-4 mb-6">
             <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {isTooLongForUrl 
                    ? "⚠️ Model is large. Protocol opening might fail. We recommend downloading and opening manually."
                    : "Make sure you have the BioNetGen extension installed in VS Code."}
                </p>
             </div>
          </div>

          <div className="space-y-3 mb-8">
            <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 font-mono truncate flex-1">{modelName || 'model'}.bngl</span>
              <Button variant="secondary" onClick={handleDownloadOnly} className="h-7 text-[10px] px-2">
                Download
              </Button>
            </div>
            
            <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 font-mono flex-1">Copy code to clipboard</span>
              <Button variant="secondary" onClick={handleCopy} className="h-7 text-[10px] px-2 min-w-[70px]">
                {copyStatus === 'copied' ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} className="flex-1">Close</Button>
            <Button 
                onClick={handleOpenInVSCode}
                title={'Open in locally installed VS Code (requires BioNetGen extension)'}
                className={`flex-1 bg-blue-600 hover:bg-blue-700 text-white shadow-lg`}
            >
              Open in VS Code
            </Button>
          </div>

          {/* Toast message (temporary feedback) */}
          {toast && (
            <div className="mt-4 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-100 dark:border-green-800 text-sm text-green-800">
              {toast}
            </div>
          )}

          {/* Help note shown if opening didn't result in the model being displayed in VS Code */}
          {showHelp && (
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-100 dark:border-slate-800 text-sm">
              <strong>VS Code opened but model did not appear?</strong>
              <ul className="mt-2 list-disc list-inside text-xs">
                <li>Ensure the <a href="https://marketplace.visualstudio.com/items?itemName=als251.bngl" target="_blank" rel="noreferrer" className="text-blue-500 underline">BioNetGen extension</a> is installed.</li>
                <li>If installed, try using the extension's command palette action (e.g., <em>BioNetGen: Open model from URL</em>) or paste the model (use <em>Copy</em> above) into a new file.</li>
                <li>Alternatively, download the BNGL file and open it in VS Code manually.</li>
              </ul>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => { setShowHelp(false); }} className="text-[10px] px-2">Dismiss</Button>
                <Button variant="secondary" onClick={handleDownloadOnly} className="text-[10px] px-2">Download</Button>
                <Button variant="secondary" onClick={handleCopy} className="text-[10px] px-2">Copy</Button>
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
