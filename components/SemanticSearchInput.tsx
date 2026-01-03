/**
 * Semantic search input component for the model gallery.
 * Provides natural language search with visual feedback on AI processing.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SearchIcon } from './icons/SearchIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { semanticSearch, preloadEmbeddingModel, SearchResult } from '../services/semanticSearch';

interface SemanticSearchInputProps {
  onResults: (results: SearchResult[]) => void;
  onSearchStart: () => void;
  onSearchEnd: () => void;
  placeholder?: string;
}

export const SemanticSearchInput: React.FC<SemanticSearchInputProps> = ({
  onResults,
  onSearchStart,
  onSearchEnd,
  placeholder = 'Search models (e.g., "calcium signaling" or "MAPK cascade")...',
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Preload embedding model on mount
  useEffect(() => {
    setIsModelLoading(true);
    preloadEmbeddingModel();
    // Model loads in background; we'll know it's ready when first search succeeds
    const timer = setTimeout(() => setIsModelLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);
  
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      onResults([]);
      return;
    }
    
    setIsSearching(true);
    setError(null);
    onSearchStart();
    
    try {
      const results = await semanticSearch(searchQuery, 20);
      onResults(results);
    } catch (err) {
      console.error('Semantic search failed:', err);
      setError('Search unavailable. Try a keyword search instead.');
      onResults([]);
    } finally {
      setIsSearching(false);
      onSearchEnd();
    }
  }, [onResults, onSearchStart, onSearchEnd]);
  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    
    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      performSearch(newQuery);
    }, 300);
  }, [performSearch]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      performSearch(query);
    }
  }, [query, performSearch]);
  
  const handleClear = useCallback(() => {
    setQuery('');
    setError(null);
    onResults([]);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, [onResults]);
  
  return (
    <div className="relative">
      <div className="relative">
        {/* Search icon or loading spinner */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          {isSearching ? (
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <SearchIcon className="w-5 h-5 text-slate-400" />
          )}
        </div>
        
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-10 pr-24 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
        
        {/* Clear button when there's a query */}
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-24 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Clear search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        
        {/* AI badge */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          <SparklesIcon className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {isModelLoading ? 'Loading AI...' : 'AI Search'}
          </span>
        </div>
      </div>
      
      {/* Error message */}
      {error && (
        <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
      
      {/* Helper text */}
      {!error && query.length === 0 && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Try natural language queries like "receptor binding" or "gene regulation feedback loop"
        </p>
      )}
    </div>
  );
};

export type { SearchResult };
