import React, { useState, useCallback } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { 
  ExperimentalData, 
  readExperimentalCSVFile 
} from '../../src/utils/experimentalData';

interface ExperimentalDataPanelProps {
  onDataLoaded: (data: ExperimentalData | null) => void;
  experimentalData: ExperimentalData | null;
  availableObservables: string[];
}

export const ExperimentalDataPanel: React.FC<ExperimentalDataPanelProps> = ({
  onDataLoaded,
  experimentalData,
  availableObservables,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setError(null);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.csv')) {
      setError('Please drop a CSV file');
      return;
    }

    try {
      const data = await readExperimentalCSVFile(file);
      onDataLoaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    }
  }, [onDataLoaded]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await readExperimentalCSVFile(file);
      onDataLoaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    }
  }, [onDataLoaded]);

  const handleClear = useCallback(() => {
    onDataLoaded(null);
    setError(null);
  }, [onDataLoaded]);

  // Check which datasets match available observables
  const matchedDatasets = experimentalData?.datasets.filter(ds => 
    availableObservables.includes(ds.name)
  ) ?? [];
  const unmatchedDatasets = experimentalData?.datasets.filter(ds => 
    !availableObservables.includes(ds.name)
  ) ?? [];

  return (
    <Card className="p-4">
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
        Experimental Data Overlay
      </h4>

      {!experimentalData ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${isDragging 
              ? 'border-primary bg-primary/5' 
              : 'border-slate-300 dark:border-slate-600 hover:border-slate-400'
            }
          `}
        >
          <div className="text-slate-500 dark:text-slate-400 mb-2">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm">Drag &amp; drop a CSV file here</p>
            <p className="text-xs mt-1">or</p>
          </div>
          <label className="inline-block">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
            />
            <span className="cursor-pointer text-primary hover:underline text-sm">
              Browse files
            </span>
          </label>
          <p className="text-xs text-slate-400 mt-3">
            CSV format: time, Observable1, Observable1_error (optional), ...
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-300">
              📄 {experimentalData.fileName}
            </span>
            <Button variant="secondary" onClick={handleClear}>
              Remove
            </Button>
          </div>

          {matchedDatasets.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded text-xs">
              <p className="font-medium text-green-700 dark:text-green-300 mb-1">
                ✓ Matched columns ({matchedDatasets.length}):
              </p>
              <p className="text-green-600 dark:text-green-400">
                {matchedDatasets.map(ds => ds.name).join(', ')}
              </p>
            </div>
          )}

          {unmatchedDatasets.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded text-xs">
              <p className="font-medium text-yellow-700 dark:text-yellow-300 mb-1">
                ⚠ Unmatched columns (not in model):
              </p>
              <p className="text-yellow-600 dark:text-yellow-400">
                {unmatchedDatasets.map(ds => ds.name).join(', ')}
              </p>
            </div>
          )}

          <div className="text-xs text-slate-500">
            {experimentalData.datasets.reduce((sum, ds) => sum + ds.points.length, 0)} data points total
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded">
          {error}
        </div>
      )}
    </Card>
  );
};
