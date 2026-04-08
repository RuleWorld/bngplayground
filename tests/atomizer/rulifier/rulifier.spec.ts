import { describe, it, expect } from 'vitest';
import { groupByReactionCenter } from '../../../src/lib/atomizer/rulifier/rulifier';
import { Rule, Action, Species, Molecule } from '../../../src/lib/atomizer/core/structures';

describe('groupByReactionCenter', () => {
  it('should return an empty map when given an empty array', () => {
    const result = groupByReactionCenter([]);
    expect(result.size).toBe(0);
  });

  it('should group a single rule', () => {
    const rule1 = new Rule('rule1');
    const action1 = new Action();
    action1.setAction('StateChange', 'siteA', 'siteB');
    rule1.addActionList([action1]);

    const species = new Species();
    species.addMolecule(new Molecule('MolA'));
    rule1.addReactant(species);

    const result = groupByReactionCenter([rule1]);

    expect(result.size).toBe(1);
    const keys = Array.from(result.keys());
    expect(result.get(keys[0])).toEqual([rule1]);
  });

  it('should group rules with the same reaction center', () => {
    const rule1 = new Rule('rule1');
    const action1 = new Action();
    action1.setAction('StateChange', 'siteA');
    rule1.addActionList([action1]);
    const sp1 = new Species();
    sp1.addMolecule(new Molecule('MolA'));
    rule1.addReactant(sp1);

    const rule2 = new Rule('rule2');
    const action2 = new Action();
    action2.setAction('StateChange', 'siteA');
    rule2.addActionList([action2]);
    // Same molecule 'MolA'
    const sp2 = new Species();
    sp2.addMolecule(new Molecule('MolA'));
    rule2.addReactant(sp2);

    const result = groupByReactionCenter([rule1, rule2]);

    expect(result.size).toBe(1);
    const keys = Array.from(result.keys());
    expect(result.get(keys[0])).toEqual([rule1, rule2]);
  });

  it('should separate rules with different reaction centers (different actions)', () => {
    const rule1 = new Rule('rule1');
    const action1 = new Action();
    action1.setAction('AddBond', 'siteA', 'siteB');
    rule1.addActionList([action1]);
    const sp1 = new Species();
    sp1.addMolecule(new Molecule('MolA'));
    rule1.addReactant(sp1);

    const rule2 = new Rule('rule2');
    const action2 = new Action();
    action2.setAction('DeleteBond', 'siteA', 'siteB');
    rule2.addActionList([action2]);
    const sp2 = new Species();
    sp2.addMolecule(new Molecule('MolA'));
    rule2.addReactant(sp2);

    const result = groupByReactionCenter([rule1, rule2]);

    expect(result.size).toBe(2);
  });

  it('should separate rules with different reaction centers (different molecules)', () => {
    const rule1 = new Rule('rule1');
    const action1 = new Action();
    action1.setAction('StateChange', 'siteA');
    rule1.addActionList([action1]);
    const sp1 = new Species();
    sp1.addMolecule(new Molecule('MolA'));
    rule1.addReactant(sp1);

    const rule2 = new Rule('rule2');
    const action2 = new Action();
    action2.setAction('StateChange', 'siteA'); // Same action
    rule2.addActionList([action2]);
    const sp2 = new Species();
    sp2.addMolecule(new Molecule('MolB')); // Different molecule
    rule2.addReactant(sp2);

    const result = groupByReactionCenter([rule1, rule2]);

    expect(result.size).toBe(2);
  });

  it('should extract correct molecules from both reactants and products', () => {
    const rule1 = new Rule('rule1');
    const action1 = new Action();
    action1.setAction('StateChange', 'siteA');
    rule1.addActionList([action1]);

    const reactantSp = new Species();
    reactantSp.addMolecule(new Molecule('ReactantMol'));
    rule1.addReactant(reactantSp);

    const productSp = new Species();
    productSp.addMolecule(new Molecule('ProductMol'));
    rule1.addProduct(productSp);

    const result = groupByReactionCenter([rule1]);

    expect(result.size).toBe(1);
    const keys = Array.from(result.keys());
    const parsedCenter = JSON.parse(keys[0]);

    expect(parsedCenter.action).toBe('StateChange');
    expect(parsedCenter.site1).toBe('siteA');
    // molecules should include both ReactantMol and ProductMol
    expect(parsedCenter.molecules).toContain('ReactantMol');
    expect(parsedCenter.molecules).toContain('ProductMol');
  });
});
