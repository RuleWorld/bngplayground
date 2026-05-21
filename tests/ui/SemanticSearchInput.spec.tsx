/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SemanticSearchInput } from '@/components/SemanticSearchInput';
import { semanticSearch } from '@/services/semanticSearch';

// Mock the semanticSearch service
vi.mock('@/services/semanticSearch', () => ({
  semanticSearch: vi.fn(),
  preloadEmbeddingModel: vi.fn()
}));

describe('SemanticSearchInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the component with placeholder', () => {
    render(
      <SemanticSearchInput
        onResults={vi.fn()}
        onSearchStart={vi.fn()}
        onSearchEnd={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText(/Describe a model/i)).toBeInTheDocument();
  });

  it('triggers search after user types and debounce period elapses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mockOnResults = vi.fn();
    const mockOnSearchStart = vi.fn();
    const mockOnSearchEnd = vi.fn();

    // Mock the semanticSearch response
    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: '1', score: 0.9, text: 'Test Result' }]);

    render(
      <SemanticSearchInput
        onResults={mockOnResults}
        onSearchStart={mockOnSearchStart}
        onSearchEnd={mockOnSearchEnd}
      />
    );

    const input = screen.getByPlaceholderText(/Describe a model/i);
    fireEvent.change(input, { target: { value: 'test query' } });

    // Should not have called search immediately
    expect(semanticSearch).not.toHaveBeenCalled();

    // Fast-forward debounce timer (300ms)
    vi.advanceTimersByTime(300);

    // Wait for the async search to resolve
    await waitFor(() => {
      expect(mockOnSearchStart).toHaveBeenCalled();
      expect(semanticSearch).toHaveBeenCalledWith('test query', 20);
      expect(mockOnResults).toHaveBeenCalledWith([{ id: '1', score: 0.9, text: 'Test Result' }]);
      expect(mockOnSearchEnd).toHaveBeenCalled();
    });
  });

  it('handles search error correctly', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mockOnResults = vi.fn();
    const mockOnSearchStart = vi.fn();
    const mockOnSearchEnd = vi.fn();

    // Mock semanticSearch to throw an error
    (semanticSearch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Search failed'));

    render(
      <SemanticSearchInput
        onResults={mockOnResults}
        onSearchStart={mockOnSearchStart}
        onSearchEnd={mockOnSearchEnd}
      />
    );

    const input = screen.getByPlaceholderText(/Describe a model/i);
    fireEvent.change(input, { target: { value: 'error query' } });

    // Fast-forward debounce timer
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(mockOnSearchStart).toHaveBeenCalled();
      expect(semanticSearch).toHaveBeenCalledWith('error query', 20);
      // It should display error message
      expect(screen.getByText('Search unavailable. Try a keyword search instead.')).toBeInTheDocument();
      // It should clear results on error
      expect(mockOnResults).toHaveBeenCalledWith([]);
      expect(mockOnSearchEnd).toHaveBeenCalled();
    });
  });

  it('triggers search immediately on Enter key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mockOnResults = vi.fn();
    const mockOnSearchStart = vi.fn();
    const mockOnSearchEnd = vi.fn();

    (semanticSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(
      <SemanticSearchInput
        onResults={mockOnResults}
        onSearchStart={mockOnSearchStart}
        onSearchEnd={mockOnSearchEnd}
      />
    );

    const input = screen.getByPlaceholderText(/Describe a model/i);
    fireEvent.change(input, { target: { value: 'enter query' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockOnSearchStart).toHaveBeenCalled();
      expect(semanticSearch).toHaveBeenCalledWith('enter query', 20);
    });
  });

  it('clears input and results when clear button is clicked', async () => {
    const mockOnResults = vi.fn();

    render(
      <SemanticSearchInput
        onResults={mockOnResults}
        onSearchStart={vi.fn()}
        onSearchEnd={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Describe a model/i);
    fireEvent.change(input, { target: { value: 'clear query' } });

    // The clear button appears when there is a query
    const clearButton = screen.getByTitle('Clear search');
    fireEvent.click(clearButton);

    expect(input).toHaveValue('');
    expect(mockOnResults).toHaveBeenCalledWith([]);
  });
});
