import { describe, it, expect } from 'vitest';
import { buildStateTransitionDiagram } from '../../../../src/lib/atomizer/rulifier/rulifier';
import { Rule, Species, Molecule, Component, Action } from '../../../../src/lib/atomizer/core/structures';

describe('buildStateTransitionDiagram', () => {
  // Helper to create a fully-formed Species with a single Molecule and Component
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

    // Setup Reactant: A(b~U)
    const reactant = createSpecies('A', 'b', 'b_site', 'U');
    rule.addReactant(reactant);

    // Setup Product: A(b~P)
    const product = createSpecies('A', 'b', 'b_site', 'P');
    rule.addProduct(product);

    // Setup Action
    const action = new Action();
    action.setAction('StateChange', 'b_site');
    rule.addActionList([action]);

    // Add rate
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
      rule: rule
    });

    expect(result.initialState).toBe('U');
  });

  it('ignores rules where action is not StateChange', () => {
    const rule = new Rule('test_rule');

    const reactant = createSpecies('A', 'b', 'b_site', 'U');
    rule.addReactant(reactant);

    const product = createSpecies('A', 'b', 'b_site', 'P');
    rule.addProduct(product);

    const action = new Action();
    action.setAction('AddBond', 'b_site'); // Not StateChange
    rule.addActionList([action]);

    const result = buildStateTransitionDiagram([rule], 'A', 'b');

    expect(result.states.size).toBe(0);
    expect(result.transitions.length).toBe(0);
  });

  it('ignores rules targeting a different molecule or component', () => {
    const rule = new Rule('test_rule');

    const reactant = createSpecies('B', 'b', 'b_site', 'U');
    rule.addReactant(reactant);

    const product = createSpecies('B', 'b', 'b_site', 'P');
    rule.addProduct(product);

    const action = new Action();
    action.setAction('StateChange', 'b_site');
    rule.addActionList([action]);

    const result = buildStateTransitionDiagram([rule], 'A', 'b'); // Looking for 'A' instead of 'B'

    expect(result.states.size).toBe(0);
    expect(result.transitions.length).toBe(0);
  });

  it('ignores rules where reactant and product states are the same', () => {
    const rule = new Rule('test_rule');

    const reactant = createSpecies('A', 'b', 'b_site', 'U');
    rule.addReactant(reactant);

    const product = createSpecies('A', 'b', 'b_site', 'U'); // Same state
    rule.addProduct(product);

    const action = new Action();
    action.setAction('StateChange', 'b_site');
    rule.addActionList([action]);

    const result = buildStateTransitionDiagram([rule], 'A', 'b');

    expect(result.states.size).toBe(0);
    expect(result.transitions.length).toBe(0);
  });

  it('handles multiple rules and determines initial state (prioritizing 0)', () => {
    // Rule 1: A(b~0) -> A(b~1)
    const rule1 = new Rule('rule1');
    rule1.addReactant(createSpecies('A', 'b', 'b_site1', '0'));
    rule1.addProduct(createSpecies('A', 'b', 'b_site1', '1'));
    const action1 = new Action();
    action1.setAction('StateChange', 'b_site1');
    rule1.addActionList([action1]);

    // Rule 2: A(b~1) -> A(b~2)
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
    expect(result.initialState).toBe('0'); // prioritizes '0'
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
    expect(result.initialState).toBe('U'); // Prioritizes 'U' because '0' is missing
  });

  it('uses default rate of 1 if rule has no rates', () => {
    const rule = new Rule('test_rule');
    const reactant = createSpecies('A', 'b', 'b_site', 'U');
    rule.addReactant(reactant);

    const product = createSpecies('A', 'b', 'b_site', 'P');
    rule.addProduct(product);

    const action = new Action();
    action.setAction('StateChange', 'b_site');
    rule.addActionList([action]);

    // No rule.addRate(...)

    const result = buildStateTransitionDiagram([rule], 'A', 'b');

    expect(result.transitions.length).toBe(1);
    expect(result.transitions[0].rate).toBe('1');
  });
});
