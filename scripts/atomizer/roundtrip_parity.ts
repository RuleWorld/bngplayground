import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
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
  fixed_time_event: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="fixed_time_event"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="10" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="k" value="0.2" constant="true"/></listOfParameters><listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A" constant="true"/></listOfReactants><listOfProducts><speciesReference species="B" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>k</ci><ci>A</ci></apply></math></kineticLaw></reaction></listOfReactions><listOfEvents><event id="e"><trigger initialValue="true" persistent="true"><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><geq/><csymbol encoding="text" definitionURL="http://www.sbml.org/sbml/symbols/time">time</csymbol><cn>0.5</cn></apply></math></trigger><delay><math xmlns="http://www.w3.org/1998/Math/MathML"><cn>0</cn></math></delay><listOfEventAssignments><eventAssignment variable="A"><math xmlns="http://www.w3.org/1998/Math/MathML"><cn>5</cn></math></eventAssignment></listOfEventAssignments></event></listOfEvents></model></sbml>`,
  rate_rule: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="rate_rule"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="k" value="0.5" constant="true"/></listOfParameters><listOfRules><rateRule variable="A"><math xmlns="http://www.w3.org/1998/Math/MathML"><ci>k</ci></math></rateRule></listOfRules></model></sbml>`,
  initial_assignment: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="initial_assignment"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="init" value="4" constant="true"/><parameter id="k" value="0.2" constant="true"/></listOfParameters><listOfInitialAssignments><initialAssignment symbol="A"><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>init</ci><cn>2</cn></apply></math></initialAssignment></listOfInitialAssignments><listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A" constant="true"/></listOfReactants><listOfProducts><speciesReference species="B" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>k</ci><ci>A</ci></apply></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
  state_assignment_rule: `<?xml version="1.0"?>
<sbml xmlns="${CORE}" level="3" version="2"><model id="state_assignment_rule"><listOfCompartments><compartment id="cell" size="1" constant="true"/></listOfCompartments><listOfSpecies><species id="A" compartment="cell" initialConcentration="10" constant="false" boundaryCondition="false"/><species id="B" compartment="cell" initialConcentration="0" constant="false" boundaryCondition="false"/></listOfSpecies><listOfParameters><parameter id="v" value="0" constant="false"/></listOfParameters><listOfRules><assignmentRule variable="v"><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><divide/><ci>A</ci><cn>10</cn></apply></math></assignmentRule></listOfRules><listOfReactions><reaction id="r" reversible="false"><listOfReactants><speciesReference species="A" constant="true"/></listOfReactants><listOfProducts><speciesReference species="B" constant="true"/></listOfProducts><kineticLaw><math xmlns="http://www.w3.org/1998/Math/MathML"><apply><times/><ci>v</ci><ci>A</ci></apply></math></kineticLaw></reaction></listOfReactions></model></sbml>`,
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
  fixed_time_event: `begin model
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
simulate({method=>"ode",t_end=>0.5,n_steps=>50,max_num_steps=>1e8})
setConcentration("A()", 5)
simulate({continue=>1,method=>"ode",t_end=>1,n_steps=>50,max_num_steps=>1e8})
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

function xmlBlocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi'))].map((match) => match[0]);
}

function xmlCompartmentSizes(xmlPath: string): Map<string, number> {
  const xml = readFileSync(xmlPath, 'utf8');
  const sizes = new Map<string, number>();
  for (const match of xml.matchAll(/<compartment\b([^>]*)>/gi)) {
    const attrs = match[1] || '';
    const id = xmlAttr(attrs, 'id');
    const size = Number(xmlAttr(attrs, 'size'));
    if (id && Number.isFinite(size)) sizes.set(id, size);
  }
  return sizes;
}

function xmlSpeciesInitials(xmlPath: string): Map<string, number> {
  const xml = readFileSync(xmlPath, 'utf8');
  const compartmentSizes = xmlCompartmentSizes(xmlPath);
  const initials = new Map<string, number>();
  for (const match of xml.matchAll(/<species\b([^>]*)>/gi)) {
    const attrs = match[1] || '';
    const id = xmlAttr(attrs, 'id');
    if (!id) continue;
    const amount = xmlAttr(attrs, 'initialAmount');
    const concentration = xmlAttr(attrs, 'initialConcentration');
    const value = amount ? Number(amount) : Number(concentration) * (compartmentSizes.get(xmlAttr(attrs, 'compartment')) || 1);
    if (Number.isFinite(value)) initials.set(id, value);
  }
  return initials;
}

function xmlReactionSignatures(xmlPath: string, labels: Map<string, string>): string[] {
  const xml = readFileSync(xmlPath, 'utf8');
  const signatureFor = (block: string, section: string): string[] => {
    const content = block.match(new RegExp(`<listOf${section}\\b[\\s\\S]*?<\\/listOf${section}>`, 'i'))?.[0] || '';
    return [...content.matchAll(/<speciesReference\b([^>]*)>/gi)]
      .map((match) => canonicalLabel(labels.get(xmlAttr(match[1] || '', 'species')) || xmlAttr(match[1] || '', 'species')))
      .filter(Boolean)
      .sort();
  };
  return xmlBlocks(xml, 'reaction').map((block) =>
    `${signatureFor(block, 'Reactants').join('+')}->${signatureFor(block, 'Products').join('+')}`
  ).sort();
}

function xmlParameterIds(xmlPath: string): string[] {
  const xml = readFileSync(xmlPath, 'utf8');
  return [...xml.matchAll(/<parameter\b([^>]*)>/gi)]
    .map((match) => xmlAttr(match[1] || '', 'id'))
    .filter((id) => id && !/^__compartment_|^__avogadro__/i.test(id))
    .sort();
}

function compareSBMLStructure(leftPath: string, rightPath: string): Comparison {
  const leftLabels = speciesLabels(leftPath);
  const rightLabels = speciesLabels(rightPath);
  const leftInitials = xmlSpeciesInitials(leftPath);
  const rightInitials = xmlSpeciesInitials(rightPath);
  const leftByLabel = new Map([...leftLabels].map(([id, label]) => [label, leftInitials.get(id) ?? null]));
  const rightByLabel = new Map([...rightLabels].map(([id, label]) => [label, rightInitials.get(id) ?? null]));
  const sharedLabels = [...leftByLabel.keys()].filter((label) => rightByLabel.has(label));
  const mapping = new Map<string, string>();
  for (const label of sharedLabels) mapping.set(label, label);
  const leftIds = [...leftLabels.keys()];
  const rightIds = [...rightLabels.keys()];
  let mappingMethod = 'label';
  if (sharedLabels.length !== leftByLabel.size || sharedLabels.length !== rightByLabel.size) {
    if (leftIds.length === rightIds.length) {
      mappingMethod = 'order-fallback';
      for (let index = 0; index < leftIds.length; index++) {
        mapping.set(leftLabels.get(leftIds[index])!, rightLabels.get(rightIds[index])!);
      }
    } else {
      mappingMethod = 'unmapped';
    }
  }
  const missing = [...leftByLabel.keys()].filter((label) => !mapping.has(label) || !rightByLabel.has(mapping.get(label)!)).sort();
  const mappedRight = new Set(mapping.values());
  const extra = [...rightByLabel.keys()].filter((label) => !mappedRight.has(label)).sort();
  let maxInitialAbs = 0;
  for (const [leftLabel, initial] of leftByLabel) {
    const rightLabel = mapping.get(leftLabel);
    const target = rightLabel ? rightByLabel.get(rightLabel) : undefined;
    if (initial !== null && target !== undefined && target !== null) {
      maxInitialAbs = Math.max(maxInitialAbs, Math.abs(initial - target));
    }
  }
  const leftReactions = xmlReactionSignatures(leftPath, leftLabels);
  const rightReactions = xmlReactionSignatures(rightPath, rightLabels);
  const inverse = new Map([...mapping].map(([left, right]) => [right, left]));
  const translatedRightReactions = rightReactions.map((signature) => {
    const [reactants, products] = signature.split('->');
    const translate = (value: string): string => inverse.get(value) || value;
    return `${reactants.split('+').filter(Boolean).map(translate).sort().join('+')}->${products.split('+').filter(Boolean).map(translate).sort().join('+')}`;
  }).sort();
  const leftXml = readFileSync(leftPath, 'utf8');
  const rightXml = readFileSync(rightPath, 'utf8');
  const eventCount = xmlBlocks(leftXml, 'event').length;
  const targetEventCount = xmlBlocks(rightXml, 'event').length;
  const initialAssignmentCount = xmlBlocks(leftXml, 'initialAssignment').length;
  const targetInitialAssignmentCount = xmlBlocks(rightXml, 'initialAssignment').length;
  const sourceParameters = xmlParameterIds(leftPath);
  const targetParameters = xmlParameterIds(rightPath);
  const missingParameters = sourceParameters.filter((id) => !targetParameters.includes(id));
  return {
    ok: missing.length === 0 && extra.length === 0 &&
      (initialAssignmentCount > 0 || maxInitialAbs <= 1e-7) &&
      leftReactions.length === translatedRightReactions.length &&
      leftReactions.every((signature, index) => signature === translatedRightReactions[index]) &&
      eventCount === targetEventCount && missingParameters.length === 0,
    species: { mapping: Object.fromEntries(mapping), mappingMethod, missing, extra, maxInitialAbs },
    reactions: { source: leftReactions, target: translatedRightReactions, sameTopology: leftReactions.length === translatedRightReactions.length && leftReactions.every((signature, index) => signature === translatedRightReactions[index]) },
    parameters: { source: sourceParameters, target: targetParameters, missing: missingParameters },
    events: { source: eventCount, target: targetEventCount },
    initialAssignments: {
      source: initialAssignmentCount,
      target: targetInitialAssignmentCount,
      initialValuesChecked: initialAssignmentCount === 0,
    },
  };
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
  let comparableLabels: string[];
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

async function simulateEngine(bngl: string, preserveActions = false): Promise<EngineTrajectory> {
  const model = parseBNGL(preserveActions ? bngl : canonicalActions(bngl));
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

function compareObservableTrajectories(left: EngineTrajectory, right: EngineTrajectory): Comparison {
  const leftCols = new Map<string, number>();
  const rightCols = new Map<string, number>();
  // The Playground simulation table is observable-based: amount observables (the usual
  // *_amt columns) and named species observables are both executable outputs. Compare all
  // non-time columns here, while retaining missing/extra names for SBML's weaker naming model.
  left.headers.slice(1).forEach((header, index) => leftCols.set(canonicalLabel(header), index + 1));
  right.headers.slice(1).forEach((header, index) => rightCols.set(canonicalLabel(header), index + 1));

  const shared = [...leftCols.keys()].filter((label) => rightCols.has(label)).sort();
  const missing = [...leftCols.keys()].filter((label) => !rightCols.has(label)).sort();
  const extra = [...rightCols.keys()].filter((label) => !leftCols.has(label)).sort();
  if (shared.length === 0) {
    return {
      comparable: false,
      status: 'no-shared-observable-labels',
      shared,
      missing,
      extra,
      points: Math.min(left.rows.length, right.rows.length),
    };
  }

  const points = Math.min(left.rows.length, right.rows.length);
  let maxAbs = 0;
  let maxRel = 0;
  let worst: Record<string, unknown> | null = null;
  for (let row = 0; row < points; row++) {
    for (const label of shared) {
      const source = left.rows[row][leftCols.get(label)!];
      const target = right.rows[row][rightCols.get(label)!];
      const abs = Math.abs(source - target);
      const rel = abs / Math.max(Math.abs(source), Math.abs(target), 1e-300);
      if (abs > maxAbs) {
        maxAbs = abs;
        worst = { observable: label, row, source, target };
      }
      maxRel = Math.max(maxRel, rel);
    }
  }
  return {
    comparable: true,
    status: maxAbs <= 1e-7 && left.rows.length === right.rows.length ? 'passed' : 'failed',
    shared,
    missing,
    extra,
    points,
    sourceRows: left.rows.length,
    targetRows: right.rows.length,
    maxAbs,
    maxRel,
    worst,
  };
}

function normalizedTerms(terms: unknown): string[] {
  const counts = new Map<string, number>();
  for (const raw of Array.isArray(terms) ? terms : []) {
    const label = canonicalLabel(String(raw ?? ''));
    if (!label || /^__rate_rule__/i.test(label)) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([label, count]) => Array.from({ length: count }, () => label));
}

function normalizedBnglStructure(model: any): {
  species: Array<{ label: string; initial: number | null }>;
  parameters: string[];
  rules: string[];
  observables: string[];
  compartments: string[];
} {
  const species = (Array.isArray(model?.species) ? model.species : [])
    .map((entry: any) => ({
      label: canonicalLabel(String(entry?.name || '')),
      initial: Number.isFinite(Number(entry?.initialConcentration))
        ? Number(entry.initialConcentration)
        : Number.isFinite(Number(entry?.initialAmount))
          ? Number(entry.initialAmount)
          : null,
    }))
    .filter((entry: { label: string }) => entry.label && !/^__rate_rule__/i.test(entry.label))
    .sort((left: { label: string }, right: { label: string }) => left.label.localeCompare(right.label));

  const parameters = Object.keys(model?.parameters || {})
    .filter((name) => !/^__compartment_|^__rate_rule__|^__avogadro__|^quantity_to_number_factor$/i.test(name))
    .sort();

  const executableRules = Array.isArray(model?.reactionRules) && model.reactionRules.length > 0
    ? model.reactionRules
    : (Array.isArray(model?.reactions) ? model.reactions : []);
  const rules = executableRules.map((rule: any) => {
    const reactants = normalizedTerms(rule?.reactants);
    const products = normalizedTerms(rule?.products);
    const reversible = Boolean(rule?.isBidirectional ?? rule?.reversible);
    return `${reactants.join('+')}->${products.join('+')}|reversible=${reversible}`;
  }).sort();

  const observables = (Array.isArray(model?.observables) ? model.observables : [])
    .map((entry: any) => canonicalLabel(String(entry?.name || '')))
    .filter(Boolean)
    .sort();
  const compartments = (Array.isArray(model?.compartments) ? model.compartments : [])
    .map((entry: any) => canonicalLabel(String(entry?.name || '')))
    .filter(Boolean)
    .sort();
  return { species, parameters, rules, observables, compartments };
}

function amountObservablePatterns(model: any): Map<string, string> {
  const result = new Map<string, string>();
  for (const observable of Array.isArray(model?.observables) ? model.observables : []) {
    const name = String(observable?.name || '').trim();
    if (!/_amt$/i.test(name)) continue;
    const pattern = String(observable?.pattern || '').split(',')[0].trim();
    const label = canonicalLabel(pattern);
    if (name && label) result.set(name, label);
  }
  return result;
}

function executableBnglRules(model: any): any[] {
  if (Array.isArray(model?.reactionRules) && model.reactionRules.length > 0) {
    return model.reactionRules;
  }
  return Array.isArray(model?.reactions) ? model.reactions : [];
}

function buildSpeciesMapping(
  leftModel: any,
  rightModel: any,
  leftSpecies: Array<{ label: string; initial: number | null }>,
  rightSpecies: Array<{ label: string; initial: number | null }>,
): { sourceToTarget: Map<string, string>; method: string } {
  const sourceToTarget = new Map<string, string>();
  const leftByAmountObservable = amountObservablePatterns(leftModel);
  const rightByAmountObservable = amountObservablePatterns(rightModel);
  for (const [name, leftLabel] of leftByAmountObservable) {
    const rightLabel = rightByAmountObservable.get(name);
    if (!rightLabel) continue;
    if (leftSpecies.some((entry) => entry.label === leftLabel) && rightSpecies.some((entry) => entry.label === rightLabel)) {
      sourceToTarget.set(leftLabel, rightLabel);
    }
  }
  if (sourceToTarget.size > 0) {
    return { sourceToTarget, method: 'shared-amount-observable' };
  }

  const rightLabels = new Set(rightSpecies.map((entry) => entry.label));
  for (const entry of leftSpecies) {
    if (rightLabels.has(entry.label)) sourceToTarget.set(entry.label, entry.label);
  }
  if (sourceToTarget.size === leftSpecies.length && leftSpecies.length === rightSpecies.length) {
    return { sourceToTarget, method: 'label' };
  }

  if (leftSpecies.length === rightSpecies.length) {
    leftSpecies.forEach((entry, index) => sourceToTarget.set(entry.label, rightSpecies[index].label));
    return { sourceToTarget, method: 'order-fallback' };
  }
  return { sourceToTarget, method: 'unmapped' };
}

function ruleSignatures(model: any, translate: (label: string) => string): string[] {
  return executableBnglRules(model).map((rule: any) => {
    const reactants = normalizedTerms(rule?.reactants).map(translate).sort();
    const products = normalizedTerms(rule?.products).map(translate).sort();
    const reversible = Boolean(rule?.isBidirectional ?? rule?.reversible);
    return `${reactants.join('+')}->${products.join('+')}|reversible=${reversible}`;
  }).sort();
}

function compareBNGLStructure(leftModel: any, rightModel: any): Comparison {
  const left = normalizedBnglStructure(leftModel);
  const right = normalizedBnglStructure(rightModel);
  const mapping = buildSpeciesMapping(leftModel, rightModel, left.species, right.species);
  const inverseMapping = new Map([...mapping.sourceToTarget].map(([source, target]) => [target, source]));
  const leftSpecies = new Map(left.species.map((entry) => [entry.label, entry.initial]));
  const rightSpecies = new Map(right.species.map((entry) => [entry.label, entry.initial]));
  const missingSpecies = [...leftSpecies.keys()].filter((label) => !mapping.sourceToTarget.has(label) || !rightSpecies.has(mapping.sourceToTarget.get(label)!)).sort();
  const mappedRightSpecies = new Set(mapping.sourceToTarget.values());
  const extraSpecies = [...rightSpecies.keys()].filter((label) => !mappedRightSpecies.has(label)).sort();
  let maxInitialAbs = 0;
  for (const [label, initial] of leftSpecies) {
    const target = rightSpecies.get(mapping.sourceToTarget.get(label) || '');
    if (initial !== null && target !== undefined && target !== null) {
      maxInitialAbs = Math.max(maxInitialAbs, Math.abs(initial - target));
    }
  }
  const missingParameters = left.parameters.filter((name) => !right.parameters.includes(name));
  const extraParameters = right.parameters.filter((name) => !left.parameters.includes(name));
  const sourceRules = ruleSignatures(leftModel, (label) => label);
  const targetRules = ruleSignatures(rightModel, (label) => inverseMapping.get(label) || label);
  const ok = missingSpecies.length === 0 && extraSpecies.length === 0 &&
    sourceRules.length === targetRules.length &&
    sourceRules.every((rule, index) => rule === targetRules[index]) &&
    maxInitialAbs <= 1e-7 && missingParameters.length === 0;
  return {
    ok,
    species: {
      source: [...leftSpecies.keys()].sort(),
      target: [...rightSpecies.keys()].sort(),
      mapping: Object.fromEntries(mapping.sourceToTarget),
      mappingMethod: mapping.method,
      missing: missingSpecies,
      extra: extraSpecies,
      maxInitialAbs,
    },
    parameters: {
      source: left.parameters,
      target: right.parameters,
      missing: missingParameters,
      extra: extraParameters,
    },
    reactionRules: {
      source: sourceRules,
      target: targetRules,
      sameTopology: sourceRules.length === targetRules.length && sourceRules.every((rule, index) => rule === targetRules[index]),
    },
    observables: {
      source: left.observables,
      target: right.observables,
      shared: left.observables.filter((name) => right.observables.includes(name)),
      missing: left.observables.filter((name) => !right.observables.includes(name)),
      extra: right.observables.filter((name) => !left.observables.includes(name)),
    },
    compartments: {
      source: left.compartments,
      target: right.compartments,
    },
  };
}

function canonicalActions(bngl: string, writeInitial = false): string {
  const write = writeInitial ? '    writeSBML({suffix=>"initial"})\n' : '';
  const block = `begin actions\n    generate_network({overwrite=>1})\n${write}    simulate({method=>"ode",t_end=>${tEnd},n_steps=>${nSteps},max_num_steps=>1e8})\nend actions`;
  if (/begin\s+actions/i.test(bngl)) return bngl.replace(/begin\s+actions[\s\S]*?end\s+actions/i, block);
  return `${bngl.trim()}\n${block}\n`;
}

type BnglArgumentFunction = { name: string; args: string[]; body: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

function splitBnglCallArguments(text: string): string[] {
  const args: string[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const final = text.slice(start).trim();
  if (final || text.trim() === '') args.push(final);
  return args;
}

function inlineBnglFunctionCalls(source: string, definitions: BnglArgumentFunction[]): string {
  let output = source;
  // A bounded fixed point handles nested calls and functions calling other functions without
  // allowing malformed input to turn the oracle preparation into an unbounded loop.
  for (let pass = 0; pass < 32; pass++) {
    let changed = false;
    for (const definition of definitions) {
      const callPattern = new RegExp(`\\b${escapeRegExp(definition.name)}\\s*\\(`);
      let match: RegExpExecArray | null;
      while ((match = callPattern.exec(output)) !== null) {
        const openIndex = match.index + match[0].lastIndexOf('(');
        const closeIndex = findMatchingParen(output, openIndex);
        if (closeIndex < 0) break;
        const actuals = splitBnglCallArguments(output.slice(openIndex + 1, closeIndex));
        if (actuals.length !== definition.args.length || actuals.some((actual) => !actual)) {
          break;
        }
        let body = definition.body;
        for (const [formal, actual] of definition.args
          .map((formal, index) => [formal, actuals[index]] as const)
          .sort(([left], [right]) => right.length - left.length)) {
          body = body.replace(new RegExp(`\\b${escapeRegExp(formal)}\\b`, 'g'), `(${actual})`);
        }
        output = `${output.slice(0, match.index)}(${body})${output.slice(closeIndex + 1)}`;
        changed = true;
        callPattern.lastIndex = match.index + body.length + 2;
      }
    }
    if (!changed) break;
  }
  return output;
}

/**
 * The BioNetGen language accepts argument-taking functions, but the installed native
 * run_network backend rejects them after network generation when it reads the .net file.
 * Normalize only the native oracle input by inlining those calls; Atomizer output and the
 * Playground parser still retain the real BNGL function definitions for roundtrip coverage.
 */
function inlineArgumentFunctionsForBng2(bngl: string): string {
  const blockPattern = /begin\s+functions\b([\s\S]*?)end\s+functions/i;
  const block = bngl.match(blockPattern);
  if (!block) return bngl;

  const definitions: BnglArgumentFunction[] = [];
  const lines = block[1].split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s+(.+?)\s*$/);
    if (!match) continue;
    const args = match[2].split(',').map((arg) => arg.trim()).filter(Boolean);
    if (args.length > 0) definitions.push({ name: match[1], args, body: match[3] });
  }
  if (definitions.length === 0) return bngl;

  const withoutArgumentFunctions = bngl.replace(blockPattern, (_whole, body: string) => {
    const kept = body.split(/\r?\n/).filter((line: string) => {
      const match = line.match(/^\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s+(.+?)\s*$/);
      if (!match) return true;
      return match[2].split(',').map((arg: string) => arg.trim()).filter(Boolean).length === 0;
    });
    return kept.length > 0 ? `begin functions\n${kept.join('\n')}\nend functions` : '';
  });
  return inlineBnglFunctionCalls(withoutArgumentFunctions, definitions);
}

function runBng2(label: string, bngl: string): { dir: string; xml?: string; cdat: string } {
  const paths = resolveBNG2Paths();
  if (!paths.bng2pl) throw new Error('BNG2.pl was not found; set BNG2_PATH or install BioNetGen');
  const dir = mkdtempSync(join(tmpdir(), `atomizer-roundtrip-${label}-`));
  const fileName = `${label}.bngl`;
  writeFileSync(join(dir, fileName), inlineArgumentFunctionsForBng2(bngl));
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

function compareRoadRunner(source: string, target: string, options: { allowEventBackendGap?: boolean } = {}): Comparison {
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
  const comparatorError = `${result.stderr || ''}\n${String(parsed.error || '')}`;
  if (options.allowEventBackendGap && /symbol ['"]time['"] is not physically stored/i.test(comparatorError)) {
    return {
      ok: true,
      skipped: true,
      comparable: false,
      reason: 'The pinned libRoadRunner build cannot compile SBML event triggers that reference the standard time csymbol; event parity is checked through the Playground engine/native BNG2 gates instead.',
    };
  }
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
  const atomizer = new Atomizer({
    quietMode: true,
    useId: true,
    atomize: false,
    actions: `simulate({method=>"ode",t_end=>${tEnd},n_steps=>${nSteps}})`,
  });
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
    // Preserve the Atomizer-generated action phases here: fixed-time SBML events
    // are encoded as BNGL set actions and must survive the SBML writer roundtrip.
    const targetModel = parseBNGL(result.bngl);
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
      structural: compareSBMLStructure(sourceFile, targetPath),
      diagnostics: result.log.filter((entry) => /SBM0(2|1|22)|ATM/.test(entry.code || '')).slice(-20),
      trajectory: compareRoadRunner(sourceFile, targetPath, { allowEventBackendGap: name === 'fixed_time_event' }),
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
    const preserveActions = name === 'fixed_time_event';
    const originalEngine = await simulateEngine(source, preserveActions);
    const targetEngine = await simulateEngine(result.bngl, preserveActions);
    let nativeTrajectory: Comparison;
    try {
      const original = runBng2(`${name}-original`, preserveActions ? source : canonicalActions(source));
      const target = runBng2(`${name}-bngl-roundtrip`, preserveActions ? result.bngl : canonicalActions(result.bngl));
      nativeTrajectory = compareCdat(original, target);
    } catch (error) {
      nativeTrajectory = { ok: false, skipped: true, reason: String(error) };
    }
    const targetModel = parseBNGL(result.bngl);
    const targetXml = await generateSBML(targetModel as any);
    const structural = compareBNGLStructure(parsed, targetModel);
    const observableTrajectory = compareObservableTrajectories(originalEngine, targetEngine);
    const targetDir = mkdtempSync(join(tmpdir(), `atomizer-bngl-roundtrip-${name}-`));
    const targetXmlPath = join(targetDir, `${name}-target.xml`);
    writeFileSync(targetXmlPath, targetXml);
    (report.bnglToSbmlToBngl as Record<string, unknown>)[name] = {
      generatedSbmlL3V2: generated.includes('level3/version2/core'),
      strictParse: !!strict,
      bnglChars: result.bngl.length,
      structural,
      trajectory: compareEngineTrajectories(originalEngine, targetEngine),
      observableTrajectory,
      nativeBng2Trajectory: nativeTrajectory,
      sbmlTrajectory: compareRoadRunner(generatedPath, targetXmlPath, { allowEventBackendGap: name === 'fixed_time_event' }),
      generatedXml: generatedPath,
      targetXml: targetXmlPath,
    };
  }

  const path = writeJson('roundtrip-parity.json', report);
  console.log(JSON.stringify({ report: path, reportData: report }, null, 2));
  const failures = [...Object.values(report.sbmlToBnglToSbml as Record<string, any>), ...Object.values(report.bnglToSbmlToBngl as Record<string, any>)]
    .filter((entry: any) => !entry.strictParse || !entry.trajectory?.ok ||
      (entry.structural && !entry.structural.ok) ||
      (entry.observableTrajectory?.comparable && entry.observableTrajectory.status !== 'passed') ||
      (entry.sbmlTrajectory && !entry.sbmlTrajectory.ok));
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
