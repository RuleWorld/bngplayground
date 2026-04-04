import React, { useRef, useState } from 'react';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { getBioModelsApiBase } from '../services/bioModelsImport';

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
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, Array<{ id: string; name: string }>>());

  const buildSearchQuery = (term: string): string => `(${term}) AND modelformat:SBML`;

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;

    const normalizedQuery = q.toLowerCase();
    const cached = cacheRef.current.get(normalizedQuery);
    if (cached) {
      setError(null);
      setResults(cached);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const searchQuery = buildSearchQuery(q);
      const apiBase = getBioModelsApiBase();
      const url = `${apiBase}/search?query=${encodeURIComponent(searchQuery)}&format=json&numResults=12&sort=relevance-desc`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const json = await res.json();
      // The API returns results in different shapes depending on version; normalize
      const rawHits: Array<any> = json.models || json.results || json.data || [];
      const hits: Array<{ id: string; name: string }> = rawHits
        .filter((r) => !r.format || String(r.format).toUpperCase() === 'SBML')
        .map((r: any) => ({
          id: r.identifier || r.id || r.modelId || r['model.identifier'] || r['identifier'] || '',
          name: r.name || r.title || r.displayName || r['model.name'] || r['name'] || ''
        }))
        .filter((h) => !!h.id);

      cacheRef.current.set(normalizedQuery, hits);
      setResults(hits);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.warn('BioModels search error', e);
      setError(e?.message || String(e));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setLoading(false);
    }
  };

  return (
    <div className="mb-4">
      <div className="flex gap-2 items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) {
              void runSearch();
            }
          }}
          placeholder="Search SBML BioModels (e.g., MAPK)"
        />
        <Button onClick={runSearch} disabled={loading}>{loading ? 'Searching...' : 'Search'}</Button>
      </div>

      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Searches BioModels by your term and restricts results to SBML models only.
      </div>

      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}

      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
        {results.map(r => (
          <div key={r.id} className="flex items-center justify-between p-2 border rounded bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800">
            <div className="text-sm">
              <div className="font-medium">{r.name || r.id}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{r.id}</div>
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
