import { describe, expect, it } from 'vitest';
import {
    sanitizeObservableName,
    insertBeforeEndModel,
    hasSimulateAction,
    hasObservablesBlock,
    hasGenerateNetworkAction,
} from '../../src/services/indra/indraModelPrep';

describe('sanitizeObservableName', () => {
    it('keeps valid names, prefixes leading digits, replaces bad chars, falls back to obs', () => {
        expect(sanitizeObservableName('k1')).toBe('k1');
        expect(sanitizeObservableName('2bad')).toBe('obs_2bad');
        expect(sanitizeObservableName('a b!c')).toBe('a_b_c');
        expect(sanitizeObservableName('!!!')).toBe('obs');
    });
});

describe('insertBeforeEndModel', () => {
    it('inserts before an existing end model, else appends', () => {
        expect(insertBeforeEndModel('begin model\nend model', 'X')).toContain('\nX\nend model');
        expect(insertBeforeEndModel('begin model', 'X')).toBe('begin model\nX\n');
    });
});

describe('BNGL action/block detectors', () => {
    it('detect simulate, observables block, and generate_network', () => {
        expect(hasSimulateAction('simulate({method=>"ode"})')).toBe(true);
        expect(hasSimulateAction('simulate_ssa()')).toBe(true);
        expect(hasObservablesBlock('begin observables\nend observables')).toBe(true);
        expect(hasObservablesBlock('begin parameters')).toBe(false);
        expect(hasGenerateNetworkAction('generate_network({overwrite=>1})')).toBe(true);
    });
});
