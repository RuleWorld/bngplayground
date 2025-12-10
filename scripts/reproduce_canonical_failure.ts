
import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical.ts';

// Helper to get local signature
function getLocalSignature(mol: any): string {
  const compSigs = mol.components.map((comp: any) => {
    let sig = comp.name;
    if (comp.state && comp.state !== '?') sig += `~${comp.state}`;
    return sig;
  });
  compSigs.sort();
  return `${mol.name}(${compSigs.join(',')})`;
}

async function testCanonicalization() {
  console.log('--- Testing Canonical Stability for S-R-R-S Isomers ---');

  // Case 1: S(NSH2~C)-R-R-S(NSH2~O)
  const iso1_str = "R(DD!1,Y2~P!2).R(DD!1,Y2~P!3).S(CSH2!2,NSH2~C,PTP~C).S(CSH2!3,NSH2~O,PTP~O)";

  // Case 2: S(NSH2~O)-R-R-S(NSH2~C) (Swapped S molecules)
  const iso2_str = "R(DD!1,Y2~P!2).R(DD!1,Y2~P!3).S(CSH2!2,NSH2~O,PTP~O).S(CSH2!3,NSH2~C,PTP~C)";

  const g1 = BNGLParser.parseSpeciesGraph(iso1_str);
  const g2 = BNGLParser.parseSpeciesGraph(iso2_str);

  console.log('Graph 1:', g1.toString());
  g1.molecules.forEach((m, i) => console.log(`  G1 Mol ${i}: ${m.name} -> ${getLocalSignature(m)}`));

  console.log('Graph 2:', g2.toString());
  g2.molecules.forEach((m, i) => console.log(`  G2 Mol ${i}: ${m.name} -> ${getLocalSignature(m)}`));

  // Clear cached canonical forms 
  (g1 as any).cachedCanonical = undefined;
  (g2 as any).cachedCanonical = undefined;
  
  const can1 = GraphCanonicalizer.canonicalize(g1);
  const can2 = GraphCanonicalizer.canonicalize(g2);

  console.log(`\nCanonical 1: ${can1}`);
  console.log(`Canonical 2: ${can2}`);

  if (can1 === can2) {
    console.log('\n✓ SUCCESS: Canonical strings are IDENTICAL (graphs are isomorphic)');
  } else {
    console.error('\n✗ FAILURE: Canonical strings DIFFERENT! Isomorphism detection failed.');
  }
}

testCanonicalization().catch(console.error);
