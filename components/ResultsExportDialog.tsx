import React, { useEffect, useMemo, useState } from 'react';
import { buildResultExport, downloadResultExport, formatByteEstimate, type ResultExportArtifact, type ResultsExportDescriptor } from '../services/resultsExport';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

type ExportScope = 'current' | 'full';

interface ResultsExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  descriptor: ResultsExportDescriptor;
}

interface ResultsExportControlProps {
  descriptor: ResultsExportDescriptor;
  label?: string;
  className?: string;
}

function availableArtifacts(descriptor: ResultsExportDescriptor, scope: ExportScope): ResultExportArtifact[] {
  const scopeDescriptor = scope === 'full' ? descriptor.fullResult : descriptor.currentView;
  return (scopeDescriptor?.artifacts ?? []).filter((artifact) => artifact.available ? artifact.available() : true);
}

function defaultSelection(artifacts: ResultExportArtifact[]): Record<string, boolean> {
  return Object.fromEntries(artifacts.map((artifact) => [
    artifact.id,
    artifact.selectedByDefault ?? true,
  ]));
}

function defaultFormats(artifacts: ResultExportArtifact[]): Record<string, string> {
  return Object.fromEntries(artifacts.map((artifact) => [artifact.id, artifact.defaultFormat]));
}

export const ResultsExportDialog: React.FC<ResultsExportDialogProps> = ({ isOpen, onClose, descriptor }) => {
  const [scope, setScope] = useState<ExportScope>('current');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [formats, setFormats] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const artifacts = useMemo(() => availableArtifacts(descriptor, scope), [descriptor, scope]);
  const scopeDescription = scope === 'full'
    ? descriptor.fullResult?.description
    : descriptor.currentView?.description;

  useEffect(() => {
    if (!isOpen) return;
    setSelected(defaultSelection(artifacts));
    setFormats(defaultFormats(artifacts));
    setError(null);
  }, [artifacts, isOpen]);

  const selectedArtifacts = artifacts.filter((artifact) => selected[artifact.id]);
  const estimatedBytes = selectedArtifacts.reduce((total, artifact) => total + (artifact.estimatedBytes ?? 0), 0);
  const isLarge = estimatedBytes >= 25 * 1024 * 1024;

  const handleExport = async () => {
    if (selectedArtifacts.length === 0) {
      setError('Select at least one item to export.');
      return;
    }

    setIsExporting(true);
    setError(null);
    try {
      const result = await buildResultExport(
        descriptor,
        scope,
        selectedArtifacts.map((artifact) => ({
          artifact,
          format: formats[artifact.id] ?? artifact.defaultFormat,
        })),
      );
      downloadResultExport(result);
      onClose();
    } catch (exportError) {
      setError(`Could not create the export file. Your analysis results are still available in the Playground. ${exportError instanceof Error ? exportError.message : String(exportError)}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Export ${descriptor.analysisType}`} size="lg">
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100">Scope</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <input
                type="radio"
                name="result-export-scope"
                value="current"
                checked={scope === 'current'}
                onChange={() => setScope('current')}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Current view</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Only the selected or filtered result currently being examined.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <input
                type="radio"
                name="result-export-scope"
                value="full"
                checked={scope === 'full'}
                onChange={() => setScope('full')}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Full result</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">All completed scientific output, independent of display filters.</span>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100">Contents</legend>
          <p className="text-xs text-slate-500 dark:text-slate-400">{scopeDescription}</p>
          {artifacts.length > 0 ? (
            <div className="space-y-2">
              {artifacts.map((artifact) => (
                <div key={artifact.id} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[artifact.id])}
                      onChange={(event) => setSelected((current) => ({ ...current, [artifact.id]: event.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{artifact.label}</span>
                      {artifact.description && <span className="block text-xs text-slate-500 dark:text-slate-400">{artifact.description}</span>}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span>Format</span>
                    <select
                      aria-label={`${artifact.label} format`}
                      value={formats[artifact.id] ?? artifact.defaultFormat}
                      onChange={(event) => setFormats((current) => ({ ...current, [artifact.id]: event.target.value }))}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                    >
                      {artifact.formats.map((format) => (
                        <option key={format.value} value={format.value}>{format.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
              No completed result is available for this scope yet.
            </p>
          )}
        </fieldset>

        {(isLarge || (scope === 'full' && descriptor.largeExportWarning)) && (
          <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">This export may be large.</p>
            <p className="mt-1 text-xs">
              {descriptor.largeExportWarning ?? `Estimated selected data size: ${formatByteEstimate(estimatedBytes)}. The complete result will be generated without silently dropping records.`}
            </p>
          </div>
        )}

        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <span className="mr-auto text-xs text-slate-500 dark:text-slate-400">
            {selectedArtifacts.length} item{selectedArtifacts.length === 1 ? '' : 's'} selected{estimatedBytes > 0 ? ` · about ${formatByteEstimate(estimatedBytes)}` : ''}
          </span>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isExporting}>Cancel</Button>
          <Button type="button" onClick={handleExport} disabled={isExporting || selectedArtifacts.length === 0}>
            {isExporting ? 'Creating export…' : scope === 'full' ? 'Export full result' : 'Export current view'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export const ResultsExportControl: React.FC<ResultsExportControlProps> = ({ descriptor, label = 'Export', className }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className={className}
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${label} ${descriptor.analysisType}`}
      >
        📥 {label}
      </Button>
      <ResultsExportDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        descriptor={descriptor}
      />
    </>
  );
};
