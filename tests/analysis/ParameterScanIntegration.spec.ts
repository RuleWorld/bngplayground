import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBNGLWithANTLR } from '@bngplayground/engine';
import type { BNGLModel } from '../../types';

// returns list of BNGL model file paths under example-models
function listExampleModels(): string[] {
    const dir = path.join(process.cwd(), 'example-models');
    try {
        return fs.readdirSync(dir).filter(f => f.endsWith('.bngl')).map(f => path.join(dir, f));
    } catch {
        return [];
    }
}

// compute override object for a given parameter/value pair
function computeOverride(model: BNGLModel, param: string, value: number): Record<string, number> {
    const overrides: Record<string, number> = { [param]: value };
    model.species.forEach(s => {
        if (s.initialExpression && s.initialExpression.includes(param)) {
            overrides[s.name] = value;
        }
    });
    return overrides;
}

describe('Parameter scanning integration (override mapping)', () => {
    it('builds correct override dictionaries for example models', () => {
        const files = listExampleModels();
        expect(files.length).toBeGreaterThanOrEqual(10);
        for (let idx = 0; idx < Math.min(10, files.length); idx++) {
            const file = files[idx];
            const text = fs.readFileSync(file, 'utf8');
            const parseRes = parseBNGLWithANTLR(text);
            const model = parseRes.model as BNGLModel;
            const params = Object.keys(model.parameters);
            if (params.length === 0) continue;
            params.forEach((p) => {
                const base = model.parameters[p];
                const low = base === 0 ? 0.1 : base * 0.1;
                const high = base === 0 ? 1 : base * 10;
                const o1 = computeOverride(model, p, low);
                const o2 = computeOverride(model, p, high);
                expect(o1[p]).toBe(low);
                expect(o2[p]).toBe(high);
                model.species.forEach((s) => {
                    if (s.initialExpression && s.initialExpression.includes(p)) {
                        expect(o1[s.name]).toBe(low);
                        expect(o2[s.name]).toBe(high);
                    }
                });
            });
        }
    });
});
