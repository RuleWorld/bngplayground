import React from 'react';
import React from 'react';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

// Mock ExampleGalleryModal and SemanticSearchInput to avoid pulling in heavy services during unit tests
vi.mock('../../components/ExampleGalleryModal', () => ({
  ExampleGalleryModal: (props: any) => {
    return React.createElement('div', { 'data-testid': 'example-gallery' });
  }
}));
vi.mock('../../components/SemanticSearchInput', () => ({
  SemanticSearchInput: (props: any) => {
    return React.createElement('div', { 'data-testid': 'semantic-search' });
  }
}));


import { EditorPanel } from '../../components/EditorPanel';

const baseProps = {
  code: 'begin model\nend model',
  onCodeChange: vi.fn(),
  onParse: vi.fn(),
  onSimulate: vi.fn(),
  isSimulating: false,
  modelExists: true,
  model: null,
  validationWarnings: [],
  editorMarkers: [],
  loadedModelName: null,
  onModelNameChange: vi.fn(),
  onModelIdChange: vi.fn(),
};

describe('EditorPanel', () => {
  it('calls onExportSBML when Export SBML button clicked', () => {
    const onExportSBML = vi.fn();
    render(<EditorPanel {...baseProps} onExportSBML={onExportSBML} /> as any);

    const exportBtn = screen.getByRole('button', { name: /Export SBML/i });
    expect(exportBtn).toBeInTheDocument();
    fireEvent.click(exportBtn);
    expect(onExportSBML).toHaveBeenCalled();
  });

  it('shows Load dropdown options', () => {
    render(<EditorPanel {...baseProps} /> as any);
    const loadBtn = screen.getAllByText(/Load/)[0];
    expect(loadBtn).toBeInTheDocument();
  });
});
