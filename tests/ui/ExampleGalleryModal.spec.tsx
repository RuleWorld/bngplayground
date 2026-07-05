/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExampleGalleryModal } from '@/components/ExampleGalleryModal';
import { loadModelCatalog } from '@/services/modelCatalog';

// Mock the model catalog
vi.mock('@/services/modelCatalog', () => ({
  loadModelCatalog: vi.fn(),
  getManifestDebugInfo: vi.fn(() => ({ candidates: [] }))
}));

// Mock the semanticSearch service
vi.mock('@/services/semanticSearch', () => ({
  semanticSearch: vi.fn(),
  preloadEmbeddingModel: vi.fn()
}));

// Mock components that are not needed
vi.mock('@/components/SemanticSearchInput', () => {
  return {
    SemanticSearchInput: ({ onResults }: any) => (
      <button
        data-testid="trigger-search"
        onClick={() => onResults([
          { id: 'egfr', filename: 'egfr.bngl', path: 'Published/egfr.bngl', category: 'Metabolism', preview: 'egfr1', score: 0.95 },
          { id: 'egfr', filename: 'egfr2.bngl', path: 'Published/egfr2.bngl', category: 'Metabolism', preview: 'egfr2', score: 0.90 },
          { id: 'egfr_ground', filename: 'egfr_ground.bngl', path: 'Published/egfr_ground.bngl', category: 'Metabolism', preview: 'ground1', score: 0.85 }
        ])}
      >
        Search
      </button>
    )
  };
});

vi.mock('@/components/BioModelsSearch', () => ({
  BioModelsSearch: () => null
}));

describe('ExampleGalleryModal', () => {
  const mockCatalog = {
    examples: [
      { id: 'egfr', name: 'EGFR', description: 'EGFR model description', tags: ['egfr'], category: 'Metabolism', visible: true, bng2Compatible: true },
      { id: 'egfr_ground', name: 'EGFR Ground', description: 'EGFR Ground description', tags: ['egfr'], category: 'Metabolism', visible: true, bng2Compatible: true }
    ],
    categories: [
      {
        id: 'Metabolism',
        name: 'Metabolism',
        description: 'Metabolism models',
        models: [
          { id: 'egfr', name: 'EGFR', description: 'EGFR model description', tags: ['egfr'], category: 'Metabolism', visible: true, bng2Compatible: true },
          { id: 'egfr_ground', name: 'EGFR Ground', description: 'EGFR Ground description', tags: ['egfr'], category: 'Metabolism', visible: true, bng2Compatible: true }
        ]
      }
    ],
    defaultModelId: 'egfr'
  };

  beforeEach(() => {
    (loadModelCatalog as any).mockResolvedValue(mockCatalog);
  });

  it('deduplicates semantic search results by model ID', async () => {
    render(<ExampleGalleryModal isOpen={true} onClose={() => {}} onSelect={() => {}} />);
    
    // Wait for catalog load
    await screen.findByText('EGFR');

    // Trigger semantic search mocking results with duplicates
    const searchButton = screen.getByTestId('trigger-search');
    fireEvent.click(searchButton);

    // After search, we expect only ONE 'EGFR' and ONE 'EGFR Ground' to be rendered
    // If duplicates were present, there would be multiple 'EGFR' text elements
    await waitFor(() => {
      const egfrCards = screen.getAllByRole('heading', { name: /EGFR/i });
      // The search returned 2 results mapping to 'egfr' and 1 mapping to 'egfr_ground'.
      // 'egfr' mapped results would duplicate EGFR model.
      // So without deduplication, getAllByRole(/EGFR/) would find 2 EGFR and 1 EGFR Ground (which matches /EGFR/ since it's "EGFR Ground").
      // With deduplication:
      // - EGFR Ground is 1
      // - EGFR is 1
      // Total 2 headings containing "EGFR"
      expect(egfrCards).toHaveLength(2); 
    });
  });
});
