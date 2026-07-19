import { describe, it, expect } from 'vitest';

describe('Header', () => {
  it('VS Code header button is removed', async () => {
    const headerSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'components', 'Header.tsx'), 'utf8');
    expect(headerSource.includes('Open model in VS Code')).toBe(false);
  });
});