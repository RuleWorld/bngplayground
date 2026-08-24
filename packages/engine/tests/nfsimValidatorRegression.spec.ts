import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { parseBNGLStrict } from '../src/parser/BNGLParserWrapper';
import { validateModelForNFsim } from '../src/services/simulation/nfsim/NFsimRunner';
import { ValidationErrorType } from '../src/services/simulation/nfsim/NFsimValidator';

describe('NFsimValidator Transitive Observable Dependency Regression Test', () => {
  it('should flag rules with function-mediated observable dependencies as invalid for NFsim', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/regression/function_observable_nfsim.bngl');
    const bnglCode = fs.readFileSync(fixturePath, 'utf8');

    const model = parseBNGLStrict(bnglCode);
    const result = validateModelForNFsim(model);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.type === ValidationErrorType.OBSERVABLE_DEPENDENT_RATE)).toBe(true);
  });
});
