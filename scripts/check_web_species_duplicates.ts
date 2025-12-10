
import * as fs from 'fs';
import * as path from 'path';
import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical.ts';
import { NautyService } from '../src/services/graph/core/NautyService.ts';

async function checkDuplicates() {
    await NautyService.getInstance().init();
    
    // Check web_species.txt (which definitely contains 2 duplicates per previous BFS check)
    const filePath = path.join(process.cwd(), 'web_species.txt');
    if (!fs.existsSync(filePath)) {
        console.error("web_species.txt not found");
        return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    console.log(`Checking ${lines.length} species from web_species.txt (WITH NAUTY)`);
    // Fix: Use isInitialized (getter) not isReady()
    console.log(`Nauty Ready: ${NautyService.getInstance().isInitialized}`);
    
    const canonicalMap = new Map<string, string>(); // Canonical(Parsed) -> OriginalString (first encounter)
    let duplicates = 0;
    
    for (const line of lines) {
        // Line format: "Index String" e.g. "1 R(...)"
        const parts = line.split(' ');
        if (parts.length < 2) continue;
        const index = parts[0];
        const speciesStr = parts.slice(1).join(' '); 
        
        try {
            const g = BNGLParser.parseSpeciesGraph(speciesStr);
            const can = GraphCanonicalizer.canonicalize(g);
            
            if (canonicalMap.has(can)) {
                console.log(`[DUPLICATE]`);
                console.log(`  Species A: ${canonicalMap.get(can)}`);
                console.log(`  Species B: ${line}`);
                console.log(`  Canonical: ${can}`);
                duplicates++;
            } else {
                canonicalMap.set(can, line);
            }
        } catch (e) {
            console.error("Error parsing", line);
        }
    }
    
    console.log(`Found ${duplicates} duplicates.`);
}

checkDuplicates().catch(console.error);
