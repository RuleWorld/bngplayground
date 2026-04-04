import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { MoonIcon } from './icons/MoonIcon';
import { SunIcon } from './icons/SunIcon';
import { EmailIcon } from './icons/EmailIcon';
import { Button } from './ui/Button';
import { ShareButton } from './ShareButton';
import { Dropdown, DropdownItem } from './ui/Dropdown';
import { QuestionMarkCircleIcon } from './icons/QuestionMarkCircleIcon';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { EyeIcon } from './icons/EyeIcon';
import { InfoIcon } from './icons/InfoIcon';
import { VSCodeAnalysisPayload, VSCodeExportModal } from './VSCodeExportModal';
import { DownloadIcon } from './icons/DownloadIcon';
import { UploadIcon } from './icons/UploadIcon';
import { BioModelsImportModal } from './BioModelsImportModal';

interface HeaderProps {
  onAboutClick: (focus?: string) => void;
  onExportSBML?: () => void;
  onExportSedML?: () => void;
  onExportOMEX?: () => void;
  onExportNET?: () => void;
  onExportBNGL?: () => void;
  onImportSBML?: (file: File) => void | Promise<void>;
  code?: string;
  modelName?: string | null;
  modelId?: string | null;
  onModelNameChange?: (name: string | null) => void;
  vscodeExportPayload?: VSCodeAnalysisPayload | null;
  viewMode: 'code' | 'design';
  onViewModeChange: (mode: 'code' | 'design') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onAboutClick,
  onExportSBML,
  onExportSedML,
  onExportOMEX,
  onExportNET,
  onExportBNGL,
  onImportSBML,
  code,
  modelName,
  modelId,
  onModelNameChange,
  vscodeExportPayload,
  viewMode,
  onViewModeChange,
}) => {
  const [theme, toggleTheme] = useTheme();
  const [isVSCodeModalOpen, setIsVSCodeModalOpen] = React.useState(false);
  const [isBioModelsOpen, setIsBioModelsOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <header className="bg-white dark:bg-slate-900 dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3.5">
            {/* Logo + Title */}
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
                <img
                  src="/bngplayground/logo.png"
                  alt="BioNetGen Visualizer logo"
                  className="h-full w-full object-contain object-center"
                  loading="lazy"
                />
              </div>

              <div className="flex flex-col md:flex-row md:items-baseline md:gap-3">
                <h1 className="text-2xl font-semibold leading-tight text-slate-800 dark:text-slate-100">
                  BNG Playground
                </h1>

                {/* Subtle Mode Switcher */}
                <div className="flex border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded overflow-hidden">
                  <button
                    onClick={() => onViewModeChange('code')}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === 'code'
                      ? 'bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-700 text-teal-700 dark:text-teal-400'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    Code
                  </button>
                  <div className="w-px bg-slate-200 dark:bg-slate-700" />
                  <button
                    onClick={() => onViewModeChange('design')}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === 'design'
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    Designer Mode
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {code && (
                <div className="flex items-center gap-1 mr-1">
                  <ShareButton
                    code={code}
                    modelName={modelName}
                    modelId={modelId}
                    onModelNameChange={onModelNameChange}
                  />
                </div>
              )}

              {/* Help Dropdown */}
              <Dropdown
                trigger={
                  <button className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-400 
                                     dark:hover:text-slate-200 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-700 rounded transition-colors"
                    title="Help & Resources">
                    <QuestionMarkCircleIcon className="w-5 h-5" />
                  </button>
                }
              >
                <DropdownItem onClick={() => onAboutClick('bngl')}>
                  <div className="flex items-center gap-2">
                    <BookOpenIcon className="w-4 h-4 text-slate-400" />
                    <span>BNGL Syntax Guide</span>
                  </div>
                </DropdownItem>
                <DropdownItem onClick={() => onAboutClick('viz')}>
                  <div className="flex items-center gap-2">
                    <EyeIcon className="w-4 h-4 text-slate-400" />
                    <span>Visualization Key</span>
                  </div>
                </DropdownItem>
                <DropdownItem onClick={() => onAboutClick()}>
                  <div className="flex items-center gap-2">
                    <InfoIcon className="w-4 h-4 text-slate-400" />
                    <span>About BNG Playground</span>
                  </div>
                </DropdownItem>
                <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                <DropdownItem onClick={() => fileInputRef.current?.click()}>
                  <div className="flex items-center gap-2">
                    <UploadIcon className="w-4 h-4 text-slate-400" />
                    <span>Import SBML (Local file)</span>
                  </div>
                </DropdownItem>
                <DropdownItem onClick={() => setIsBioModelsOpen(true)}>
                  <div className="flex items-center gap-2">
                    <UploadIcon className="w-4 h-4 text-slate-400" />
                    <span>Import from BioModels...</span>
                  </div>
                </DropdownItem>
                {onExportSBML && (
                  <DropdownItem onClick={onExportSBML}>
                    <div className="flex items-center gap-2">
                      <DownloadIcon className="w-4 h-4 text-slate-400" />
                      <span>Export SBML</span>
                    </div>
                  </DropdownItem>
                )}
                {onExportSedML && (
                  <DropdownItem onClick={onExportSedML}>
                    <div className="flex items-center gap-2">
                      <DownloadIcon className="w-4 h-4 text-slate-400" />
                      <span>Export SED-ML</span>
                    </div>
                  </DropdownItem>
                )}
                {onExportOMEX && (
                  <DropdownItem onClick={onExportOMEX}>
                    <div className="flex items-center gap-2">
                      <DownloadIcon className="w-4 h-4 text-slate-400" />
                      <span>Export OMEX (Archive)</span>
                    </div>
                  </DropdownItem>
                )}
                {onExportBNGL && (
                  <DropdownItem onClick={onExportBNGL}>
                    <div className="flex items-center gap-2">
                      <DownloadIcon className="w-4 h-4 text-slate-400" />
                      <span>Export BNGL</span>
                    </div>
                  </DropdownItem>
                )}
                {code && (
                  <DropdownItem onClick={() => setIsVSCodeModalOpen(true)}>
                    <div className="flex items-center gap-2">
                      <DownloadIcon className="w-4 h-4 text-slate-400" />
                      <span>Open In VS Code</span>
                    </div>
                  </DropdownItem>
                )}
                {onExportNET && (
                  <DropdownItem onClick={onExportNET}>
                    <div className="flex items-center gap-2">
                      <DownloadIcon className="w-4 h-4 text-slate-400" />
                      <span>Export NET</span>
                    </div>
                  </DropdownItem>
                )}
                <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                <DropdownItem onClick={() => window.open('mailto:bionetgen.main@gmail.com?subject=BNG%20Playground%20Question')}>
                  <div className="flex items-center gap-2">
                    <EmailIcon className="w-4 h-4 text-slate-400" />
                    <span>Contact Us</span>
                  </div>
                </DropdownItem>
              </Dropdown>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-700 hover:text-amber-500 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        <VSCodeExportModal
          isOpen={isVSCodeModalOpen}
          onClose={() => setIsVSCodeModalOpen(false)}
          code={code || ''}
          modelName={modelName}
          payload={vscodeExportPayload}
        />
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".sbml,.xml"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onImportSBML) {
              onImportSBML(file);
              // Reset input so the same file can be selected again
              e.target.value = '';
            }
          }}
        />
        <BioModelsImportModal
          isOpen={isBioModelsOpen}
          onClose={() => setIsBioModelsOpen(false)}
          onImportSBML={(file) => {
            if (onImportSBML) onImportSBML(file);
            else console.warn('BioModels import requested but no onImportSBML handler present');
          }}
        />
      </header>
    </>
  );
};
