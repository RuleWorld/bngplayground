
import * as fs from 'fs';
import * as path from 'path';
import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical.ts';

// Helper to parse net file for species
function parseNetFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const species: string[] = [];
  let inSpecies = false;
  const speciesRegex = /^\s*\d+\s+([A-Za-z0-9_.(),!~]+)\s+/; // Extract BNGL string

  const lines = content.split('\n');
  for (const line of lines) {
    if (line.includes('begin species')) {
      inSpecies = true;
      continue;
    }
    if (inSpecies) {
      if (line.includes('end species')) break;
      const match = line.match(speciesRegex);
      if (match) {
        species.push(match[1]);
      }
    }
  }
  return species;
}

async function findTrueExtras() {
  console.log('--- Finding True Extras (Semantically New Species) ---');
  
  const netPath = path.join(process.cwd(), 'bng_compare_output', 'Barua_2007.net');
  const extraPath = path.join(process.cwd(), 'extra_species.txt');

  if (!fs.existsSync(netPath) || !fs.existsSync(extraPath)) {
    console.error('Net file or Extra species file missing.');
    return;
  }

  const refSpecies = parseNetFile(netPath);
  const extraSpeciesContent = fs.readFileSync(extraPath, 'utf-8');
  const extraSpecies = extraSpeciesContent.split('\n').filter(l => l.trim().length > 0);

  console.log(`Reference Species: ${refSpecies.length}`);
  console.log(`Extra Species to Check: ${extraSpecies.length}`);

  // Canonicalize Ref Species
  // We map CanonicalString -> OriginalRefString
  const refCanonicalMap = new Map<string, string>();
  for (const s of refSpecies) {
    try {
      const g = BNGLParser.parseSpeciesGraph(s);
      const can = GraphCanonicalizer.canonicalize(g);
      refCanonicalMap.set(can, s);
    } catch (e) {
      console.warn('Failed to parse ref species:', s);
    }
  }

  let trueExtras = 0;
  let duplicates = 0;
  
  // Check specifically for Ref 28 or Extra 1 patterns
  // Ref 28: R(DD!1,Y1~U,Y2~P!2).R(DD!1,Y1~U,Y2~P!3).S(CSH2!2,NSH2~O,PTP~O).S(CSH2!3,NSH2~O,PTP~O)
  // Extra 1: R(DD!1,Y1~U,Y2~P!2).R(DD!1,Y1~U,Y2~P!3).S(CSH2!3,NSH2~O,PTP~O).S(CSH2!2,NSH2~O,PTP~O)
  
  for (const s of extraSpecies) {
    try {
      console.log(`\n[Processing Extra] ${s}`);
      const g = BNGLParser.parseSpeciesGraph(s);
      const can = GraphCanonicalizer.canonicalize(g);
      
      if (refCanonicalMap.has(can)) {
        duplicates++;
      } else {
        console.log(`\n[TRUE EXTRA] No isomorphic match in Ref:\n  ${s}`);
        trueExtras++;
      }
    } catch (e) {
      console.warn('Failed to parse extra species:', s);
    }
  }

  console.log(`\nSummary:`);
  console.log(`Total Extras Checked: ${extraSpecies.length}`);
  console.log(`Isomorphic to Ref (Duplicates/Mismatches): ${duplicates}`);
  console.log(`True Extras (Semantically New): ${trueExtras}`);
}

findTrueExtras().catch(console.error);
