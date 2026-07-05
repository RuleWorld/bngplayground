import { describe, it, expect } from 'vitest';
import { MassBalance } from '../../src/services/analysis/MassBalance';
import { BNGLModel, ReactionRule, BNGLReaction } from '../../src/types';

describe('MassBalance', () => {
    it('should report no issues for a perfectly balanced reaction rule', () => {
        const model = {
            reactionRules: [
                {
                    name: 'BalancedRule',
                    reactants: ['A(b)', 'B(a)'],
                    products: ['A(b!1).B(a!1)'],
                    rate: 'k1',
                    isBidirectional: false
                } as ReactionRule
            ],
            species: [], parameters: {}, observables: [], moleculeTypes: [], functions: [],
            compartments: [], reactions: []
        } as unknown as BNGLModel;
        const issues = MassBalance.checkMassBalance(model);
        expect(issues).toHaveLength(0);
    });

    it('should detect mass imbalance in a reaction rule', () => {
        const model = {
            reactionRules: [
                {
                    name: 'ImbalancedRule',
                    reactants: ['A()'],
                    products: ['A()', 'B()'],
                    rate: 'k1',
                    isBidirectional: false
                } as ReactionRule
            ],
            species: [], parameters: {}, observables: [], moleculeTypes: [], functions: [],
             compartments: [], reactions: []
        } as unknown as BNGLModel;
        const issues = MassBalance.checkMassBalance(model);
        expect(issues).toHaveLength(1);
        expect(issues[0].ruleName).toBe('ImbalancedRule');
        expect(issues[0].issue).toContain('B: 0 -> 1 (+1)');
    });

    it('should check expanded reactions if they exist', () => {
        const model = {
            reactions: [
                {
                    name: 'ImbalancedReaction',
                    reactants: ['A()'],
                    products: ['C()'],
                    rate: 'k',
                    rateConstant: 1.0
                } as BNGLReaction
            ],
            reactionRules: [],
            species: [], parameters: {}, observables: [], moleculeTypes: [], functions: [],
            compartments: []
        } as unknown as BNGLModel;
        const issues = MassBalance.checkMassBalance(model);
        expect(issues).toHaveLength(1);
        expect(issues[0].ruleName).toBe('ImbalancedReaction');
        expect(issues[0].issue).toContain('Molecule imbalance in expanded reaction');
        expect(issues[0].issue).toContain('A: 1 -> 0 (-1)');
        expect(issues[0].issue).toContain('C: 0 -> 1 (+1)');
    });

    it('should ignore unparseable or zero patterns gracefully', () => {
         const model = {
            reactionRules: [
                {
                    name: 'ZeroRule',
                    reactants: ['0'],
                    products: ['A()'],
                    rate: 'k1',
                    isBidirectional: false
                } as ReactionRule,
                {
                    name: 'UnparseableRule',
                    reactants: ['A()'],
                    products: ['+++'], // unparseable string
                    rate: 'k1',
                    isBidirectional: false
                } as ReactionRule
            ],
            species: [], parameters: {}, observables: [], moleculeTypes: [], functions: [],
            compartments: [], reactions: []
        } as unknown as BNGLModel;
        const issues = MassBalance.checkMassBalance(model);
        // ZeroRule: A is created
        expect(issues.some(i => i.ruleName === 'ZeroRule' && i.issue.includes('A: 0 -> 1 (+1)'))).toBe(true);
        // UnparseableRule: A is destroyed, +++ is ignored
        expect(issues.some(i => i.ruleName === 'UnparseableRule' && i.issue.includes('A: 1 -> 0 (-1)'))).toBe(true);
    });
});
