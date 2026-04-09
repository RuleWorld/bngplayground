import { describe, it, expect } from 'vitest';
import { buildStateTransitionDiagram, findRedundantRules } from '../../../../src/lib/atomizer/rulifier/rulifier';
import { Rule, Species, Molecule, Component, Action } from '../../../../src/lib/atomizer/core/structures';

describe('buildStateTransitionDiagram', () => {
  const createSpecies = (molName: string, compName: string, compIdx: string, state: string): Species => {
    const species = new Species();
    const molecule = new Molecule(molName);
    const component = new Component(compName, compIdx);
    if (state) {
      component.activeState = state;
      component.states.push(state);
    }
    molecule.addComponent(component);
    species.addMolecule(molecule);
    return species;
  };

  it('builds a diagram for a valid StateChange action', () => {
    const rule = new Rule('test_rule');
    const reactant = createSpecies('A', 'b', 'b_site', 'U');
    const product = createSpecies('A', 'b', 'b_site', 'P');
    const action = new Action();
    action.setAction('StateChange', 'b_site');
    rule.addReactant(reactant);
    rule.addProduct(product);
    rule.addActionList([action]);
    rule.addRate('k1');

    const result = buildStateTransitionDiagram([rule], 'A', 'b');

    expect(result.states.size).toBe(2);
    expect(result.states.has('U')).toBe(true);
    expect(result.states.has('P')).toBe(true);
    expect(result.transitions.length).toBe(1);
    expect(result.transitions[0]).toEqual({
      from: 'U',
      to: 'P',
      molecule: 'A',
      component: 'b',
      rate: 'k1',
      rule,
    });
    expect(result.initialState).toBe('U');
  });

  it('ignores rules where action is not StateChange', () => {
    const rule = new Rule('test_rule');
    rule.addReactant(createSpecies('A', 'b', 'b_site', 'U'));
    rule.addProduct(createSpecies('A', 'b', 'b_site', 'P'));
    const action = new Action();
    action.setAction('AddBond', 'b_site');
    rule.addActionList([action]);

    const result = buildStateTransitionDiagram([rule], 'A', 'b');
    expect(result.states.size).toBe(0);
    expect(result.transitions.length).toBe(0);
  });

  it('ignores rules targeting a different molecule or component', () => {
    const rule = new Rule('test_rule');
    rule.addReactant(createSpecies('B', 'b', 'b_site', 'U'));
    rule.addProduct(createSpecies('B', 'b', 'b_site', 'P'));
    const action = new Action();
    action.setAction('StateChange', 'b_site');
    rule.addActionList([action]);

    const result = buildStateTransitionDiagram([rule], 'A', 'b');
    expect(result.states.size).toBe(0);
    expect(result.transitions.length).toBe(0);
  });

  it('ignores rules where reactant and product states are the same', () => {
    const rule = new Rule('test_rule');
    rule.addReactant(createSpecies('A', 'b', 'b_site', 'U'));
    rule.addProduct(createSpecies('A', 'b', 'b_site', 'U'));
    const action = new Action();
    action.setAction('StateChange', 'b_site');
    rule.addActionList([action]);

    const result = buildStateTransitionDiagram([rule], 'A', 'b');
    expect(result.states.size).toBe(0);
    expect(result.transitions.length).toBe(0);
  });

  it('handles multiple rules and determines initial state (prioritizing 0)', () => {
    const rule1 = new Rule('rule1');
    rule1.addReactant(createSpecies('A', 'b', 'b_site1', '0'));
    rule1.addProduct(createSpecies('A', 'b', 'b_site1', '1'));
    const action1 = new Action();
    action1.setAction('StateChange', 'b_site1');
    rule1.addActionList([action1]);

    const rule2 = new Rule('rule2');
    rule2.addReactant(createSpecies('A', 'b', 'b_site2', '1'));
    rule2.addProduct(createSpecies('A', 'b', 'b_site2', '2'));
    const action2 = new Action();
    action2.setAction('StateChange', 'b_site2');
    rule2.addActionList([action2]);

    const result = buildStateTransitionDiagram([rule1, rule2], 'A', 'b');
    expect(result.states.size).toBe(3);
    expect(result.states.has('0')).toBe(true);
    expect(result.states.has('1')).toBe(true);
    expect(result.states.has('2')).toBe(true);
    expect(result.transitions.length).toBe(2);
    expect(result.initialState).toBe('0');
  });

  it('handles multiple rules and determines initial state (prioritizing U over other states)', () => {
    const rule = new Rule('rule1');
    rule.addReactant(createSpecies('A', 'b', 'b_site', 'U'));
    rule.addProduct(createSpecies('A', 'b', 'b_site', 'P'));
    const action = new Action();
    action.setAction('StateChange', 'b_site');
    rule.addActionList([action]);

    const result = buildStateTransitionDiagram([rule], 'A', 'b');
    expect(result.states.size).toBe(2);
    expect(result.initialState).toBe('U');
  });

  it('uses default rate of 1 if rule has no rates', () => {
    const rule = new Rule('test_rule');
    rule.addReactant(createSpecies('A', 'b', 'b_site', 'U'));
    rule.addProduct(createSpecies('A', 'b', 'b_site', 'P'));
    const action = new Action();
    action.setAction('StateChange', 'b_site');
    rule.addActionList([action]);

    const result = buildStateTransitionDiagram([rule], 'A', 'b');
    expect(result.transitions.length).toBe(1);
    expect(result.transitions[0].rate).toBe('1');
  });
});

describe('findRedundantRules', () => {
  it('should return empty map for empty rule list', () => {
    const redundant = findRedundantRules([]);
    expect(redundant.size).toBe(0);
  });

  it('should return empty map for non-redundant rules with different reaction centers', () => {
    const rule1 = new Rule('rule1');
    const action1 = new Action();
    action1.setAction('StateChange', 'comp1_1', '');
    rule1.actions.push(action1);

    const s1 = new Species();
    const m1 = new Molecule('M1');
    const c1 = new Component('comp1', 'comp1_1');
    m1.components.push(c1);
    s1.molecules.push(m1);
    rule1.reactants.push(s1);

    const s1p = new Species();
    const m1p = new Molecule('M1');
    const c1p = new Component('comp1', 'comp1_1');
    c1p.activeState = 'P';
    m1p.components.push(c1p);
    s1p.molecules.push(m1p);
    rule1.products.push(s1p);

    const rule2 = new Rule('rule2');
    const action2 = new Action();
    action2.setAction('StateChange', 'comp2_1', '');
    rule2.actions.push(action2);

    const s2 = new Species();
    const m2 = new Molecule('M2');
    const c2 = new Component('comp2', 'comp2_1');
    m2.components.push(c2);
    s2.molecules.push(m2);
    rule2.reactants.push(s2);

    const s2p = new Species();
    const m2p = new Molecule('M2');
    const c2p = new Component('comp2', 'comp2_1');
    c2p.activeState = 'P';
    m2p.components.push(c2p);
    s2p.molecules.push(m2p);
    rule2.products.push(s2p);

    const redundant = findRedundantRules([rule1, rule2]);
    expect(redundant.size).toBe(0);
  });

  it('should return empty map for non-redundant rules with same center but different context', () => {
    const rule1 = new Rule('rule1');
    const action1 = new Action();
    action1.setAction('StateChange', 'comp1_1', '');
    rule1.actions.push(action1);

    const s1_1 = new Species();
    const m1_1 = new Molecule('M1');
    const c1_1 = new Component('comp1', 'comp1_1');
    c1_1.activeState = 'U';
    m1_1.components.push(c1_1);
    s1_1.molecules.push(m1_1);
    rule1.reactants.push(s1_1);

    const s1_2 = new Species();
    const m1Ctx = new Molecule('Ctx');
    const c1Ctx = new Component('ctx_comp', 'ctx_1');
    c1Ctx.activeState = 'StateA';
    m1Ctx.components.push(c1Ctx);
    s1_2.molecules.push(m1Ctx);
    rule1.reactants.push(s1_2);

    const s1p_1 = new Species();
    const m1p_1 = new Molecule('M1');
    const c1p_1 = new Component('comp1', 'comp1_1');
    c1p_1.activeState = 'P';
    m1p_1.components.push(c1p_1);
    s1p_1.molecules.push(m1p_1);
    rule1.products.push(s1p_1);

    const s1p_2 = new Species();
    const m1pCtx = new Molecule('Ctx');
    const c1pCtx = new Component('ctx_comp', 'ctx_1');
    c1pCtx.activeState = 'StateA';
    m1pCtx.components.push(c1pCtx);
    s1p_2.molecules.push(m1pCtx);
    rule1.products.push(s1p_2);

    const rule2 = new Rule('rule2');
    const action2 = new Action();
    action2.setAction('StateChange', 'comp1_1', '');
    rule2.actions.push(action2);

    const s2_1 = new Species();
    const m2_1 = new Molecule('M1');
    const c2_1 = new Component('comp1', 'comp1_1');
    c2_1.activeState = 'U';
    m2_1.components.push(c2_1);
    s2_1.molecules.push(m2_1);
    rule2.reactants.push(s2_1);

    const s2_2 = new Species();
    const m2Ctx = new Molecule('Ctx');
    const c2Ctx = new Component('ctx_comp', 'ctx_2');
    c2Ctx.activeState = 'StateB';
    m2Ctx.components.push(c2Ctx);
    s2_2.molecules.push(m2Ctx);
    rule2.reactants.push(s2_2);

    const s2p_1 = new Species();
    const m2p_1 = new Molecule('M1');
    const c2p_1 = new Component('comp1', 'comp1_1');
    c2p_1.activeState = 'P';
    m2p_1.components.push(c2p_1);
    s2p_1.molecules.push(m2p_1);
    rule2.products.push(s2p_1);

    const s2p_2 = new Species();
    const m2pCtx = new Molecule('Ctx');
    const c2pCtx = new Component('ctx_comp', 'ctx_2');
    c2pCtx.activeState = 'StateB';
    m2pCtx.components.push(c2pCtx);
    s2p_2.molecules.push(m2pCtx);
    rule2.products.push(s2p_2);

    const redundant = findRedundantRules([rule1, rule2]);
    expect(redundant.size).toBe(0);
  });

  it('should identify redundant rules with same center and same context', () => {
    const rule1 = new Rule('rule1');
    const action1 = new Action();
    action1.setAction('StateChange', 'comp1_1', '');
    rule1.actions.push(action1);

    const s1_1 = new Species();
    const m1_1 = new Molecule('M1');
    const c1_1 = new Component('comp1', 'comp1_1');
    c1_1.activeState = 'U';
    m1_1.components.push(c1_1);
    s1_1.molecules.push(m1_1);
    rule1.reactants.push(s1_1);

    const s1_2 = new Species();
    const m1Ctx = new Molecule('Ctx');
    s1_2.molecules.push(m1Ctx);
    rule1.reactants.push(s1_2);

    const s1p_1 = new Species();
    const m1p_1 = new Molecule('M1');
    const c1p_1 = new Component('comp1', 'comp1_1');
    c1p_1.activeState = 'P';
    m1p_1.components.push(c1p_1);
    s1p_1.molecules.push(m1p_1);
    rule1.products.push(s1p_1);

    const s1p_2 = new Species();
    const m1pCtx = new Molecule('Ctx');
    s1p_2.molecules.push(m1pCtx);
    rule1.products.push(s1p_2);

    const rule2 = new Rule('rule2');
    const action2 = new Action();
    action2.setAction('StateChange', 'comp1_1', '');
    rule2.actions.push(action2);

    const s2_1 = new Species();
    const m2_1 = new Molecule('M1');
    const c2_1 = new Component('comp1', 'comp1_1');
    c2_1.activeState = 'U';
    m2_1.components.push(c2_1);
    s2_1.molecules.push(m2_1);
    rule2.reactants.push(s2_1);

    const s2_2 = new Species();
    const m2Ctx = new Molecule('Ctx');
    s2_2.molecules.push(m2Ctx);
    rule2.reactants.push(s2_2);

    const s2p_1 = new Species();
    const m2p_1 = new Molecule('M1');
    const c2p_1 = new Component('comp1', 'comp1_1');
    c2p_1.activeState = 'P';
    m2p_1.components.push(c2p_1);
    s2p_1.molecules.push(m2p_1);
    rule2.products.push(s2p_1);

    const s2p_2 = new Species();
    const m2pCtx = new Molecule('Ctx');
    s2p_2.molecules.push(m2pCtx);
    rule2.products.push(s2p_2);

    const redundant = findRedundantRules([rule1, rule2]);
    expect(redundant.size).toBe(1);

    const redundantGroup = Array.from(redundant.values())[0];
    expect(redundantGroup.length).toBe(2);
    expect(redundantGroup[0]).toBe(rule1);
    expect(redundantGroup[1]).toBe(rule2);
  });
});
