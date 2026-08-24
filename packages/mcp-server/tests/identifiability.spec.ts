import { describe, expect, it } from 'vitest';
import { handleIdentifiability } from '../src/handlers/identifiability.js';

const SIMPLE_MODEL = `begin model
begin parameters
  k1  0.1
  k2  0.05
end parameters
begin molecule types
  A()
  B()
end molecule types
begin seed species
  A()  100
  B()  0
end seed species
begin observables
  Molecules A_obs A()
  Molecules B_obs B()
end observables
begin reaction rules
  A() -> B() k1
  B() -> A() k2
end reaction rules
end model
`;

const SAMPLE_DATA = [
  { time: 0, observables: { A_obs: 100, B_obs: 0 } },
  { time: 5, observables: { A_obs: 60, B_obs: 40 } },
  { time: 10, observables: { A_obs: 40, B_obs: 60 } },
];

describe('identifiability handler — standard functionality', () => {
  it('runs profile likelihood estimation on a simple model', async () => {
    const result = await handleIdentifiability({
      code: SIMPLE_MODEL,
      data: SAMPLE_DATA,
      parameters: ['k1'],
      n_grid: 2,
    });

    const body = JSON.parse(result.content[0].text);
    expect(body).toBeDefined();
    expect(body.profiles).toBeDefined();
    expect(body.profiles.k1).toBeDefined();
  }, 30000);

  it('defaults to all model parameters when parameters is omitted', async () => {
    const result = await handleIdentifiability({
      code: SIMPLE_MODEL,
      data: SAMPLE_DATA,
      n_grid: 2,
    });

    const body = JSON.parse(result.content[0].text);
    expect(body.profiles).toBeDefined();
    expect(body.profiles.k1).toBeDefined();
    expect(body.profiles.k2).toBeDefined();
  }, 30000);
});

describe('identifiability handler — edge cases & robustness', () => {
  it('rejects empty or blank model code with a structured error', async () => {
    const result = await handleIdentifiability({
      code: '   ',
      data: SAMPLE_DATA,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBeDefined();
    expect(body.error).toMatch(/code|BNGL parse failed/i);
  });

  it('rejects malformed inputs / wrong argument types gracefully', async () => {
    // data is not an array
    const resultInvalidData = await handleIdentifiability({
      code: SIMPLE_MODEL,
      data: 'invalid-data' as unknown as Array<{ time: number; observables: Record<string, number> }>,
    });
    const bodyData = JSON.parse(resultInvalidData.content[0].text);
    expect(bodyData.error).toMatch(/data/i);

    // code is wrong type
    const resultInvalidCode = await handleIdentifiability({
      code: 12345 as unknown as string,
      data: SAMPLE_DATA,
    });
    const bodyCode = JSON.parse(resultInvalidCode.content[0].text);
    expect(bodyCode.error).toMatch(/code/i);
  });

  it('handles unparseable/garbage BNGL code gracefully', async () => {
    const result = await handleIdentifiability({
      code: 'not valid bngl code @#$%^',
      data: SAMPLE_DATA,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toMatch(/BNGL parse failed|no parameters/i);
  });

  it('rejects empty experimental data array', async () => {
    const result = await handleIdentifiability({
      code: SIMPLE_MODEL,
      data: [],
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBeDefined();
    expect(body.error).toMatch(/data|experimental/i);
  });

  it('rejects non-existent parameters gracefully', async () => {
    const result = await handleIdentifiability({
      code: SIMPLE_MODEL,
      data: SAMPLE_DATA,
      parameters: ['non_existent_param'],
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBeDefined();
    expect(body.error).toMatch(/unknown parameters/i);
  });

  it('handles zero parameters to analyze gracefully', async () => {
    const result = await handleIdentifiability({
      code: SIMPLE_MODEL,
      data: SAMPLE_DATA,
      parameters: [],
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBeDefined();
    expect(body.error).toMatch(/parameters/i);
  });
});
