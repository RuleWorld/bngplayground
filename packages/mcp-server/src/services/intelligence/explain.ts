import { parseModelOrThrow } from '../../services/engine.js';
import type { ExplainSection } from './types.js';
import { handleSimulate } from '../../handlers/simulate.js';

interface MechanismType {
    name: string;
    type: string;
    count: number;
}

interface MoleculeRole {
    name: string;
    role: string;
    rules: string[];
}

interface CruxEntry {
    rule?: string;
    parameter: string;
    knockoutEffect?: number;
    pathway: string;
    recommendation: string;
}

export async function explainModelNarrative(code: string, includeCrux: boolean = false): Promise<{
    summary: string;
    sections: ExplainSection[];
    mechanisms: MechanismType[];
    molecules: MoleculeRole[];
    crux?: CruxEntry[];
}> {
    const model = parseModelOrThrow(code);
    const reactionRules = model.reactionRules ?? [];

    const moleculeTypes = model.moleculeTypes.map((molecule) => molecule.name);
    const ruleNames = reactionRules.map((rule, index) => rule.name || `rule_${index + 1}`);
    const observableNames = model.observables.map((obs) => obs.name);

    const mechanisms: Record<string, number> = {};
    for (const rule of reactionRules) {
        let type = 'unknown';
        const reactants = rule.reactants;
        const products = rule.products;
        
        if (reactants.length === 2 && products.length === 1 && products[0].includes('.')) {
            type = 'binding';
        } else if (reactants.length >= 1 && products.length >= 1) {
            if (reactants[0]?.includes('~') && products[0]?.includes('~')) {
                type = 'modification';
            } else if (reactants[0]?.length > 0 && products.length === 0) {
                type = 'degradation';
            } else if (reactants.length === 0 && products.length > 0) {
                type = 'synthesis';
            } else {
                type = 'conversion';
            }
        }
        mechanisms[type] = (mechanisms[type] || 0) + 1;
    }
    const mechanismList = Object.entries(mechanisms).map(([name, count]) => ({ name, type: name, count }));

    const moleculeRoles: Record<string, { role: string; rules: Set<string> }> = {};
    for (const mol of model.moleculeTypes) {
        moleculeRoles[mol.name] = { role: 'unknown', rules: new Set() };
    }
    
    for (const rule of reactionRules) {
        const ruleName = rule.name || 'unnamed';
        const allMols = [...rule.reactants, ...rule.products];
        for (const molExpr of allMols) {
            const molName = molExpr.split('(')[0];
            if (moleculeRoles[molName]) {
                moleculeRoles[molName].rules.add(ruleName);
            }
        }
    }

    const moleculeList = Object.entries(moleculeRoles).map(([name, data]) => {
        const ruleList = Array.from(data.rules);
        let role: string;
        let asReactantOnly = 0, asProductOnly = 0, asCatalyst = 0, inBinding = 0;

        for (const rule of reactionRules) {
            const ruleName = rule.name || 'unnamed';
            if (!data.rules.has(ruleName)) continue;
            const inReactants = rule.reactants.some(r => r.split('(')[0] === name);
            const inProducts = rule.products.some(p => p.split('(')[0] === name);

            if (inReactants && inProducts) {
                const rStr = rule.reactants.find(r => r.split('(')[0] === name) ?? '';
                const pStr = rule.products.find(p => p.split('(')[0] === name) ?? '';
                if (rStr === pStr) asCatalyst++;
            } else if (inReactants && !inProducts) {
                asReactantOnly++;
            } else if (!inReactants && inProducts) {
                asProductOnly++;
            }
            if (inProducts && rule.products.some(p => p.includes('.') && p.includes(name))) {
                inBinding++;
            }
        }

        if (asCatalyst > 0 && asCatalyst >= asReactantOnly && asCatalyst >= asProductOnly) {
            role = 'enzyme';
        } else if (inBinding > ruleList.length / 2) {
            role = 'scaffold';
        } else if (asProductOnly > 0 && asReactantOnly === 0) {
            role = 'product';
        } else if (asReactantOnly > 0 && asProductOnly === 0) {
            role = 'consumed';
        } else {
            role = 'substrate';
        }
        return { name, role, rules: ruleList };
    });

    const sections: ExplainSection[] = [
        { title: 'Entities', content: `Molecule types (${model.moleculeTypes.length}): ${moleculeTypes.slice(0, 10).join(', ') || 'none'}.` },
        { title: 'Initialization', content: `Seed species (${model.species.length}) are initialized with explicit concentrations and driven by ${Object.keys(model.parameters).length} parameters.` },
        { title: 'Dynamics', content: `Reaction rules (${reactionRules.length}) define the network transitions. Key rules: ${ruleNames.slice(0, 6).join(', ') || 'none'}.` },
        { title: 'Readouts', content: `Observables (${model.observables.length}) report model behavior: ${observableNames.slice(0, 8).join(', ') || 'none'}.` },
    ];

    const summary = [
        `Model contains ${model.moleculeTypes.length} molecule types, ${model.species.length} seed species, and ${reactionRules.length} reaction rules.`,
        reactionRules.length > 20 ? 'The model appears rule-dense and may require network limits for expansion-heavy analyses.' : 'The model size is moderate and suitable for direct deterministic simulation.',
    ].join(' ');

    let crux: CruxEntry[] | undefined;
    if (includeCrux && model.observables.length > 0 && Object.keys(model.parameters).length > 0) {
        try {
            const paramEntries = Object.entries(model.parameters).filter(([, v]) => Number.isFinite(v));
            if (paramEntries.length > 0 && paramEntries.length <= 10) {
                const firstObs = model.observables[0]?.name;
                if (firstObs && reactionRules.length > 0 && reactionRules.length <= 20) {
                    const baselineResult = await handleSimulate({ code, method: 'ode', t_end: 10, n_steps: 50 });
                    const baselineData = baselineResult.structuredContent?.data;
                    if (!baselineData || baselineData.length === 0) throw new Error('Baseline simulation failed');
                    const baselineFinal = baselineData[baselineData.length - 1];
                    const baselineValue = Number(baselineFinal[firstObs] ?? 0);
                    
                    const ruleEffects: Array<{ rule: string; parameter: string; effect: number }> = [];
                    
                    for (const rule of reactionRules) {
                        if (!rule.rate || rule.isFunctionalRate) continue;
                        const rateParam = rule.rate;
                        const rateValue = model.parameters[rateParam];
                        if (typeof rateValue !== 'number') continue;
                        const paramRegex = new RegExp(`^(${rateParam})\\s+${rateValue.toString()}\\s*$`, 'm');
                        const zeroedCode = code.replace(paramRegex, `$1 0`);
                        if (zeroedCode === code) continue;
                        
                        try {
                            const koResult = await handleSimulate({ code: zeroedCode, method: 'ode', t_end: 10, n_steps: 50 });
                            const koData = koResult.structuredContent?.data;
                            if (!koData || koData.length === 0) continue;
                            const koFinal = koData[koData.length - 1];
                            const koValue = Number(koFinal[firstObs] ?? 0);
                            const effect = Math.abs(koValue - baselineValue) / (Math.abs(baselineValue) || 1);
                            ruleEffects.push({ rule: rule.name ?? 'unnamed', parameter: rateParam, effect });
                            } catch {
                            // Ignored knockout simulation failure
                        }
                    }
                    
                    if (ruleEffects.length > 0) {
                        const sorted = ruleEffects.sort((a, b) => b.effect - a.effect);
                        crux = sorted.slice(0, 3).map(entry => ({
                            rule: entry.rule,
                            parameter: entry.parameter,
                            knockoutEffect: entry.effect,
                            pathway: `Removal of ${entry.rule} changes ${firstObs} by ${(entry.effect * 100).toFixed(1)}%`,
                            recommendation: entry.effect > 0.5 ? 'Critical — this rule is essential' : entry.effect > 0.1 ? 'Moderate — significant influence' : 'Low impact',
                        }));
                    }
                }
            }
        } catch {
            // Ignored outer baseline failure
        }
    }

    return { summary, sections, mechanisms: mechanismList, molecules: moleculeList, ...(crux && crux.length > 0 ? { crux } : {}) };
}