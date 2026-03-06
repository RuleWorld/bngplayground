import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseBNGLWithANTLR } from '@bngplayground/engine';
import { buildContactMap } from '../../services/visualization/contactMapBuilder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Use a tracked fixture so CI does not depend on locally generated PAC files.
const MODEL_PATH = resolve(__dirname, '..', '..', 'example-models', 'il6-jak-stat-pathway.bngl');

describe('Contact map reproduction', () => {
    it('should not produce edges with full-complex names', () => {
        const text = fs.readFileSync(MODEL_PATH, 'utf8');
        const res = parseBNGLWithANTLR(text);
        expect(res.success).toBe(true);
        const model = res.model!;
        const contact = buildContactMap(model.reactionRules, model.moleculeTypes);
        console.log('edges', contact.edges);
        console.log('nodes', contact.nodes);
        // verify no edge.from contains a '(' which indicates a full pattern
        contact.edges.forEach(e => {
            expect(e.from).not.toMatch(/\(/);
            expect(e.to).not.toMatch(/\(/);
        });
    });
});
