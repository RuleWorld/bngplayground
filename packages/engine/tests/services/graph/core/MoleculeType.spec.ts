import { describe, it, expect } from 'vitest';
import { MoleculeType } from '../../../../src/services/graph/core/MoleculeType';

describe('MoleculeType', () => {
  it('should create a MoleculeType with a name', () => {
    const molType = new MoleculeType('A');
    expect(molType.name).toBe('A');
    expect(molType.components.size).toBe(0);
  });

  it('should add a component with no states', () => {
    const molType = new MoleculeType('A');
    molType.addComponent('c');
    expect(molType.components.size).toBe(1);

    const comp = molType.getComponent('c');
    expect(comp).toBeDefined();
    expect(comp?.name).toBe('c');
    expect(comp?.states.length).toBe(0);
  });

  it('should add a component with multiple states', () => {
    const molType = new MoleculeType('A');
    molType.addComponent('c', ['p', 'u']);
    expect(molType.components.size).toBe(1);

    const comp = molType.getComponent('c');
    expect(comp).toBeDefined();
    expect(comp?.name).toBe('c');
    expect(comp?.states).toEqual(['p', 'u']);
  });

  it('should format correctly to string with no components', () => {
    const molType = new MoleculeType('A');
    expect(molType.toString()).toBe('A()');
  });

  it('should format correctly to string with components without states', () => {
    const molType = new MoleculeType('A');
    molType.addComponent('x');
    molType.addComponent('y');
    expect(molType.toString()).toBe('A(x,y)');
  });

  it('should format correctly to string with components with states', () => {
    const molType = new MoleculeType('A');
    molType.addComponent('x', ['p', 'u']);
    molType.addComponent('y', ['0', '1']);
    molType.addComponent('z');
    expect(molType.toString()).toBe('A(x~p~u,y~0~1,z)');
  });
});
