import { describe, expect, it } from 'vitest';
import { simulate } from '../src/services/simulation/SimulationLoop';
import type { BNGLModel, BNGLEvent, SimulationOptions } from '../src/types';

const callbacks = {
  checkCancelled: () => {},
  postMessage: () => {},
};

function eventModel(events: BNGLEvent[], method: 'ode' | 'ssa' = 'ode'): BNGLModel {
  return {
    parameters: { p: 0 },
    moleculeTypes: [{ name: 'S', components: [] }],
    species: [{ name: 'S()', initialConcentration: 0 }],
    observables: [{ name: 'S', type: 'species', pattern: 'S()' }],
    concreteObservables: [{ name: 'S', type: 'species', indices: [0], coefficients: [1], volumes: [1] }],
    reactions: [],
    reactionRules: [],
    events,
    simulationPhases: [{ method, t_end: 3, n_steps: 12 }],
  };
}

const timeEvent = (overrides: Partial<BNGLEvent> = {}): BNGLEvent => ({
  id: 'E',
  name: 'E',
  trigger: 'time >= 1',
  bnglTrigger: 'time >= 1',
  delay: '0.5',
  bnglDelay: '0.5',
  useValuesFromTriggerTime: true,
  assignments: [{ variable: 'S', bnglVariable: 'S', bnglTarget: 'S()', math: '2', bnglMath: '2' }],
  ...overrides,
});

const options = (method: 'ode' | 'ssa'): SimulationOptions => ({
  method,
  t_end: 3,
  n_steps: 12,
  seed: 1234,
  includeSpeciesData: true,
  includeExpandedNetwork: false,
  solver: 'cvode',
});

describe('SBML event runtime', () => {
  it('fires delayed time events at exact event time in ODE trajectories', async () => {
    const result = await simulate(1, eventModel([timeEvent()]), options('ode'), callbacks);
    const atOne = result.speciesData?.find((row) => row.time === 1);
    const atOnePointFive = result.speciesData?.find((row) => row.time === 1.5);

    expect(atOne?.['S()']).toBe(0);
    expect(atOnePointFive?.['S()']).toBeCloseTo(2, 12);
    expect(result.eventFirings).toEqual(['E']);
  });

  it('fires zero-delay state-triggered events in SSA trajectories', async () => {
    const event = timeEvent({
      id: 'threshold',
      name: 'threshold',
      trigger: 'S >= 1',
      bnglTrigger: 'S_amt >= 1',
      delay: undefined,
      bnglDelay: undefined,
      triggerInitialValue: false,
      assignments: [{ variable: 'S', bnglVariable: 'S', bnglTarget: 'S()', math: '7', bnglMath: '7' }],
    });
    const model = eventModel([event], 'ssa');
    model.species[0].initialConcentration = 1;
    const result = await simulate(2, model, options('ssa'), callbacks);

    expect(result.speciesData?.at(-1)?.['S()']).toBe(7);
    expect(result.eventFirings).toEqual(['threshold']);
  });

  it('detects continuous state crossings and permits repeated firings', async () => {
    const model = eventModel([timeEvent({
      id: 'repeat',
      name: 'repeat',
      trigger: 'S >= 1',
      bnglTrigger: 'S_amt >= 1',
      delay: undefined,
      bnglDelay: undefined,
      assignments: [{ variable: 'S', bnglVariable: 'S', bnglTarget: 'S()', math: '0', bnglMath: '0' }],
    })]);
    model.reactions = [{ reactants: [], products: ['S()'], rate: '1', rateConstant: 1 }];
    const result = await simulate(3, model, options('ode'), callbacks);

    expect(result.speciesData?.find((row) => row.time === 1)?.['S()']).toBeCloseTo(0, 10);
    expect(result.speciesData?.find((row) => row.time === 2)?.['S()']).toBeCloseTo(0, 10);
    expect(result.speciesData?.at(-1)?.['S()']).toBeCloseTo(0, 8);
  });

  it('restarts CVODE after a delayed state root that only schedules an event', async () => {
    const model = eventModel([timeEvent({
      id: 'delayed-crossing',
      name: 'delayed-crossing',
      trigger: 'S >= 1',
      bnglTrigger: 'S_amt >= 1',
      delay: '0.5',
      bnglDelay: '0.5',
      assignments: [{ variable: 'p', bnglVariable: 'p', math: '2', bnglMath: '2' }],
    })]);
    model.reactions = [{ reactants: [], products: ['S()'], rate: '1', rateConstant: 1 }];
    const result = await simulate(9, model, options('ode'), callbacks);

    expect(result.eventFirings).toEqual(['delayed-crossing']);
    expect(result.speciesData?.at(-1)?.['S()']).toBeCloseTo(3, 8);
  });

  it('evaluates simultaneous assignments from trigger snapshots and priority order', async () => {
    const snapshotModel = eventModel([timeEvent({
      id: 'snapshot',
      name: 'snapshot',
      delay: '1',
      bnglDelay: '1',
      assignments: [
        { variable: 'S', bnglVariable: 'S', bnglTarget: 'S()', math: 'p', bnglMath: 'p' },
        { variable: 'p', bnglVariable: 'p', math: '2', bnglMath: '2' },
      ],
    })]);
    const snapshot = await simulate(4, snapshotModel, options('ode'), callbacks);
    expect(snapshot.speciesData?.find((row) => row.time === 2)?.['S()']).toBeCloseTo(0, 12);

    const assignmentTime = await simulate(5, eventModel([timeEvent({
      id: 'assignment-time',
      name: 'assignment-time',
      delay: '1',
      bnglDelay: '1',
      useValuesFromTriggerTime: false,
      assignments: [
        { variable: 'S', bnglVariable: 'S', bnglTarget: 'S()', math: 'p', bnglMath: 'p' },
        { variable: 'p', bnglVariable: 'p', math: '2', bnglMath: '2' },
      ],
    })]), options('ode'), callbacks);
    // Simultaneous assignments use the pre-event state even when evaluated at fire time.
    expect(assignmentTime.speciesData?.find((row) => row.time === 2)?.['S()']).toBeCloseTo(0, 12);

    const priority = await simulate(6, eventModel([
      timeEvent({ id: 'low', name: 'low', priority: '1', bnglPriority: '1', assignments: [{ variable: 'S', bnglVariable: 'S', bnglTarget: 'S()', math: '1', bnglMath: '1' }] }),
      timeEvent({ id: 'high', name: 'high', priority: '2', bnglPriority: '2', assignments: [{ variable: 'S', bnglVariable: 'S', bnglTarget: 'S()', math: '2', bnglMath: '2' }] }),
    ]), options('ode'), callbacks);
    expect(priority.speciesData?.find((row) => row.time === 1.5)?.['S()']).toBeCloseTo(1, 12);
  });

  it('executes delayed time events in SSA when no reaction fires', async () => {
    const result = await simulate(7, eventModel([timeEvent()], 'ssa'), options('ssa'), callbacks);
    expect(result.speciesData?.find((row) => row.time === 1.5)?.['S()']).toBeCloseTo(2, 12);
  });

  it('evaluates rateOf delays and SBML piecewise assignments', async () => {
    const event = timeEvent({
      id: 'rate-of',
      name: 'rate-of',
      delay: 'rateOf(S)',
      bnglDelay: 'rateOf(S_amt)',
      assignments: [{ variable: 'S', bnglVariable: 'S', bnglTarget: 'S()', math: 'piecewise(4, 1, 0)', bnglMath: 'piecewise(4, 1, 0)' }],
    });
    const model = eventModel([event]);
    model.reactions = [{ reactants: [], products: ['S()'], rate: '1', rateConstant: 1 }];
    const result = await simulate(8, model, options('ode'), callbacks);

    expect(result.speciesData?.find((row) => row.time === 2)?.['S()']).toBeCloseTo(4, 10);
  });

  it('evaluates n-ary SBML relations pairwise inside piecewise event delays', async () => {
    const event = timeEvent({
      id: 'nary-relation',
      name: 'nary-relation',
      trigger: 'time >= 0.1',
      bnglTrigger: 'time >= 0.1',
      delay: 'piecewise(0.5, (1 <= 2 <= 1), 0.3)',
      bnglDelay: 'piecewise(0.5, (1 <= 2 <= 1), 0.3)',
      assignments: [{ variable: 'S', bnglVariable: 'S', bnglTarget: 'S()', math: '3', bnglMath: '3' }],
    });
    const model = eventModel([event]);
    model.simulationPhases = [{ method: 'ode', t_end: 1, n_steps: 10 }];
    const result = await simulate(11, model, { ...options('ode'), t_end: 1, n_steps: 10 }, callbacks);

    expect(result.speciesData?.find((row) => row.time === 0.4)?.['S()']).toBeCloseTo(3, 10);
    expect(result.speciesData?.find((row) => row.time === 0.6)?.['S()']).toBeCloseTo(3, 10);
  });

  it('does not replay a periodic non-persistent event from a stale root direction', async () => {
    const model = eventModel([timeEvent({
      id: 'periodic',
      name: 'periodic',
      trigger: 'time - reset >= 0.5',
      bnglTrigger: 'time - reset >= 0.5',
      delay: undefined,
      bnglDelay: undefined,
      triggerPersistent: false,
      assignments: [
        { variable: 'reset', bnglVariable: 'reset', math: 'time', bnglMath: 'time' },
        { variable: 'p', bnglVariable: 'p', math: 'p + 1', bnglMath: 'p + 1' },
      ],
    })]);
    model.parameters.reset = 0;
    model.simulationPhases = [{ method: 'ode', t_end: 2, n_steps: 4 }];
    const result = await simulate(12, model, { ...options('ode'), t_end: 2, n_steps: 4 }, callbacks);

    expect(result.eventFirings?.length).toBe(4);
    expect(result.eventFirings).toEqual(['periodic', 'periodic', 'periodic', 'periodic']);
  });

  it('executes all non-persistent sibling events triggered at one timestamp', async () => {
    const model = eventModel([
      timeEvent({
        id: 'left',
        name: 'left',
        triggerPersistent: false,
        assignments: [{ variable: 'p', bnglVariable: 'p', math: '1', bnglMath: '1' }],
      }),
      timeEvent({
        id: 'right',
        name: 'right',
        triggerPersistent: false,
        assignments: [{ variable: 'q', bnglVariable: 'q', math: '1', bnglMath: '1' }],
      }),
    ]);
    model.parameters.q = 0;
    const result = await simulate(14, model, options('ode'), callbacks);

    expect(result.eventFirings).toEqual(['left', 'right']);
    expect(result.eventDiagnostics).toEqual([]);
  });

  it('executes variable SBML stoichiometry from live event-assigned coefficients', async () => {
    const model: BNGLModel = {
      parameters: { a: 2, b: 1 },
      moleculeTypes: [{ name: 'A', components: [] }],
      species: [{ name: 'A()', initialConcentration: 1 }],
      observables: [{ name: 'A', type: 'species', pattern: 'A()' }],
      concreteObservables: [{ name: 'A', type: 'species', indices: [0], coefficients: [1], volumes: [1] }],
      reactions: [],
      reactionRules: [{
        name: 'J0',
        reactants: ['A()', 'A()', 'A()'],
        products: [],
        rate: '-1',
        isBidirectional: false,
        totalRate: true,
        dynamicStoichiometries: [
          { ruleName: 'J0', bnglPattern: 'A()', variable: 'a', side: 'reactant', fixedStoichiometry: 2 },
          { ruleName: 'J0', bnglPattern: 'A()', variable: 'b', side: 'reactant', fixedStoichiometry: 1 },
        ],
      }],
      events: [{
        id: 'coefficients',
        name: 'coefficients',
        trigger: 'time >= 1',
        bnglTrigger: 'time >= 1',
        useValuesFromTriggerTime: true,
        assignments: [
          { variable: 'a', bnglVariable: 'a', math: '1', bnglMath: '1' },
          { variable: 'b', bnglVariable: 'b', math: '1', bnglMath: '1' },
        ],
      }],
      simulationPhases: [{ method: 'ode', t_end: 2, n_steps: 2 }],
    };

    const result = await simulate(13, model, { ...options('ode'), t_end: 2, n_steps: 2 }, callbacks);
    expect(result.speciesData?.at(-1)?.['A()']).toBeCloseTo(6, 8);
    expect(result.eventDiagnostics).toEqual([]);
  });

  it('reports unsupported trigger syntax and assignment targets explicitly', async () => {
    const result = await simulate(10, eventModel([timeEvent({
      id: 'unsupported',
      name: 'unsupported',
      trigger: 'S +',
      bnglTrigger: 'S +',
      assignments: [{ variable: 'missing', math: '1' }],
    })]), options('ode'), callbacks);

    expect(result.eventDiagnostics).toEqual(expect.arrayContaining([
      'event unsupported: trigger expression could not be parsed',
      'event unsupported: assignment target missing is not executable',
    ]));
  });
});
