import React, { useState, useMemo } from 'react';
import { Modal } from './ui/Modal';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { SearchIcon } from './icons/SearchIcon';
import { MODEL_CATEGORIES } from '../constants';
import { SemanticSearchInput, SearchResult } from './SemanticSearchInput';

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
  onSelect: (code: string, modelName?: string) => void;
}

export const ExampleGalleryModal: React.FC<ExampleGalleryModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(MODEL_CATEGORIES[0]?.id || '');
  const [focusedExample, setFocusedExample] = useState<string | null>(null);
  const [semanticResults, setSemanticResults] = useState<SearchResult[] | null>(null);
  const [isSemanticSearching, setIsSemanticSearching] = useState(false);

  const currentCategory = useMemo(() => {
    return MODEL_CATEGORIES.find(cat => cat.id === selectedCategory) || MODEL_CATEGORIES[0];
  }, [selectedCategory]);

  // Get all models flat for semantic search mapping
  const allModels = useMemo(() => MODEL_CATEGORIES.flatMap(cat => cat.models), []);

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
      return;
    }
    setSearchTerm('');
    setSemanticResults(null);
    setSelectedCategory(MODEL_CATEGORIES[0]?.id || '');
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="BNGL Models" size="3xl">
      <div className="mt-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Browse {MODEL_CATEGORIES.reduce((sum, cat) => sum + cat.models.length, 0)} models.
        </p>

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
            {MODEL_CATEGORIES.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${selectedCategory === category.id
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
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

        {/* Model Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto pr-2">
          {filteredExamples.length > 0 ? filteredExamples.map(example => (
            <Card key={example.id} className="flex flex-col">
              <div className="flex items-center justify-between">
                {focusedExample === example.id ? (
                  <div className="text-xs text-primary">Focused</div>
                ) : (
                  <div className="text-xs text-slate-500">&nbsp;</div>
                )}
              </div>
              <div className="flex-grow">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">{toTitleCase(example.name)}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{example.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {example.tags?.slice(0, 2).map(tag => (
                    <span key={tag} className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/50 text-primary-800 dark:text-primary-300 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => onSelect(example.code, toTitleCase(example.name))}
                className="mt-3 w-full text-center px-4 py-2 text-sm font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors text-slate-800 dark:text-slate-100"
              >
                Load Model
              </button>
            </Card>
          )) : (
            <p className="text-slate-500 dark:text-slate-400 col-span-full text-center">No models match your search.</p>
          )}
        </div>
      </div>
    </Modal>
  );
};
