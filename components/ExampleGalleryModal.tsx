import React, { useState, useMemo } from 'react';
import { Modal } from './ui/Modal';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { SearchIcon } from './icons/SearchIcon';
import { SemanticSearchInput, SearchResult } from './SemanticSearchInput';
import { BioModelsSearch } from './BioModelsSearch';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from './ui/Tabs';
import { getManifestDebugInfo, loadModelCode } from '../services/modelLoader';
import { fetchBioModelsSbml } from '../services/bioModelsImport';
import { loadModelCatalog, type CatalogCategory, type CatalogExample } from '../services/modelCatalog';

// Helper to convert model names to Title Case
// Handles special acronyms like MAPK, EGFR, etc.
const toTitleCase = (str: string): string => {
  // List of known acronyms that should stay uppercase
  const acronyms = ['mapk', 'egfr', 'akt', 'tlbr', 'blbr', 'bcr', 'tcr', 'fceri', 'nfkb', 'tnf', 'dna', 'rna', 'ode', 'ssa', 'pde'];

  return str.split(' ').map(word => {
    const lowerWord = word.toLowerCase();
    // Check if it's a known acronym
    if (acronyms.includes(lowerWord)) {
      return word.toUpperCase();
    }
    // Otherwise capitalize first letter
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
};

interface ExampleGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (code: string, modelName?: string, modelId?: string) => void;
  onImportSBML?: (file: File) => void | Promise<void>; // optional: allow direct SBML import (used by BioModels search)
}

export const ExampleGalleryModal: React.FC<ExampleGalleryModalProps> = ({ isOpen, onClose, onSelect, onImportSBML }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [focusedExample, setFocusedExample] = useState<string | null>(null);
  const [semanticResults, setSemanticResults] = useState<SearchResult[] | null>(null);
  const [isSemanticSearching, setIsSemanticSearching] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [allModels, setAllModels] = useState<CatalogExample[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [bioModelsImportError, setBioModelsImportError] = useState<string | null>(null);
  const [bioModelsLoadingId, setBioModelsLoadingId] = useState<string | null>(null);

  const currentCategory = useMemo(() => {
    return categories.find(cat => cat.id === selectedCategory) || categories[0];
  }, [categories, selectedCategory]);

  // Debug: Log model counts in dev mode
  if ((import.meta as any)?.env?.DEV) {
    console.log('[ExampleGalleryModal] Total RuleHub gallery models:', allModels.length);
    console.log('[ExampleGalleryModal] Models after category filtering:', allModels.length);
    console.log('[ExampleGalleryModal] Total category count:', categories.reduce((sum, cat) => sum + cat.models.length, 0));
  }

  const filteredExamples = useMemo(() => {
    // If semantic search returned results, use those
    if (semanticResults && semanticResults.length > 0) {
      // Map semantic results to model objects
      return semanticResults
        .map(result => {
          // Match by id or by filename (without .bngl extension)
          const modelId = result.id.split('/').pop() || result.id;
          return allModels.find(m =>
            m.id === modelId ||
            m.id === result.filename.replace('.bngl', '') ||
            m.name.toLowerCase().replace(/\s+/g, '-') === modelId.toLowerCase() ||
            m.name.toLowerCase().replace(/\s+/g, '_') === modelId.toLowerCase()
          );
        })
        .filter((m): m is NonNullable<typeof m> => m !== undefined);
    }

    // Use keyword search if there's a search term
    if (searchTerm) {
      return allModels.filter(example => {
        const term = searchTerm.toLowerCase();
        return (
          example.name.toLowerCase().includes(term) ||
          example.description.toLowerCase().includes(term) ||
          example.id.toLowerCase().includes(term) ||
          example.tags?.some(tag => tag.toLowerCase().includes(term))
        );
      });
    }

    // Category-scoped list when not searching
    if (!currentCategory) return [];
    return currentCategory.models;
  }, [searchTerm, semanticResults, currentCategory, allModels]);

  const displayedExamples = filteredExamples;

  // Total number of models across ALL categories (sum of category counts).
  const totalModelsCount = useMemo(() => {
    return allModels.length;
  }, [allModels]);

  // Handle semantic search results
  const handleSemanticResults = (results: SearchResult[]) => {
    if (results.length > 0) {
      setSemanticResults(results);
      setSearchTerm(''); // Clear keyword search when semantic search has results
    } else {
      setSemanticResults(null);
    }
  };

  React.useEffect(() => {
    if (!isOpen) {
      setFocusedExample(null);
      setSemanticResults(null);
      setModelLoadError(null);
      setBioModelsImportError(null);
      setBioModelsLoadingId(null);
      return;
    }

    let cancelled = false;
    setIsCatalogLoading(true);
    setCatalogError(null);
    setModelLoadError(null);
    setSearchTerm('');
    setSemanticResults(null);

    void loadModelCatalog()
      .then((catalog) => {
        if (cancelled) return;
        setAllModels(catalog.examples);
        setCategories(catalog.categories);
        setSelectedCategory(catalog.categories[0]?.id || '');
      })
      .catch((error) => {
        if (cancelled) return;
        const debug = getManifestDebugInfo();
        const message = error instanceof Error ? error.message : String(error);
        setCatalogError(`Failed to load RuleHub models. Tried: ${debug.candidates.join(', ')}. ${message}`);
        console.error('[ExampleGalleryModal] Failed to load RuleHub catalog', {
          error,
          manifestCandidates: debug.candidates,
          manifestResolved: debug.resolved,
        });
      })
      .finally(() => {
        if (!cancelled) setIsCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="BNGL Models" size="3xl">
      <div className="flex flex-col">
        <Tabs>
          <div className="px-1 border-b border-slate-200 dark:border-slate-700 dark:border-slate-700">
            <TabList>
              <Tab>Example Gallery</Tab>
              <Tab>BioModels Repository</Tab>
            </TabList>
          </div>

          <TabPanels>
            <TabPanel className="py-4">
              <div className="px-1">
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                  Browse {totalModelsCount} models across {categories.length} categories.
                </p>

                {catalogError && (
                  <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                    {catalogError}
                  </div>
                )}

                {modelLoadError && (
                  <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
                    {modelLoadError}
                  </div>
                )}

                {/* Semantic Search */}
                <div className="mb-4">
                  <SemanticSearchInput
                    onResults={handleSemanticResults}
                    onSearchStart={() => setIsSemanticSearching(true)}
                    onSearchEnd={() => setIsSemanticSearching(false)}
                  />
                </div>

                {/* Semantic search results indicator */}
                {semanticResults && (
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      Found {filteredExamples.length} semantically similar models
                    </span>
                    <button
                      onClick={() => setSemanticResults(null)}
                      className="text-xs text-primary hover:underline"
                    >
                      Clear &amp; browse categories
                    </button>
                  </div>
                )}

                {/* Fallback keyword search (shows when no semantic results) */}
                {!semanticResults && (
                  <div className="relative mb-4">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Or filter by keyword..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                )}

                {/* Category Tabs - hide when semantic results are shown */}
                {!semanticResults && !searchTerm && (
                  <div className="flex flex-wrap gap-2 mb-6 border-b border-stone-200 dark:border-slate-700 pb-4">
                    {categories.map(category => (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${selectedCategory === category.id
                            ? 'bg-primary text-white'
                            : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                      >
                        {category.name} ({category.models.length})
                      </button>
                    ))}
                  </div>
                )}

                {/* Category Description - hide when semantic results are shown */}
                {!semanticResults && !searchTerm && currentCategory && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 italic">
                    {currentCategory.description}
                  </p>
                )}
              </div>

              {/* Model Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pr-2 pb-4">
                {isCatalogLoading && (
                  <p className="text-slate-500 dark:text-slate-400 col-span-full text-center">Loading RuleHub models...</p>
                )}
                {displayedExamples.length > 0 ? displayedExamples.map(example => (
                  <Card key={example.id} className="flex flex-col">
                    <div className="flex items-center justify-between">
                      {focusedExample === example.id ? (
                        <div className="text-xs text-primary">Focused</div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400">&nbsp;</div>
                      )}
                    </div>
                    <div className="flex-grow">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{toTitleCase(example.name)}</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{example.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {example.tags?.filter(tag => tag.length >= 3).slice(0, 3).map(tag => (
                          <span key={tag} className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-800 dark:text-primary-300 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        if (loadingId) return; // prevent double-click
                        setModelLoadError(null);
                        setLoadingId(example.id);
                        try {
                          // Use embedded code if present (fastest), otherwise fetch
                          const code = example.code ?? await loadModelCode(example.id);
                          console.log('[ExampleGalleryModal] Load Model clicked:', {
                            id: example.id,
                            name: example.name,
                            codeLength: code.length,
                            codePreview: code.substring(0, 200)
                          });
                          onSelect(code, toTitleCase(example.name), example.id);
                        } catch (err) {
                          console.error('[ExampleGalleryModal] Failed to load model:', example.id, err);
                          const detail = err instanceof Error ? err.message : String(err);
                          setModelLoadError(`Failed to load ${toTitleCase(example.name)}. ${detail}`);
                        } finally {
                          setLoadingId(null);
                        }
                      }}
                      disabled={loadingId === example.id}
                      className="mt-3 w-full text-center px-4 py-2 text-sm font-semibold bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors text-slate-800 dark:text-slate-100 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {loadingId === example.id ? 'Loading...' : 'Load Model'}
                    </button>
                  </Card>
                )) : (
                  <p className="text-slate-500 dark:text-slate-400 col-span-full text-center">No models match your search.</p>
                )}
              </div>
            </TabPanel>

            <TabPanel className="py-4 px-1">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-2">BioModels Repository</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                  Search and import public models directly from the BioModels repository (SBML format).
                </p>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/40 rounded-md border border-slate-100 dark:border-slate-700">
                  <BioModelsSearch onImportById={async (id) => {
                    if (bioModelsLoadingId) return;

                    setBioModelsImportError(null);
                    setBioModelsLoadingId(id);
                    try {
                      const { normalizedId, sbmlText } = await fetchBioModelsSbml(id);
                      const file = new File([sbmlText], `${normalizedId}.xml`, { type: 'application/xml' });
                      if (onImportSBML) {
                        await onImportSBML(file);
                      } else {
                        onSelect(sbmlText, normalizedId, normalizedId);
                      }
                      onClose();
                    } catch (e) {
                      console.warn('BioModels quick import failed', e);
                      setBioModelsImportError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBioModelsLoadingId(null);
                    }
                  }} />
                  {bioModelsLoadingId && (
                    <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                      Importing {bioModelsLoadingId}...
                    </div>
                  )}
                  {bioModelsImportError && (
                    <div className="mt-3 text-sm text-red-600">
                      {bioModelsImportError}
                    </div>
                  )}
                </div>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </Modal>
  );
};
