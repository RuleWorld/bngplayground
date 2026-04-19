/**
 * NeuralRateResidual round-trip tests.
 *
 * These replace the .skip() scaffolding in the PLAN. They verify that
 * serialize() → fromSerialized() produces an identical network output, that
 * the shape guards fire on architecture mismatch, and that evaluate() produces
 * finite numbers with the expected sign/magnitude properties.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { NeuralRateResidual } from './NeuralRateResidual';
import type { HybridRule } from './types';

const RULE_2x8x8x1: HybridRule = {
  ruleName: 'R1',
  inputFeatures: ['A', 'B'],
  hiddenLayers: [8, 8],
  activation: 'tanh',
  outputScale: 1,
  enforceNonNegative: false,
  combination: 'multiplicative',
};

describe('NeuralRateResidual', () => {
  beforeAll(async () => {
    // Force CPU backend for deterministic-ish tests.
    await tf.setBackend('cpu');
    await tf.ready();
  });

  it('builds with the expected architecture', () => {
    const r = new NeuralRateResidual(RULE_2x8x8x1);
    r.build();
    const serialized = r.serialize();
    expect(serialized.architecture).toEqual([2, 8, 8, 1]);
    expect(serialized.weights).toHaveLength(3);  // 3 dense layers
    expect(serialized.weights[0]).toHaveLength(8);   // first layer: 8 outputs
    expect(serialized.weights[0][0]).toHaveLength(2); // 2 inputs
    expect(serialized.weights[2]).toHaveLength(1);   // last layer: 1 output
    expect(serialized.biases[0]).toHaveLength(8);
    expect(serialized.biases[2]).toHaveLength(1);
  });

  it('evaluate() at a state produces a finite number', () => {
    const r = new NeuralRateResidual(RULE_2x8x8x1);
    r.build();
    const out = r.evaluate({ A: 0.5, B: 1.2 });
    expect(Number.isFinite(out)).toBe(true);
  });

  it('enforceNonNegative clamps negative outputs to zero', () => {
    const rule: HybridRule = { ...RULE_2x8x8x1, enforceNonNegative: true, outputScale: -1e6 };
    const r = new NeuralRateResidual(rule);
    r.build();
    // Large negative outputScale forces any non-zero raw output to be clamped.
    for (let i = 0; i < 10; i++) {
      const out = r.evaluate({ A: Math.random(), B: Math.random() });
      expect(out).toBeGreaterThanOrEqual(0);
    }
  });

  it('evaluateBatch matches element-wise evaluate', () => {
    const r = new NeuralRateResidual(RULE_2x8x8x1);
    r.build();
    const states = [
      { A: 0.1, B: 0.2 },
      { A: 0.3, B: 0.4 },
      { A: 0.5, B: 0.6 },
    ];
    const batch = r.evaluateBatch(states);
    const individual = states.map((s) => r.evaluate(s));
    expect(batch).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(batch[i]).toBeCloseTo(individual[i], 6);
    }
  });

  it('serialize → fromSerialized round-trips identically', () => {
    const r1 = new NeuralRateResidual(RULE_2x8x8x1);
    r1.build();

    const state = { A: 0.7, B: 1.1 };
    const outBefore = r1.evaluate(state);

    const serialized = r1.serialize();
    const r2 = NeuralRateResidual.fromSerialized(RULE_2x8x8x1, serialized);
    const outAfter = r2.evaluate(state);

    expect(outAfter).toBeCloseTo(outBefore, 10);
    r1.dispose();
    r2.dispose();
  });

  it('fromSerialized throws on architecture mismatch', () => {
    const r = new NeuralRateResidual(RULE_2x8x8x1);
    r.build();
    const serialized = r.serialize();

    const wrongRule: HybridRule = { ...RULE_2x8x8x1, inputFeatures: ['A', 'B', 'C'] };
    expect(() => NeuralRateResidual.fromSerialized(wrongRule, serialized)).toThrow(
      /architecture/i,
    );
    r.dispose();
  });

  it('fromSerialized throws on activation mismatch', () => {
    const r = new NeuralRateResidual(RULE_2x8x8x1);
    r.build();
    const serialized = r.serialize();

    const wrongRule: HybridRule = { ...RULE_2x8x8x1, activation: 'relu' };
    expect(() => NeuralRateResidual.fromSerialized(wrongRule, serialized)).toThrow(
      /activation/i,
    );
    r.dispose();
  });

  it('carries trainingMeta through serialize', () => {
    const r = new NeuralRateResidual(RULE_2x8x8x1);
    r.build();
    const meta = { epochs: 100, finalLoss: 0.01, optimizer: 'adam', trainedAt: '2026-04-18T00:00:00Z' };
    const serialized = r.serialize(meta);
    expect(serialized.trainingMeta).toEqual(meta);

    const r2 = NeuralRateResidual.fromSerialized(RULE_2x8x8x1, serialized);
    const reserialized = r2.serialize();
    // trainingMeta isn't carried by fromSerialized (it's snapshot-specific),
    // but the weights should still round-trip.
    expect(reserialized.architecture).toEqual(serialized.architecture);
    r.dispose();
    r2.dispose();
  });

  it('handles outputScale correctly', () => {
    const rule = { ...RULE_2x8x8x1, outputScale: 100 };
    const r1 = new NeuralRateResidual(rule);
    r1.build();

    const r2 = new NeuralRateResidual({ ...rule, outputScale: 1 });
    r2.build();
    // Replay r1's weights into r2 so internals are identical; only outputScale differs.
    const serialized = r1.serialize();
    // r2 was built, but serialize/fromSerialized honors architecture. Re-create with different scale.
    const r3 = NeuralRateResidual.fromSerialized({ ...rule, outputScale: 1 }, serialized);

    const state = { A: 0.5, B: 0.5 };
    const scaled = r1.evaluate(state);
    const unscaled = r3.evaluate(state);
    expect(scaled).toBeCloseTo(unscaled * 100, 4);
    r1.dispose();
    r2.dispose();
    r3.dispose();
  });
});
