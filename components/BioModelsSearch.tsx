import React, { useState } from 'react';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

interface BioModelsSearchProps {
  onImportById: (id: string) => void;
}

/**
 * Minimal BioModels search UI (draft):
 * - calls BioModels search endpoint with `format=json` and displays results
 * - each result shows ID, name and a small Import button that triggers an import
 *
 * Note: This is a draft UX optimized for quick prototyping. It intentionally
 * keeps the UI lightweight and uses the public BioModels API (may be rate
 * limited). For production, consider pagination, debouncing, and richer
 * metadata presentation.
 */
export const BioModelsSearch: React.FC<BioModelsSearchProps> = ({ onImportById }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const url = `/api/biomodels/search?query=${encodeURIComponent(q)}&format=json`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const json = await res.json();
      // The API returns results in 'models' (or sometimes 'results'/'data' in older versions/wrappers)
      const rawList = json.models || json.results || json.data || [];
      const hits: Array<{ id: string; name: string }> = rawList.map((r: any) => ({
        id: r.id || r.identifier || r.modelId || r['model.identifier'] || '',
        name: r.name || r.title || r.displayName || r['model.name'] || r.id || ''
      })).filter((h: any) => !!h.id);
      setResults(hits.slice(0, 20));
    } catch (e: any) {
      console.warn('BioModels search error', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4">
      <div className="flex gap-2 items-center">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search BioModels (e.g., MAPK)" />
        <Button onClick={runSearch} disabled={loading}>{loading ? 'Searching...' : 'Search'}</Button>
      </div>

      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}

      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
        {results.map(r => (
          <div key={r.id} className="flex items-center justify-between p-2 border rounded bg-slate-50 dark:bg-slate-800">
            <div className="text-sm">
              <div className="font-medium">{r.name || r.id}</div>
              <div className="text-xs text-slate-500">{r.id}</div>
            </div>
            <div>
              <Button onClick={() => onImportById(r.id)} className="text-xs">Import</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
