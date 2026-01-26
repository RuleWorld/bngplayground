import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { Header } from '../components/Header';

test('clicking open-in-vscode button does not throw', async () => {
  const props = {
    onAboutClick: () => {},
    viewMode: 'code' as const,
    onViewModeChange: () => {},
    code: 'begin model\n  A() -> B() 1.0\nend model',
    modelName: 'testModel',
    modelId: null,
  };

  const { getByTitle } = render(
    <Header {...props} />
  );

  const btn = getByTitle('Open model in VS Code');
  fireEvent.click(btn);

  // The click should open the modal. Ensure the modal heading is present
  expect(screen.getByText('Open in VS Code')).toBeInTheDocument();
});