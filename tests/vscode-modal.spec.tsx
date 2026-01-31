import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Header } from '../components/Header';

describe('Header', () => {
  it('VS Code header button is removed', async () => {
    const props = {
      onAboutClick: () => {},
      viewMode: 'code' as const,
      onViewModeChange: () => {},
      code: 'begin model\n  A() -> B() 1.0\nend model',
      modelName: 'testModel',
      modelId: null,
    };

    const headerSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'components', 'Header.tsx'), 'utf8');
    expect(headerSource.includes('Open model in VS Code')).toBe(false);
  });
});