import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { MoonIcon } from './icons/MoonIcon';
import { SunIcon } from './icons/SunIcon';
import { EmailIcon } from './icons/EmailIcon';
import { ShareButton } from './ShareButton';
import { QuestionMarkCircleIcon } from './icons/QuestionMarkCircleIcon';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { InfoIcon } from './icons/InfoIcon';

interface HeaderProps {
  onAboutClick: (focus?: string) => void;
  code?: string;
  modelName?: string | null;
  modelId?: string | null;
  onModelNameChange?: (name: string | null) => void;
  viewMode: 'code' | 'design';
  onViewModeChange: (mode: 'code' | 'design') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onAboutClick,
  code,
  modelName,
  modelId,
  onModelNameChange,
  viewMode,
  onViewModeChange,
}) => {
  const [theme, toggleTheme] = useTheme();

  return (
    <>
      <header role="banner" className="bg-white dark:bg-slate-800 border-b border-stone-200 dark:border-slate-700 shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-3.5 lg:flex-row lg:items-center lg:justify-between">
            {/* Logo + Title */}
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600">
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
                <div role="group" aria-label="View mode" className="flex border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
                  <button
                    onClick={() => onViewModeChange('code')}
                    aria-pressed={viewMode === 'code'}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === 'code'
                      ? 'bg-slate-100 dark:bg-slate-800/50 text-teal-700 dark:text-teal-400'
                      : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100'
                      }`}
                  >
                    Code
                  </button>
                  <div className="w-px bg-slate-200 dark:bg-slate-700" />
                  <button
                    onClick={() => onViewModeChange('design')}
                    aria-pressed={viewMode === 'design'}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === 'design'
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                      : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100'
                      }`}
                  >
                    Designer Mode
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div aria-label="Main navigation" className="flex w-full flex-wrap items-center justify-end gap-1 sm:gap-2 lg:w-auto">
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

              <button
                type="button"
                onClick={() => onAboutClick('bngl')}
                className="rounded p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                title="BNGL Syntax Guide"
                aria-label="BNGL Syntax Guide"
              >
                <BookOpenIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => onAboutClick()}
                className="rounded p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                title="About BNG Playground"
                aria-label="About BNG Playground"
              >
                <InfoIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => window.open('mailto:bionetgen.main@gmail.com?subject=BNG%20Playground%20Question')}
                className="rounded p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                title="Contact Us"
                aria-label="Contact Us"
              >
                <EmailIcon className="h-5 w-5" />
              </button>

              <a
                href="https://bionetgen.org"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                title="Help & Resources — BioNetGen website"
                aria-label="Help & Resources"
              >
                <QuestionMarkCircleIcon className="h-5 w-5" />
              </a>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-700 hover:text-amber-500 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

      </header>
    </>
  );
};
