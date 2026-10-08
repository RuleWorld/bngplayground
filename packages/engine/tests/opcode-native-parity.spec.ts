import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JITCompiler } from '../src/services/analysis/JITCompiler';
import { OpCode } from '../src/services/simulation/ExpressionCompiler';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('native bytecode validation', () => {
  it('keeps every TypeScript opcode value implemented by the C interpreter', () => {
    const cSource = readFileSync(path.join(repoRoot, 'wasm-sundials/cvode_wrapper.c'), 'utf8');
    const evaluator = cSource.match(/static double evaluate_expression[\s\S]*?\n}\n/);
    expect(evaluator, 'C bytecode evaluator source should be present').not.toBeNull();

    const cOpcodes = new Set<number>();
    for (const match of evaluator![0].matchAll(/case\s+(\d+)\s*:/g)) {
      cOpcodes.add(Number(match[1]));
    }
    const tsOpcodes = Object.entries(OpCode)
      .filter(([, value]) => typeof value === 'number')
      .map(([name, value]) => [name, value as number] as const);
    expect(tsOpcodes.length).toBeGreaterThan(0);
    for (const [name, value] of tsOpcodes) {
      expect(cOpcodes.has(value), `OpCode.${name}=${value} must be handled in evaluate_expression`).toBe(true);
    }
    expect(cOpcodes).toEqual(new Set(tsOpcodes.map(([, value]) => value)));
  });

  it.each([-1, 2])('rejects observable species index %d outside the produced range', (speciesIndex) => {
    const compiler = new JITCompiler();
    const bytecode = compiler.compileToByteCode([], 2, {}, undefined, undefined, [
      { name: 'bad', indices: [speciesIndex], coefficients: [1] },
    ]);
    expect(bytecode).toBeNull();
  });

  it('emits bounded observable offsets and accepts valid empty rows', () => {
    const compiler = new JITCompiler();
    const bytecode = compiler.compileToByteCode([], 2, {}, undefined, undefined, [
      { name: 'A', indices: [1], coefficients: [2] },
      { name: 'empty', indices: [], coefficients: [] },
    ]);
    expect(bytecode?.obsOffsets).toEqual(new Int32Array([0, 1, 1]));
    expect(bytecode?.obsSpeciesIdx).toEqual(new Int32Array([1]));
  });
});
