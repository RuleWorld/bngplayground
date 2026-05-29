import type { ComposeSeedSpecies } from '../types.js';

export function gatherMoleculeTypesFromRules(rules: Array<{ rule: string }>): string[] {
    const types: string[] = [];

    for (const rule of rules) {
        if (rule.rule.includes('(state~u)') || rule.rule.includes('(state~p)')) {
            const match = rule.rule.match(/\b([A-Za-z][A-Za-z0-9_]*)\(state~u\)/);
            if (match) {
                types.push(`${match[1]}(state~u~p)`);
            }
        }

        const moleculeMatches = [...rule.rule.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\(([^)]*)\)/g)];
        for (const m of moleculeMatches) {
            const name = m[1];
            const siteBody = m[2].trim();
            if (siteBody.length === 0 || siteBody.includes('state~')) {
                continue;
            }
            if (siteBody.includes('a') || siteBody.includes('b')) {
                if (siteBody.includes('a')) {
                    types.push(`${name}(a)`);
                }
                if (siteBody.includes('b')) {
                    types.push(`${name}(b)`);
                }
            }
        }

        const statelessMatches = [...rule.rule.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\(\)/g)];
        for (const m of statelessMatches) {
            types.push(`${m[1]}()`);
        }
    }

    return [...new Set(types)];
}

export function pickDefaultSeeds(moleculeTypes: string[]): ComposeSeedSpecies[] {
    if (moleculeTypes.length === 0) {
        return [{ species: 'A()', count: 100 }];
    }

    return moleculeTypes.slice(0, 6).map((definition) => {
        const species = definition.replace(/\([^)]*\)/, '()');
        return { species, count: 100 };
    });
}