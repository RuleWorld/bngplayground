
import * as fs from 'fs';



function parseNetFile(path: string): Set<string> {
    const content = fs.readFileSync(path, 'utf-8');
    const lines = content.split('\n');
    const species = new Set<string>();
    let inSpecies = false;

    for (const line of lines) {
        if (line.trim().startsWith('begin species')) {
            inSpecies = true;
            continue;
        }
        if (line.trim().startsWith('end species')) {
            inSpecies = false;
            continue;
        }
        if (inSpecies && line.trim() && !line.trim().startsWith('#')) {
            // Format: index string conc
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                // parts[0] is index, parts[1] is species string
                species.add(parts[1]);
            }
        }
    }
    return species;
}

function parseWebFile(path: string): Set<string> {
    const content = fs.readFileSync(path, 'utf-8');
    const lines = content.split('\n');
    const species = new Set<string>();

    for (const line of lines) {
        if (line.trim()) {
            // Format: index string
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                species.add(parts[1]);
            }
        }
    }
    return species;
}

const bngSpecies = parseNetFile('bng_compare_output/Barua_2007.net');
const webSpecies = parseWebFile('web_species.txt');

console.log(`BNG2 Species: ${bngSpecies.size}`);
console.log(`Web Species: ${webSpecies.size}`);

const extraSpecies = [...webSpecies].filter(s => !bngSpecies.has(s));
const missingSpecies = [...bngSpecies].filter(s => !webSpecies.has(s));

console.log(`\nExtra Species in Web (${extraSpecies.length}):`);
extraSpecies.slice(0, 20).forEach(s => console.log(s));

console.log(`\nMissing Species in Web (${missingSpecies.length}):`);
missingSpecies.slice(0, 20).forEach(s => console.log(s));


// Helper to canonicalize species string (reorder molecules and components)
function canonicalize(s: string): string {
  // 1. Split into molecules. Handle dots within parens if any (BNG usually doesn't output them in species names)
  // For Barua, simple split by '.' is likely safe for top-level separation
  const mols = s.split('.');
  
  const normMols = mols.map(m => {
    // R(A, B) -> sort A,B
    const parts = m.match(/^([A-Za-z0-9_]+)\((.*)\)$/);
    if (!parts) return m;
    const name = parts[1];
    if (!parts[2].trim()) return `${name}()`;

    // Split components by comma
    const comps = parts[2].split(',').map(c => c.trim());
    
    // Sort components
    comps.sort();
    
    return `${name}(${comps.join(',')})`;
  });

  // 2. Sort the molecules to handle A.B vs B.A
  normMols.sort();

  return normMols.join('.');
}

console.log(`\nMax 'S(' count in BNG: ${Math.max(...[...bngSpecies].map(s => (s.match(/S\(/g) || []).length))}`);
console.log(`Max 'S(' count in Web: ${Math.max(...[...webSpecies].map(s => (s.match(/S\(/g) || []).length))}`);

const bngCanon = new Set([...bngSpecies].map(canonicalize));
const webCanon = new Set([...webSpecies].map(canonicalize));

console.log(`\nCanonicalized BNG count: ${bngCanon.size}`);
console.log(`Canonicalized Web count: ${webCanon.size}`);

const extraCanon = [...webCanon].filter(s => !bngCanon.has(s));
console.log(`\nExtra Canonicalized Species (${extraCanon.length}):`);
extraCanon.slice(0, 20).forEach(s => console.log(s));

// Analyze extra species
if (extraSpecies.length > 0) {
    console.log('\nAnalysis of Extra Species:');
    const hasR = extraSpecies.filter(s => s.includes('R(')).length;
    
    // Count max R's in a single species
    const maxR = Math.max(...[...webSpecies].map(s => (s.match(/R\(/g) || []).length));
    console.log(`Max 'R(' count in Web: ${maxR}`);
    
    const maxRBng = Math.max(...[...bngSpecies].map(s => (s.match(/R\(/g) || []).length));
    console.log(`Max 'R(' count in BNG: ${maxRBng}`);

    // Check if any species has != 2 Rs (and > 0 Rs)
    const oddR = [...webSpecies].filter(s => {
      const rCount = (s.match(/R\(/g) || []).length;
      return rCount > 0 && rCount !== 2;
    });
    console.log(`Species with R count != 2 (and > 0): ${oddR.length}`);
    if (oddR.length > 0) {
      console.log('Examples:', oddR.slice(0, 5));
    }
    
    const hasS = extraSpecies.filter(s => s.includes('S(')).length;
    console.log(`Containing R: ${hasR}`);
    console.log(`Containing S: ${hasS}`);

    // Check for specific violations?
    // Example: S bound to R while binding another R?
}
