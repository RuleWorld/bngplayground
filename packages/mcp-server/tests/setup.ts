import { vi } from 'vitest';

vi.mock('../src/services/pathwayCommons/pathwayCommonsService.js', () => ({
  queryPathwayCommons: vi.fn(async () => ({
    interactions: [],
    missingInteractions: [],
    confirmedInteractions: [],
    pathways: [],
    unknownMolecules: [],
    summary: 'Pathway Commons queries mocked for tests.',
  })),
}));
