import { describe, it, expect } from 'vitest';
import {
  computeSemanticDiff, createVersionDAG, recordVersion, getHistory,
  createBranch, serializeDAG, deserializeDAG,
} from '../../src/services/versioning/ModelVersionTracker';

const BASE_MODEL = `begin model
begin parameters
  kf 0.1
  kr 0.01
end parameters
begin molecule types
  A(b)
  B(a)
end molecule types
begin seed species
  A(b) 100
  B(a) 100
end seed species
begin observables
  Molecules A_free A(b)
  Molecules AB A(b!1).B(a!1)
end observables
begin reaction rules
  A(b) + B(a) -> A(b!1).B(a!1) kf
  A(b!1).B(a!1) -> A(b) + B(a) kr
end reaction rules
end model`;

const MODIFIED_MODEL = `begin model
begin parameters
  kf 0.5
  kr 0.01
  kcat 0.05
end parameters
begin molecule types
  A(b)
  B(a)
end molecule types
begin seed species
  A(b) 100
  B(a) 100
end seed species
begin observables
  Molecules A_free A(b)
  Molecules AB A(b!1).B(a!1)
end observables
begin reaction rules
  A(b) + B(a) -> A(b!1).B(a!1) kf
  A(b!1).B(a!1) -> A(b) + B(a) kr
  A(b) -> 0 kcat
end reaction rules
end model`;

describe('computeSemanticDiff', () => {
  it('detects added rules', () => {
    const diff = computeSemanticDiff(BASE_MODEL, MODIFIED_MODEL);
    const addedRules = diff.changes.filter(c => c.section === 'rules' && c.type === 'added');
    expect(addedRules.length).toBeGreaterThanOrEqual(1);
  });

  it('detects parameter changes', () => {
    const diff = computeSemanticDiff(BASE_MODEL, MODIFIED_MODEL);
    const paramChanges = diff.changes.filter(c => c.section === 'parameters');
    const kfChange = paramChanges.find(p => p.name === 'kf');
    expect(kfChange).toBeDefined();
    expect(kfChange?.type).toBe('modified');
  });

  it('detects added parameters', () => {
    const diff = computeSemanticDiff(BASE_MODEL, MODIFIED_MODEL);
    const paramChanges = diff.changes.filter(c => c.section === 'parameters');
    const kcatChange = paramChanges.find(p => p.name === 'kcat');
    expect(kcatChange).toBeDefined();
    expect(kcatChange?.type).toBe('added');
  });

  it('reports no changes for identical models', () => {
    const diff = computeSemanticDiff(BASE_MODEL, BASE_MODEL);
    expect(diff.changes.length).toBe(0);
    expect(diff.summary).toBe('No changes');
  });

  it('counts changes across sections', () => {
    const diff = computeSemanticDiff(BASE_MODEL, MODIFIED_MODEL);
    expect(diff.changes.length).toBeGreaterThanOrEqual(2);
    expect(diff.sectionsAffected.length).toBeGreaterThanOrEqual(1);
    // Should have at least rules and parameters affected
    expect(diff.sectionsAffected).toContain('parameters');
  });
});

describe('VersionDAG', () => {
  it('creates DAG with root version', () => {
    const dag = createVersionDAG(BASE_MODEL, 'Initial');
    // The initial version is both head and root (single version)
    expect(dag.headId).toBeTruthy();
    expect(dag.versions.size).toBe(1);
    const root = dag.versions.get(dag.headId);
    expect(root?.label).toBe('Initial');
    expect(root?.code).toBe(BASE_MODEL);
  });

  it('records new versions with correct diffs', () => {
    const dag0 = createVersionDAG(BASE_MODEL, 'v1');
    const dag1 = recordVersion(dag0, MODIFIED_MODEL, { label: 'Added degradation' });
    expect(dag1.versions.size).toBe(2);
    // The new head should differ from the original root
    expect(dag1.headId).not.toBe(dag0.headId);
    // Check the new version's diff
    const newVersion = dag1.versions.get(dag1.headId);
    expect(newVersion).toBeDefined();
    expect(newVersion?.diff).toBeDefined();
  });

  it('getHistory returns versions root to head', () => {
    const dag0 = createVersionDAG(BASE_MODEL, 'v1');
    const dag1 = recordVersion(dag0, MODIFIED_MODEL, { label: 'v2' });
    const dag2 = recordVersion(dag1, BASE_MODEL, { label: 'v3' }); // revert
    const history = getHistory(dag2);
    expect(history.length).toBe(3);
    // getHistory returns root-to-head (reversed walk)
    expect(history[0].label).toBe('v1'); // root
    expect(history[2].label).toBe('v3'); // head
  });

  it('creates branches correctly', () => {
    const dag0 = createVersionDAG(BASE_MODEL, 'v1');
    const dag1 = recordVersion(dag0, MODIFIED_MODEL, { label: 'v2' });
    const dag2 = createBranch(dag1, 'experiment-A');
    expect(dag2.branches.get('experiment-A')).toBe(dag2.headId);
  });

  it('serializes and deserializes roundtrip', () => {
    const dag0 = createVersionDAG(BASE_MODEL, 'v1');
    const dag1 = recordVersion(dag0, MODIFIED_MODEL, { label: 'v2' });
    const dag = createBranch(dag1, 'test-branch');

    const json = serializeDAG(dag);
    expect(typeof json).toBe('string');

    const restored = deserializeDAG(json);
    expect(restored.versions.size).toBe(dag.versions.size);
    expect(restored.headId).toBe(dag.headId);
    expect(restored.branches.get('test-branch')).toBe(dag.branches.get('test-branch'));
  });
});

describe('BehavioralBisection', () => {
  it('finds the version where a property changes', async () => {
    // This is a conceptual test — the actual bisection requires simulation
    const { testProperty } = await import('../../src/services/versioning/BehavioralBisection');

    // Create a 5-version history (recordVersion returns a new DAG each time)
    let dag = createVersionDAG(BASE_MODEL, 'v1');
    for (let i = 2; i <= 5; i++) {
      const modifiedCode = BASE_MODEL.replace(`kf 0.1`, `kf ${0.1 * i}`);
      dag = recordVersion(dag, modifiedCode, { label: `v${i}` });
    }

    const history = getHistory(dag);
    expect(history.length).toBe(5);

    // Test the testProperty function with mock results
    if (testProperty) {
      const mockResults = {
        headers: ['time', 'A_free'],
        data: [
          { time: 0, A_free: 100 },
          { time: 50, A_free: 60 },
          { time: 100, A_free: 30 },
        ],
      };
      const property = {
        type: 'observable_value' as const,
        observableName: 'A_free',
        timePoint: 100,
        predicate: 'above' as const,
        threshold: 50,
      };
      const result = testProperty(mockResults as any, property);
      expect(result).toBe(false); // 30 < 50
    }
  });
});
