
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { GraphMatcher } from '../src/services/graph/core/Matcher';
import { NautyService } from '../src/services/graph/core/NautyService';

// Mock dependencies if needed, or copy the function logic if import fails due to worker environment
// We'll try to replicate the precise logic I wrote in bnglWorker.ts

async function testObservableLogic() {
    await NautyService.getInstance().init();
    console.log('Testing BAB observable logic...');

    const patternBngl = "A(b!1).B(a!1)";
    const patternGraph = BNGLParser.parseSpeciesGraph(patternBngl);
    patternGraph.buildAdjacencyBitset();

    const targetBngl = "B(a!1).A(b!1,b!2).B(a!2)";
    const targetGraph = BNGLParser.parseSpeciesGraph(targetBngl);
    targetGraph.buildAdjacencyBitset();

    console.log(`Pattern: ${patternBngl}`);
    console.log(`Target: ${targetBngl}`);

    // LOGIC FROM bnglWorker.ts (Corrected)
    const maps = GraphMatcher.findAllMaps(patternGraph, targetGraph);
    const uniqueMatchSets = new Set<string>();

    for (const m of maps) {
      // Collect all target molecule indices involved in this match
      const targetIndices: number[] = [];
      for (const tIdx of m.moleculeMap.values()) {
        targetIndices.push(tIdx);
      }
      // Sort to make the set canonical (ignore permutation of pattern atoms)
      targetIndices.sort((a, b) => a - b);
      uniqueMatchSets.add(targetIndices.join(','));
    }
    const count = uniqueMatchSets.size;
    // END LOGIC

    console.log(`Calculated Count: ${count}`);
    if (count === 2) {
        console.log("SUCCESS: Count is 2 as expected.");
    } else {
        console.log(`FAILURE: Count is ${count}, expected 2.`);
    }

    // Double check A.A on A-A
    const dimPat = "A(a!1).A(a!1)";
    const dimSpec = "A(a!1).A(a!1)";
    const dimPatG = BNGLParser.parseSpeciesGraph(dimPat);
    const dimSpecG = BNGLParser.parseSpeciesGraph(dimSpec);
    dimPatG.buildAdjacencyBitset();
    dimSpecG.buildAdjacencyBitset();
    
    console.log(`\nTesting Dimer Self-Match A.A on A-A`);
    const maps2 = GraphMatcher.findAllMaps(dimPatG, dimSpecG);
    const uniqueMatchSets2 = new Set<string>();
    for (const m of maps2) {
        const targetIndices: number[] = [];
        for (const tIdx of m.moleculeMap.values()) {
            targetIndices.push(tIdx);
        }
        targetIndices.sort((a, b) => a - b);
        uniqueMatchSets2.add(targetIndices.join(','));
    }
    const count2 = uniqueMatchSets2.size;
    console.log(`Calculated Count (Dimer): ${count2}`);
    if (count2 === 1) {
        console.log("SUCCESS: Count is 1 as expected for symmetric dimer.");
    } else {
        console.log(`FAILURE: Dimer count is ${count2}, expected 1.`);
    }
}

testObservableLogic().catch(console.error);
