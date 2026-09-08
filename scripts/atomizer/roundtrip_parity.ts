import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { parseBNGL } from '../../services/parseBNGL';
import { generateSBML } from '../../src/lib/atomizer';
import { Atomizer } from '../../src/lib/atomizer';
import { simulate } from '../../packages/engine/src/index';
import { resolveBNG2Paths } from '../../tools/bng2-paths';

type Cdat = { headers: string[]; rows: number[][] };
type Comparison = Record<string, unknown>;
type EngineTrajectory = { headers: string[]; rows: number[][] };

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outputDir = resolve(process.env.ATOMIZER_ROUNDTRIP_OUT || join(repoRoot, 'artifacts', 'atomizer-roundtrip'));
const pythonHelper = resolve(repoRoot, 'scripts/atomizer/compare_sbml_trajectories.py');
const tEnd = Number(process.env.ATOMIZER_ROUNDTRIP_T_END || '1');
const nSteps = Number(process.env.ATOMIZER_ROUNDTRIP_N_STEPS || '100');

const CORE = 'http://www.sbml.org/sbml/level3/version2/core';

const SBML_FIXTURES: Record<string, string> = {
  mass_action: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="mass_action"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="10" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="k" value="0.2" constant="true"/></listOfParameters><listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A" constant="true"/></listOfReactants><listOfProducts><speciesReference species="B" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>k</ci><ci>A</ci></apply></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
  bimolecular: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="bimolecular"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="3" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="4" constant="false" boundaryCondition="false"/><species id="C" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="k" value="0.03" constant="true"/></listOfParameters><listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A" constant="true"/><speciesReference species="B" constant="true"/></listOfReactants><listOfProducts><speciesReference species="C" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>k</ci><ci>A</ci><ci>B</ci></apply></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
  reversible: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="reversible"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="10" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="kf" value="0.2" constant="true"/><parameter id="kr" value="0.1" constant="true"/></listOfParameters><listOfReactions><reaction id="r" reversible="true"><listOfReactants><speciesReference species="A" constant="true"/></listOfReactants><listOfProducts><speciesReference species="B" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><minus/><apply><times/><ci>kf</ci><ci>A</ci></apply><apply><times/><ci>kr</ci><ci>B</ci></apply></apply></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
  custom_function: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="custom_function"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="10" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="k" value="0.2" constant="true"/></listOfParameters><listOfFunctionDefinitions><functionDefinition id="double"><math xmlns="http://www.w3.org/1998/Math/MathML"><lambda><bvar><ci>x</ci></bvar><apply><times/><ci>x</ci><cn>2</cn></apply></lambda></math></functionDefinition></listOfFunctionDefinitions><listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A" constant="true"/></listOfReactants><listOfProducts><speciesReference species="B" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><apply><ci>double</ci><ci>k</ci></apply><ci>A</ci></apply></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
  zero_order: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="zero_order"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="k" value="0.5" constant="true"/></listOfParameters><listOfReactions><reaction id="r" reversible="false"><listOfProducts><speciesReference species="A" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><ci>k</ci></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
  local_parameter: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="local_parameter"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="10" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A" constant="true"/></listOfReactants><listOfProducts><speciesReference species="B" constant="true"/></listOfProducts><kineticLaw><listOfLocalParameters><localParameter id="k_local" value="0.2"/></listOfLocalParameters><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>k_local</ci><ci>A</ci></apply></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
  non_unit_compartment: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="non_unit_compartment"><listOfCompartments><compartment id="cell" size="2" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="10" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="k" value="0.2" constant="true"/></listOfParameters><listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A" constant="true"/></listOfReactants><listOfProducts><speciesReference species="B" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>k</ci><ci>A</ci></apply></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
  assignment_rule: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="assignment_rule"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="10" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="k" value="0.2" constant="true"/><parameter id="v" value="0" constant="false"/></listOfParameters><listOfRules><assignmentRule variable="v"><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>k</ci><cn>2</cn></apply></math></assignmentRule></listOfRules><listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A" constant="true"/></listOfReactants><listOfProducts><speciesReference species="B" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>v</ci><ci>A</ci></apply></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
  piecewise: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="piecewise"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="10" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="k_fast" value="0.8" constant="true"/><parameter id="k_slow" value="0.1" constant="true"/><parameter id="threshold" value="5" constant="true"/></listOfParameters><listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A" constant="true"/></listOfReactants><listOfProducts><speciesReference species="B" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><piecewise><piece><ci>k_fast</ci><apply><gt/><ci>A</ci><ci>threshold</ci></apply></piece><otherwise><ci>k_slow</ci></otherwise></piecewise><ci>A</ci></apply></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
};

const BNGL_FIXTURES: Record<string, string> = {
  mass_action: `begin model
begin parameters
k 0.2
end parameters
begin molecule types
A()
B()
end molecule types
begin species
A() 10
B() 0
end species
begin observables
Species s0_amt A()
Species s1_amt B()
end observables
begin reaction rules
A() -> B() k
end reaction rules
begin actions
generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>1,n_steps=>100,max_num_steps=>1e8})
end actions
end model
`,
  bimolecular: `begin model
begin parameters
k 0.03
end parameters
begin molecule types
A()
B()
C()
end molecule types
begin species
A() 3
B() 4
C() 0
end species
begin observables
Species s0_amt A()
Species s1_amt B()
Species s2_amt C()
end observables
begin reaction rules
A() + B() -> C() k
end reaction rules
begin actions
generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>1,n_steps=>100,max_num_steps=>1e8})
end actions
end model
`,
  reversible: `begin model
begin parameters
kf 0.2
kr 0.1
end parameters
begin molecule types
A()
B()
end molecule types
begin species
A() 10
B() 0
end species
begin observables
Species s0_amt A()
Species s1_amt B()
end observables
begin reaction rules
A() <-> B() kf, kr
end reaction rules
begin actions
generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>1,n_steps=>100,max_num_steps=>1e8})
end actions
end model
`,
  custom_function: `begin model
begin parameters
k 0.2
end parameters
begin molecule types
A()
B()
end molecule types
begin species
A() 10
B() 0
end species
begin functions
double(x) x*2
end functions
begin observables
Species s0_amt A()
Species s1_amt B()
end observables
begin reaction rules
A() -> B() double(k)
end reaction rules
begin actions
generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>1,n_steps=>100,max_num_steps=>1e8})
end actions
end model
`,
  zero_order: `begin model
begin parameters
k 0.5
end parameters
begin molecule types
A()
end molecule types
begin species
A() 0
end species
begin observables
Species s0_amt A()
end observables
begin reaction rules
0 -> A() k
end reaction rules
begin actions
generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>1,n_steps=>100,max_num_steps=>1e8})
end actions
end model
`,
  local_parameter: `begin model
begin parameters
k_local 0.2
end parameters
begin molecule types
A()
B()
end molecule types
begin species
A() 10
B() 0
end species
begin observables
Species s0_amt A()
Species s1_amt B()
end observables
begin reaction rules
A() -> B() k_local
end reaction rules
begin actions
generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>1,n_steps=>100,max_num_steps=>1e8})
end actions
end model
`,
  non_unit_compartment: `begin model
begin parameters
k 0.2
end parameters
begin compartments
cell 3 2
end compartments
begin molecule types
A()
B()
end molecule types
begin species
A()@cell 10
B()@cell 0
end species
begin observables
Species s0_amt A()@cell
Species s1_amt B()@cell
end observables
begin reaction rules
A()@cell -> B()@cell k
end reaction rules
begin actions
generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>1,n_steps=>100,max_num_steps=>1e8})
end actions
end model
`,
  assignment_rule: `begin model
begin parameters
k 0.2
end parameters
begin molecule types
A()
B()
end molecule types
begin species
A() 10
B() 0
end species
begin functions
v() k*2
end functions
begin observables
Species s0_amt A()
Species s1_amt B()
end observables
begin reaction rules
A() -> B() v()
end reaction rules
begin actions
generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>1,n_steps=>100,max_num_steps=>1e8})
end actions
end model
`,
  piecewise: `begin model
begin parameters
k_fast 0.8
k_slow 0.1
threshold 5
end parameters
begin molecule types
A()
B()
end molecule types
begin species
A() 10
B() 0
end species
begin observables
Species A A()
Species s0_amt A()
Species s1_amt B()
end observables
begin reaction rules
A() -> B() if(A > threshold, k_fast, k_slow)
end reaction rules
begin actions
generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>1,n_steps=>100,max_num_steps=>1e8})
end actions
end model
`,
};

function canonicalLabel(value: string): string {
  let label = String(value || '').trim();
  if (label.includes('::')) label = label.slice(label.lastIndexOf('::') + 2);
  if (label.startsWith('@') && label.includes(':')) label = label.slice(label.indexOf(':') + 1);
  if (label.includes('@')) label = label.split('@')[0];
  label = label.replace(/^M_/, '').replace(/\(\)$/, '');
  return label.trim();
}

function xmlAttr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1] || '';
}

function speciesLabels(xmlPath: string): Map<string, string> {
  const xml = readFileSync(xmlPath, 'utf8');
  const labels = new Map<string, string>();
  for (const match of xml.matchAll(/<species\b([^>]*)>/gi)) {
    const attrs = match[1] || '';
    const id = xmlAttr(attrs, 'id');
    if (id) labels.set(id, canonicalLabel(xmlAttr(attrs, 'name') || id));
  }
  return labels;
}

function parseCdat(path: string): Cdat {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((line) => line.trim());
  const header = lines.find((line) => line.trim().startsWith('#'))?.replace(/^\s*#\s*/, '').trim().split(/\s+/) || [];
  const rows = lines.filter((line) => !line.trim().startsWith('#')).map((line) => line.trim().split(/\s+/).map(Number));
  return { headers: header, rows };
}

function compareCdat(
  left: { cdat: string; xml?: string },
  right: { cdat: string; xml?: string },
): Comparison {
  const a = parseCdat(left.cdat);
  const b = parseCdat(right.cdat);
  const labelsA = left.xml ? speciesLabels(left.xml) : new Map<string, string>();
  const labelsB = right.xml ? speciesLabels(right.xml) : new Map<string, string>();
  const colA = new Map<string, number>();
  const colB = new Map<string, number>();
  a.headers.slice(1).forEach((id, index) => colA.set(labelsA.get(id) || canonicalLabel(id), index + 1));
  b.headers.slice(1).forEach((id, index) => colB.set(labelsB.get(id) || canonicalLabel(id), index + 1));
  const labels = [...colA.keys()].sort();
  let mapping = 'label';
  let comparableLabels = labels;
  let missing = labels.filter((label) => !colA.has(label) || !colB.has(label));
  if (missing.length > 0 && a.headers.length === b.headers.length && colA.size === a.headers.length - 1 && colB.size === b.headers.length - 1) {
    mapping = 'order-fallback';
    comparableLabels = a.headers.slice(1).map((_, index) => `__ordered_${index}`);
    colA.clear();
    colB.clear();
    comparableLabels.forEach((label, index) => {
      colA.set(label, index + 1);
      colB.set(label, index + 1);
    });
    missing = [];
  }
  const extra = [...colB.keys()].filter((label) => !colA.has(label)).sort();
  let maxAbs = 0;
  let maxRel = 0;
  let worst: Record<string, unknown> | null = null;
  const count = Math.min(a.rows.length, b.rows.length);
  for (let row = 0; row < count; row++) {
    maxAbs = Math.max(maxAbs, Math.abs(a.rows[row][0] - b.rows[row][0]));
    for (const label of comparableLabels.filter((item) => colA.has(item) && colB.has(item))) {
      const x = a.rows[row][colA.get(label)!];
      const y = b.rows[row][colB.get(label)!];
      const abs = Math.abs(x - y);
      const rel = abs / Math.max(Math.abs(x), Math.abs(y), 1e-300);
      if (abs > maxAbs) {
        maxAbs = abs;
        worst = { species: label, row, source: x, target: y };
      }
      maxRel = Math.max(maxRel, rel);
    }
  }
  const ok = missing.length === 0 && a.rows.length === b.rows.length && maxAbs <= 1e-7;
  return { ok, mapping, points: count, sourceRows: a.rows.length, targetRows: b.rows.length, maxAbs, maxRel, missing, extra, worst };
}

async function simulateEngine(bngl: string): Promise<EngineTrajectory> {
  const model = parseBNGL(canonicalActions(bngl));
  const result = await simulate(1, model as any, {
    method: 'ode',
    t_end: tEnd,
    n_steps: nSteps,
    solver: 'cvode',
    atol: 1e-10,
    rtol: 1e-10,
  } as any, { checkCancelled: () => {}, postMessage: () => {} });
  return {
    headers: result.headers,
    rows: result.data.map((row) => result.headers.map((header) => Number(row[header]))),
  };
}

function compareEngineTrajectories(left: EngineTrajectory, right: EngineTrajectory): Comparison {
  const leftCols = new Map<string, number>();
  const rightCols = new Map<string, number>();
  left.headers.slice(1).forEach((header, index) => leftCols.set(canonicalLabel(header), index + 1));
  right.headers.slice(1).forEach((header, index) => rightCols.set(canonicalLabel(header), index + 1));
  const labels = [...leftCols.keys()].sort();
  let mapping = 'label';
  let comparableLabels = labels;
  let missing = labels.filter((label) => !leftCols.has(label) || !rightCols.has(label));
  const ignoredMissing = missing.filter((label) => !/_amt$/i.test(label));
  const requiredMissing = missing.filter((label) => /_amt$/i.test(label));
  const leftColumnCount = left.rows[0]?.length ?? left.headers.length;
  const rightColumnCount = right.rows[0]?.length ?? right.headers.length;
  if (requiredMissing.length > 0 && leftColumnCount === rightColumnCount && leftCols.size === leftColumnCount - 1 && rightCols.size === rightColumnCount - 1) {
    mapping = 'order-fallback';
    comparableLabels = left.headers.slice(1).map((_, index) => `__ordered_${index}`);
    leftCols.clear();
    rightCols.clear();
    comparableLabels.forEach((label, index) => {
      leftCols.set(label, index + 1);
      rightCols.set(label, index + 1);
    });
    missing = [];
  } else {
    comparableLabels = labels.filter((label) => !ignoredMissing.includes(label));
    missing = requiredMissing;
  }
  const extra = [...rightCols.keys()].filter((label) => !leftCols.has(label)).sort();
  const points = Math.min(left.rows.length, right.rows.length);
  let maxAbs = 0;
  let maxRel = 0;
  for (let row = 0; row < points; row++) {
    maxAbs = Math.max(maxAbs, Math.abs(left.rows[row][0] - right.rows[row][0]));
    for (const label of comparableLabels.filter((item) => leftCols.has(item) && rightCols.has(item))) {
      const x = left.rows[row][leftCols.get(label)!];
      const y = right.rows[row][rightCols.get(label)!];
      maxAbs = Math.max(maxAbs, Math.abs(x - y));
      maxRel = Math.max(maxRel, Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1e-300));
    }
  }
  return {
    ok: missing.length === 0 && left.rows.length === right.rows.length && maxAbs <= 1e-7,
    mapping,
    points,
    maxAbs,
    maxRel,
    missing,
    ignoredMissing,
    extra,
    leftHeaders: left.headers,
    rightHeaders: right.headers,
  };
}

function canonicalActions(bngl: string, writeInitial = false): string {
  const write = writeInitial ? '    writeSBML({suffix=>"initial"})\n' : '';
  const block = `begin actions\n    generate_network({overwrite=>1})\n${write}    simulate({method=>"ode",t_end=>${tEnd},n_steps=>${nSteps},max_num_steps=>1e8})\nend actions`;
  if (/begin\s+actions/i.test(bngl)) return bngl.replace(/begin\s+actions[\s\S]*?end\s+actions/i, block);
  return `${bngl.trim()}\n${block}\n`;
}

function runBng2(label: string, bngl: string): { dir: string; xml?: string; cdat: string } {
  const paths = resolveBNG2Paths();
  if (!paths.bng2pl) throw new Error('BNG2.pl was not found; set BNG2_PATH or install BioNetGen');
  const dir = mkdtempSync(join(tmpdir(), `atomizer-roundtrip-${label}-`));
  const fileName = `${label}.bngl`;
  writeFileSync(join(dir, fileName), bngl);
  const result = spawnSync(process.env.PERL_CMD || 'perl', [process.env.BNG2_PATH || paths.bng2pl, fileName, '--outdir', dir], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, PERL5LIB: process.env.PERL5LIB || paths.perl5lib || '' },
  });
  if (result.status !== 0) throw new Error(`BNG2 failed for ${label}: ${result.stdout}\n${result.stderr}`);
  const files = readdirSync(dir);
  const xml = files.find((file) => file.endsWith('_initial.xml')) || files.find((file) => file.endsWith('.xml'));
  const cdat = files.find((file) => file.endsWith('.cdat'));
  if (!cdat) throw new Error(`BNG2 did not produce CDAT for ${label}: ${files.join(', ')}`);
  return { dir, xml: xml ? join(dir, xml) : undefined, cdat: join(dir, cdat) };
}

function compareRoadRunner(source: string, target: string): Comparison {
  const envName = process.env.ATOMIZER_ROUNDTRIP_CONDA_ENV || 'atomizer-sbml-roundtrip';
  const python = process.env.ATOMIZER_RR_PYTHON;
  const command = python ? [python, pythonHelper] : ['conda', 'run', '-n', envName, 'python', pythonHelper];
  const result = spawnSync(command[0], [...command.slice(1), source, target, '--t-end', String(tEnd), '--n-steps', String(nSteps)], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const parsed = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : { ok: false, error: result.stderr || 'No comparator output' };
  if (result.status !== 0 && parsed.ok !== false) parsed.ok = false;
  return parsed;
}

function writeJson(name: string, value: unknown): string {
  mkdirSync(outputDir, { recursive: true });
  const path = join(outputDir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

async function main(): Promise<void> {
  mkdirSync(outputDir, { recursive: true });
  const atomizer = new Atomizer({ quietMode: true, useId: true, atomize: false });
  await atomizer.initialize();
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    settings: { tEnd, nSteps, rrEnv: process.env.ATOMIZER_ROUNDTRIP_CONDA_ENV || 'atomizer-sbml-roundtrip' },
    sbmlToBnglToSbml: {},
    bnglToSbmlToBngl: {},
  };

  for (const [name, source] of Object.entries(SBML_FIXTURES)) {
    const result = await atomizer.atomize(source);
    if (!result.success) throw new Error(`SBML fixture ${name} did not atomize: ${result.error}`);
    const strict = parseBNGL(result.bngl);
    const targetModel = parseBNGL(canonicalActions(result.bngl));
    const targetXml = await generateSBML(targetModel as any);
    const targetDir = mkdtempSync(join(tmpdir(), `atomizer-sbml-roundtrip-${name}-`));
    const targetPath = join(targetDir, `${name}-target.xml`);
    writeFileSync(targetPath, targetXml);
    const sourceFile = join(targetDir, `${name}-source.xml`);
    writeFileSync(sourceFile, source);
    (report.sbmlToBnglToSbml as Record<string, unknown>)[name] = {
      atomized: true,
      strictParse: !!strict,
      bnglChars: result.bngl.length,
      diagnostics: result.log.filter((entry) => /SBM0(2|1|22)|ATM/.test(entry.code || '')).slice(-20),
      trajectory: compareRoadRunner(sourceFile, targetPath),
      targetXml: targetPath,
    };
  }

  for (const [name, source] of Object.entries(BNGL_FIXTURES)) {
    const parsed = parseBNGL(source);
    const generated = await generateSBML(parsed as any);
    const generatedDir = mkdtempSync(join(tmpdir(), `atomizer-bngl-export-${name}-`));
    const generatedPath = join(generatedDir, `${name}.xml`);
    writeFileSync(generatedPath, generated);
    const result = await atomizer.atomize(generated);
    if (!result.success) throw new Error(`BNGL fixture ${name} exported SBML did not atomize: ${result.error}`);
    const strict = parseBNGL(result.bngl);
    const originalEngine = await simulateEngine(source);
    const targetEngine = await simulateEngine(result.bngl);
    let nativeTrajectory: Comparison = { ok: false, skipped: true, reason: 'BNG2 native run not attempted' };
    try {
      const original = runBng2(`${name}-original`, canonicalActions(source));
      const target = runBng2(`${name}-bngl-roundtrip`, canonicalActions(result.bngl));
      nativeTrajectory = compareCdat(original, target);
    } catch (error) {
      nativeTrajectory = { ok: false, skipped: true, reason: String(error) };
    }
    const targetModel = parseBNGL(canonicalActions(result.bngl));
    const targetXml = await generateSBML(targetModel as any);
    const targetDir = mkdtempSync(join(tmpdir(), `atomizer-bngl-roundtrip-${name}-`));
    const targetXmlPath = join(targetDir, `${name}-target.xml`);
    writeFileSync(targetXmlPath, targetXml);
    (report.bnglToSbmlToBngl as Record<string, unknown>)[name] = {
      generatedSbmlL3V2: generated.includes('level3/version2/core'),
      strictParse: !!strict,
      bnglChars: result.bngl.length,
      trajectory: compareEngineTrajectories(originalEngine, targetEngine),
      nativeBng2Trajectory: nativeTrajectory,
      sbmlTrajectory: compareRoadRunner(generatedPath, targetXmlPath),
      generatedXml: generatedPath,
      targetXml: targetXmlPath,
    };
  }

  const path = writeJson('roundtrip-parity.json', report);
  console.log(JSON.stringify({ report: path, reportData: report }, null, 2));
  const failures = [...Object.values(report.sbmlToBnglToSbml as Record<string, any>), ...Object.values(report.bnglToSbmlToBngl as Record<string, any>)]
    .filter((entry: any) => !entry.strictParse || !entry.trajectory?.ok || (entry.sbmlTrajectory && !entry.sbmlTrajectory.ok));
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
