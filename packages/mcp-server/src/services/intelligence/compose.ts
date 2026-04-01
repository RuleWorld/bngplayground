import {
    normalizeWhitespace,
    setSeedSpeciesLine,
    updateParameterLine,
} from './utils/codeUtils.js';
import { BioParser, BNGLGenerator } from '../../../../../services/grammar/index.js';
import type { DefinitionSentence } from '../../../../../services/grammar/index.js';
import type { ComposeSeedSpecies, ComposeAnalysis, ComposeMolecule } from './types.js';
import { parseBNGLWithANTLR, formatBNGL } from '@bngplayground/engine';
import { INDRAService } from '../indra/indraService.js';
import type { INDRADBQueryParams } from '../indra/types.js';

interface ComposeRuleResult {
    name: string;
    rule: string;
}

export interface ComposeModelArgs {
    statements?: string[];
    parameters?: Record<string, number>;
    seed_species?: ComposeSeedSpecies[];
    strict?: boolean;
    source?: 'grammar' | 'indra_nlp' | 'indra_db';
    indra_text?: string;
    indra_query?: INDRADBQueryParams;
}

function analyzeComposedCode(
    currentCode: string,
    analysis: ComposeAnalysis,
    confirmation: string,
    definitionsByName?: Map<string, ComposeMolecule>,
): {
    code: string;
    rules: Array<{ name: string; rule: string }>;
    analysis: ComposeAnalysis;
    molecules: ComposeMolecule[];
    confirmation: string;
} {
    const formattedCode = currentCode.includes('begin model')
        ? currentCode
        : (() => {
            try {
                return formatBNGL(currentCode);
            } catch {
                return currentCode;
            }
        })();

    const parseResult = parseBNGLWithANTLR(formattedCode);
    if (!parseResult.success) {
        const messages = parseResult.errors.map((error: any) => `line ${error.line}:${error.column} ${error.message}`).join('; ');
        throw new Error(`Composed model is invalid BNGL: ${messages || 'unknown parse error'}`);
    }

    const model = parseResult.model;
    const ruleList: ComposeRuleResult[] = (model?.reactionRules ?? []).map((rule, index) => ({
        name: rule.name ?? `rule_${index + 1}`,
        rule: `${rule.reactants.join(' + ')} ${rule.isBidirectional ? '<->' : '->'} ${rule.products.join(' + ')} ${rule.rate}`,
    }));

    const molecules: ComposeMolecule[] = (model?.moleculeTypes ?? []).map((moleculeType) => {
        const fromDefinition = definitionsByName?.get(moleculeType.name);
        return {
            name: moleculeType.name,
            sites: fromDefinition?.sites ?? [...moleculeType.components],
            states: fromDefinition?.states ?? {},
        };
    });

    return {
        code: formattedCode,
        rules: ruleList,
        analysis,
        molecules,
        confirmation,
    };
}

export function composeModelFromStatements(args: {
    statements?: string[];
    parameters?: Record<string, number>;
    seed_species?: ComposeSeedSpecies[];
    strict?: boolean;
}) {
    if (!args.statements || args.statements.length === 0) {
        throw new Error('No statements were provided for model composition.');
    }

    const documentText = args.statements.map((line) => normalizeWhitespace(line)).join('\n');
    const sentences = BioParser.parseDocument(documentText);
    const validSentences = sentences.filter((sentence) => sentence.isValid && sentence.type !== 'COMMENT' && sentence.type !== 'COMPARTMENT');
    const invalidSentences = sentences.filter((sentence) => !sentence.isValid || sentence.type === 'INVALID');

    if (args.strict && validSentences.length === 0) {
        throw new Error('No statements could be translated into a valid designer grammar sentence.');
    }

    const generated = BNGLGenerator.generate(sentences);
    let currentCode = generated;

    if (args.parameters) {
        for (const [name, value] of Object.entries(args.parameters)) {
            currentCode = updateParameterLine(currentCode, name, value);
        }
    }

    if (args.seed_species && args.seed_species.length > 0) {
        for (const seed of args.seed_species) {
            currentCode = setSeedSpeciesLine(currentCode, seed.species, seed.count);
        }
    }

    const definitionSentences = sentences.filter((sentence): sentence is DefinitionSentence => sentence.type === 'DEFINITION' && sentence.isValid);
    const definitionsByName = new Map<string, ComposeMolecule>();
    for (const definition of definitionSentences) {
        definitionsByName.set(definition.agent.name, {
            name: definition.agent.name,
            sites: [...definition.agent.sites],
            states: Object.fromEntries(
                Object.entries(definition.agent.states).map(([site, states]) => [site, [...states]]),
            ),
        });
    }

    return analyzeComposedCode(
        currentCode,
        {
            recognizedCount: validSentences.length,
            unparsedStatements: invalidSentences.map((sentence) => sentence.text),
        },
        `Parsed ${validSentences.length}/${sentences.length} statements into BNGL.`,
        definitionsByName,
    );
}

export async function composeModel(args: ComposeModelArgs) {
    const source = args.source ?? 'grammar';
    if (source === 'grammar') {
        return composeModelFromStatements(args);
    }

    if (source === 'indra_nlp') {
        const text = args.indra_text?.trim();
        if (!text) {
            throw new Error('`indra_text` is required when source is `indra_nlp`.');
        }

        const statements = await INDRAService.processText(text);
        const currentCode = await INDRAService.assembleBNGL(statements, 'one_step');
        return analyzeComposedCode(
            currentCode,
            {
                recognizedCount: statements.length,
                unparsedStatements: [],
            },
            `Assembled BNGL from ${statements.length} INDRA NLP statements.`,
        );
    }

    const query = args.indra_query ?? {};
    if (!query.subject && !query.object) {
        throw new Error('`indra_query.subject` or `indra_query.object` is required when source is `indra_db`.');
    }

    const { statements, evidenceCounts } = await INDRAService.queryAgents(query);
    const currentCode = await INDRAService.assembleBNGL(statements, 'two_step');
    const topEvidence = Array.from(evidenceCounts.values()).sort((a, b) => b - a).slice(0, 3);
    const evidenceSummary = topEvidence.length > 0 ? ` Top evidence counts: ${topEvidence.join(', ')}.` : '';

    return analyzeComposedCode(
        currentCode,
        {
            recognizedCount: statements.length,
            unparsedStatements: [],
        },
        `Assembled BNGL from ${statements.length} INDRA DB statements.${evidenceSummary}`,
    );
}
