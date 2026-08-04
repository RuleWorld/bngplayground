import { describe, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseBNGLStrict, generateExpandedNetwork, simulate, runNFsimSimulation } from '@bngplayground/engine';

// Global mocks to satisfy browser-specific Web Worker message event routines
globalThis.postMessage = () => {};
globalThis.self = globalThis;

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }
  choose<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length)];
  }
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
}

// Template 1: Unimolecular State Transition
function makeStateTransitionTemplate(rng: SeededRandom, index: string): string {
  const molName = `P_${rng.choose(['A', 'B', 'C', 'M', 'R'])}${index.replace(/_/g, '')}`;
  const compName = rng.choose(['site', 'state', 'domain', 'tyr', 'ser']);
  const state0 = rng.choose(['0', 'u', 'off']);
  const state1 = rng.choose(['1', 'p', 'on']);
  const pName = `k_phos${index.replace(/_/g, '')}`;
  const pVal = rng.nextFloat(0.01, 2.0).toFixed(4);
  const initVal = rng.nextInt(50, 500);

  return `
begin parameters
  ${pName} ${pVal}
end parameters

begin molecule types
  ${molName}(${compName}~${state0}~${state1})
end molecule types

begin seed species
  ${molName}(${compName}~${state0}) ${initVal}
end seed species

begin observables
  Molecules Obs_${molName} ${molName}()
  Molecules Obs_${molName}_active ${molName}(${compName}~${state1})
end observables

begin reaction rules
  ${molName}(${compName}~${state0}) -> ${molName}(${compName}~${state1}) ${pName}
end reaction rules
`;
}

// Template 2: Reversible Binding
function makeReversibleBindingTemplate(rng: SeededRandom, index: string): string {
  const suffix = index.replace(/_/g, '');
  const mol1 = `L_${suffix}`;
  const mol2 = `R_${suffix}`;
  const comp1 = `r`;
  const comp2 = `l`;
  const kp = `kp${suffix}`;
  const km = `km${suffix}`;
  const kpVal = rng.nextFloat(0.01, 1.0).toFixed(4);
  const kmVal = rng.nextFloat(0.01, 1.0).toFixed(4);
  const init1 = rng.nextInt(20, 200);
  const init2 = rng.nextInt(20, 200);

  return `
begin parameters
  ${kp} ${kpVal}
  ${km} ${kmVal}
end parameters

begin molecule types
  ${mol1}(${comp1})
  ${mol2}(${comp2})
end molecule types

begin seed species
  ${mol1}(${comp1}) ${init1}
  ${mol2}(${comp2}) ${init2}
end seed species

begin observables
  Molecules Obs_L_${suffix} ${mol1}()
  Molecules Obs_R_${suffix} ${mol2}()
  Molecules Obs_Complex_${suffix} ${mol1}(${comp1}!1).${mol2}(${comp2}!1)
end observables

begin reaction rules
  ${mol1}(${comp1}) + ${mol2}(${comp2}) <-> ${mol1}(${comp1}!1).${mol2}(${comp2}!1) ${kp}, ${km}
end reaction rules
`;
}

// Template 3: Catalytic Activation
function makeCatalyticActivationTemplate(rng: SeededRandom, index: string): string {
  const suffix = index.replace(/_/g, '');
  const kin = `Kinase${suffix}`;
  const sub = `Substrate${suffix}`;
  const kPhos = `k_cat${suffix}`;
  const kPhosVal = rng.nextFloat(0.01, 0.5).toFixed(4);
  const initKin = rng.nextInt(5, 50);
  const initSub = rng.nextInt(100, 1000);

  return `
begin parameters
  ${kPhos} ${kPhosVal}
end parameters

begin molecule types
  ${kin}(active)
  ${sub}(p~u~p)
end molecule types

begin seed species
  ${kin}(active) ${initKin}
  ${sub}(p~u) ${initSub}
end seed species

begin observables
  Molecules Obs_Kin_${suffix} ${kin}()
  Molecules Obs_Sub_u_${suffix} ${sub}(p~u)
  Molecules Obs_Sub_p_${suffix} ${sub}(p~p)
end observables

begin reaction rules
  ${kin}(active) + ${sub}(p~u) -> ${kin}(active) + ${sub}(p~p) ${kPhos}
end reaction rules
`;
}

// Template 4: Synthesis and Degradation
function makeSynthesisDegradationTemplate(rng: SeededRandom, index: string): string {
  const suffix = index.replace(/_/g, '');
  const mol = `S${suffix}`;
  const kSyn = `k_syn${suffix}`;
  const kDeg = `k_deg${suffix}`;
  const kSynVal = rng.nextFloat(1.0, 10.0).toFixed(4);
  const kDegVal = rng.nextFloat(0.01, 0.2).toFixed(4);
  const init = rng.nextInt(0, 20);

  return `
begin parameters
  ${kSyn} ${kSynVal}
  ${kDeg} ${kDegVal}
end parameters

begin molecule types
  ${mol}()
end molecule types

begin seed species
  ${mol}() ${init}
end seed species

begin observables
  Molecules Obs_S_${suffix} ${mol}()
end observables

begin reaction rules
  0 -> ${mol}() ${kSyn}
  ${mol}() -> 0 ${kDeg}
end reaction rules
`;
}

function generateModel(rng: SeededRandom, modelIndex: number): string {
  // Randomly choose two templates to combine
  const t1 = rng.nextInt(1, 5);
  let t2 = rng.nextInt(1, 5);
  while (t2 === t1) {
    t2 = rng.nextInt(1, 5);
  }

  const blocks = [t1, t2].map((type, idx) => {
    const subIdx = `${modelIndex}_${idx}`;
    if (type === 1) return makeStateTransitionTemplate(rng, subIdx);
    if (type === 2) return makeReversibleBindingTemplate(rng, subIdx);
    if (type === 3) return makeCatalyticActivationTemplate(rng, subIdx);
    return makeSynthesisDegradationTemplate(rng, subIdx);
  });

  // Combine blocks
  const params: string[] = [];
  const molTypes: string[] = [];
  const seedSpecies: string[] = [];
  const observables: string[] = [];
  const rules: string[] = [];

  const extractBlock = (src: string, blockName: string): string[] => {
    const re = new RegExp(`begin ${blockName}\\s*\\n([\\s\\S]*?)\\nend ${blockName}`, 'i');
    const m = src.match(re);
    if (!m) return [];
    return m[1].split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
  };

  for (const blockSrc of blocks) {
    params.push(...extractBlock(blockSrc, 'parameters'));
    molTypes.push(...extractBlock(blockSrc, 'molecule types'));
    seedSpecies.push(...extractBlock(blockSrc, 'seed species'));
    observables.push(...extractBlock(blockSrc, 'observables'));
    rules.push(...extractBlock(blockSrc, 'reaction rules'));
  }

  return `
begin model
begin parameters
  ${params.join('\n  ')}
end parameters

begin molecule types
  ${molTypes.join('\n  ')}
end molecule types

begin seed species
  ${seedSpecies.join('\n  ')}
end seed species

begin observables
  ${observables.join('\n  ')}
end observables

begin reaction rules
  ${rules.join('\n  ')}
end reaction rules
end model
`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, stageName: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[Hang / Timeout] ${stageName} exceeded ${timeoutMs}ms limit.`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function runPipeline(bngl: string) {
  // Step 1: Parse
  let parsed;
  try {
    parsed = parseBNGLStrict(bngl);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[Parse Failure] ${msg}`, { cause: err });
  }

  // Step 2: Network Generate
  let expanded;
  try {
    expanded = await withTimeout(generateExpandedNetwork(parsed, () => {}, () => {}), 15000, 'Network Generation');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[Network Generation Failure] ${msg}`, { cause: err });
  }

  // Step 3: ODE Solve
  try {
    await withTimeout(simulate(0, expanded, { method: 'ode', t_end: 1.0, n_steps: 10 }, { checkCancelled: () => {}, postMessage: () => {} }), 15000, 'ODE Solve');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[ODE Solve Failure] ${msg}`, { cause: err });
  }

  // Step 4: SSA Solve
  try {
    await withTimeout(simulate(0, expanded, { method: 'ssa', t_end: 1.0, n_steps: 10 }, { checkCancelled: () => {}, postMessage: () => {} }), 15000, 'SSA Solve');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[SSA Solve Failure] ${msg}`, { cause: err });
  }

  // Step 5: NFsim Solve
  try {
    await withTimeout(runNFsimSimulation(expanded, { t_end: 1.0, n_steps: 10, requireRuntime: true }), 15000, 'NFsim Solve');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[NFsim Solve Failure] ${msg}`, { cause: err });
  }
}

describe('BNG Playground Model Fuzzer', () => {
  beforeAll(async () => {
    // Read and evaluate nfsim.js in the global scope to define createNFsimModule
    const nfsimJsPath = path.join(process.cwd(), 'public/nfsim.js');
    const nfsimJsContent = fs.readFileSync(nfsimJsPath, 'utf8');
    (0, eval)(nfsimJsContent);

    const createNFsimModule = globalThis.createNFsimModule;
    if (typeof createNFsimModule !== 'function') {
      throw new Error('Could not define createNFsimModule globally');
    }

    // Read and pass loaded WASM binary Buffer directly inside Emscripten configuration
    const wasmBinary = fs.readFileSync(path.join(process.cwd(), 'public/nfsim.wasm'));

    const module = await createNFsimModule({
      wasmBinary,
      print: () => {},
      printErr: () => {}
    });

    const run = (xml: string, options: Record<string, unknown> = {}) => {
      module.ABORT = false;
      module.EXITSTATUS = 0;

      if (typeof module.runNFsim === 'function') {
        return module.runNFsim(xml, options);
      }

      const modelName = (options.modelName as string | undefined) || 'model';
      const xmlPath = `/${modelName}.xml`;
      const outPath = `/${modelName}.gdat`;

      try {
        module.FS.unlink(xmlPath);
      } catch {
        /* ignore */
      }
      try {
        module.FS.unlink(outPath);
      } catch {
        /* ignore */
      }

      module.FS.writeFile(xmlPath, xml);

      const args = ['-xml', xmlPath, '-o', outPath];
      if (options.t_end !== undefined) args.push('-sim', String(options.t_end));
      if (options.n_steps !== undefined) args.push('-oSteps', String(options.n_steps));
      if (options.seed !== undefined) args.push('-seed', String(options.seed));
      if (options.cb) args.push('-cb');

      module.callMain(args);

      return module.FS.readFile(outPath, { encoding: 'utf8' });
    };

    const reset = module.resetNFsim ? module.resetNFsim.bind(module) : undefined;

    globalThis.__nfsimRuntime = { run, reset };

    // Ensure output directory exists
    const fuzzerDir = path.join(process.cwd(), 'tests/fixtures/fuzzer');
    if (!fs.existsSync(fuzzerDir)) {
      fs.mkdirSync(fuzzerDir, { recursive: true });
    }
  });

  it('generates 50 random BNGL models and runs them through the full pipeline', async () => {
    const seed = 42; // Fixed seed for fuzzer reproducibility
    const rng = new SeededRandom(seed);
    const numModels = 50;

    for (let i = 1; i <= numModels; i++) {
      const bngl = generateModel(rng, i);
      const modelName = `model_${i}`;
      const filePath = path.join(process.cwd(), `tests/fixtures/fuzzer/${modelName}.bngl`);

      fs.writeFileSync(filePath, bngl);

      try {
        await runPipeline(bngl);
      } catch (err: unknown) {
        console.error(`Fuzzer found a reproducing crash/failure on Model ${i}:\n${bngl}`);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Model ${i} failed in pipeline:\n${msg}`, { cause: err });
      }
    }
  });
});
