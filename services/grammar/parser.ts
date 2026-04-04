// import { v4 as uuidv4 } from 'uuid';
const uuidv4 = () => Math.random().toString(36).substring(2, 9);
import {
    BioSentence,
    InteractionSentence,
    DefinitionSentence,
    InitializationSentence,
    SimulationSentence,
    ActionType
} from './types';
import { buildVerbPattern, VERBS_BY_ACTION } from './ontology';
import { validateInteractionSentence } from './validator';

// ============================================================================
// SYNONYM MAPS - Makes the parser more "LLM-like" by accepting many phrasings
// ============================================================================

const BINDING_VERBS = VERBS_BY_ACTION.binds;
const PHOSPHORYLATION_VERBS = VERBS_BY_ACTION.phosphorylates;
const DEPHOSPHORYLATION_VERBS = VERBS_BY_ACTION.dephosphorylates;
const SYNTHESIS_VERBS = VERBS_BY_ACTION.synthesizes;
const DEGRADATION_VERBS = VERBS_BY_ACTION.degrades;
const DIMERIZATION_VERBS = VERBS_BY_ACTION.dimerizes;
const TRANSLOCATION_VERBS = VERBS_BY_ACTION.translocates;
const ACTIVATION_VERBS = VERBS_BY_ACTION.activates;
const INHIBITION_VERBS = VERBS_BY_ACTION.inhibits;
const CLEAVAGE_VERBS = VERBS_BY_ACTION.cleaves;
const UBIQUITINATION_VERBS = VERBS_BY_ACTION.ubiquitinates;
const DEUBIQUITINATION_VERBS = VERBS_BY_ACTION.deubiquitinates;
const METHYLATION_VERBS = VERBS_BY_ACTION.methylates;
const DEMETHYLATION_VERBS = VERBS_BY_ACTION.demethylates;
const ACETYLATION_VERBS = VERBS_BY_ACTION.acetylates;
const DEACETYLATION_VERBS = VERBS_BY_ACTION.deacetylates;

// ============================================================================
// SMART PATTERNS with flexible verb recognition
// ============================================================================

const PATTERNS = {
    // Definition patterns - flexible
    DEFINITION: /^(?:Define|Create|Declare|Add)\s+(?:molecule|protein|species|receptor|kinase|enzyme)?\s*(\w+)(?:\s+(?:with|having)\s+(?:sites?|domains?)\s+(.+))?/i,
    
    // Compartment definition
    COMPARTMENT: /^(?:Define|Create)\s+compartment\s+(\w+)(?:\s+(?:with\s+)?(?:volume|size)\s+([0-9.e-]+))?(?:\s+(?:dimension|dim)\s+(\d))?/i,
    
    // Observables
    OBSERVABLE: /^(?:Observe|Track|Monitor|Measure|Watch)\s+(.+?)(?:\s+(?:as|named)\s+(\w+))?/i,
    
    // Initialization - very flexible
    INITIALIZATION: /^(?:Start|Begin|Initialize|Set)\s+(?:with\s+)?(\d+|[0-9.e]+)\s+(?:of\s+|copies\s+of\s+|molecules?\s+of\s+)?(.+)/i,
    
    // Simulation
    SIMULATION: /^(?:Simulate|Run|Execute)\s+(?:for\s+)?([0-9.e]+)\s*(?:s|sec|seconds?)?(?:\s+(?:with|using)\s+([0-9]+)\s+(?:steps?|points?))?/i,
    
    // Comment
    COMMENT: /^[#\/]/
};

// ============================================================================
// SMART SUGGESTION ENGINE - Provides helpful error messages
// ============================================================================

interface ParseSuggestion {
    message: string;
    examples: string[];
}

function getSuggestion(text: string): ParseSuggestion {
    const lowerText = text.toLowerCase();
    
    // Check for partial matches and give helpful suggestions
    if (/\bbind|\binteract|\bassociate|\bcomplex|\brecruit/.test(lowerText)) {
        return {
            message: 'Looks like a binding interaction. Try:',
            examples: ['Lck binds TCR', 'A interacts with B', 'Receptor recruits Kinase']
        };
    }
    
    if (/\bphos|\bkinase/.test(lowerText)) {
        return {
            message: 'Looks like phosphorylation. Try:',
            examples: ['Lck phosphorylates TCR', 'Kinase phosphorylates Substrate at site Y']
        };
    }
    
    if (/\bdephos|\bphosphatase/.test(lowerText)) {
        return {
            message: 'Looks like dephosphorylation. Try:',
            examples: ['SHP1 dephosphorylates TCR', 'Phosphatase removes phosphate from Target']
        };
    }
    
    if (/\bsynth|\bproduc|\bcreate|\bexpress|\btranscrib|\btranslat/.test(lowerText)) {
        return {
            message: 'Looks like synthesis. Try:',
            examples: ['Cell synthesizes Protein', 'Ribosome produces Enzyme', 'Nucleus expresses Gene']
        };
    }
    
    if (/\bdegrad|\bdestroy|\bbreak|\bproteas/.test(lowerText)) {
        return {
            message: 'Looks like degradation. Try:',
            examples: ['Proteasome degrades Protein', 'Enzyme breaks down Substrate']
        };
    }
    
    if (/\bdimer|\boligomer|\bmultimer/.test(lowerText)) {
        return {
            message: 'Looks like dimerization. Try:',
            examples: ['Receptor dimerizes', 'A dimerizes with B', 'Protein forms dimer']
        };
    }
    
    if (/\btransloc|\bmove|\benter|\bexit|\bshuttle|\btraffic/.test(lowerText)) {
        return {
            message: 'Looks like translocation. Try:',
            examples: ['Protein translocates to nucleus', 'Factor moves to membrane', 'Receptor enters cytoplasm']
        };
    }
    
    if (/\bactivat|\bturn\s*on|\benabl|\bstimulat|\bpromot/.test(lowerText)) {
        return {
            message: 'Looks like activation. Try:',
            examples: ['Kinase activates Substrate', 'Ligand stimulates Receptor', 'Enzyme enables Pathway']
        };
    }
    
    if (/\binhib|\bblock|\bsuppress|\brepress|\bprevent|\binactivat/.test(lowerText)) {
        return {
            message: 'Looks like inhibition. Try:',
            examples: ['Inhibitor blocks Enzyme', 'Drug suppresses Receptor', 'Repressor inhibits Transcription']
        };
    }
    
    if (/\bcleav|\bcut|\bsplit|\bprocess|\bproteo/.test(lowerText)) {
        return {
            message: 'Looks like cleavage. Try:',
            examples: ['Caspase cleaves Substrate', 'Protease cuts Protein at site S']
        };
    }
    
    if (/\bubiquit/.test(lowerText)) {
        return {
            message: 'Looks like ubiquitination. Try:',
            examples: ['E3 ubiquitinates Target', 'Ligase adds ubiquitin to Substrate']
        };
    }
    
    if (/\bmethyl/.test(lowerText)) {
        return {
            message: 'Looks like methylation. Try:',
            examples: ['Methyltransferase methylates Histone', 'Enzyme adds methyl to Target']
        };
    }
    
    if (/\bacetyl/.test(lowerText)) {
        return {
            message: 'Looks like acetylation. Try:',
            examples: ['HAT acetylates Histone', 'Acetyltransferase modifies Target']
        };
    }
    
    if (/\bdefin|\bcreate|\bdeclar|\badd/.test(lowerText)) {
        return {
            message: 'Looks like a definition. Try:',
            examples: ['Define Lck', 'Define TCR with sites itam, b', 'Create protein Receptor with sites a, b~active~inactive']
        };
    }
    
    if (/\bstart|\bbegin|\binitial|\bset/.test(lowerText)) {
        return {
            message: 'Looks like initialization. Try:',
            examples: ['Start with 100 of Lck', 'Initialize 50 TCR molecules', 'Begin with 1000 Ligand']
        };
    }
    
    if (/\bsimulat|\brun|\bexecut/.test(lowerText)) {
        return {
            message: 'Looks like a simulation command. Try:',
            examples: ['Simulate for 100s', 'Run 50 seconds with 500 steps', 'Execute simulation for 200s']
        };
    }
    
    if (/\bobserv|\btrack|\bmonitor|\bmeasur|\bwatch/.test(lowerText)) {
        return {
            message: 'Looks like an observable. Try:',
            examples: ['Observe Lck', 'Track phosphorylated TCR as pTCR', 'Monitor total Receptor']
        };
    }
    
    if (/\bcompart/.test(lowerText)) {
        return {
            message: 'Looks like compartment definition. Try:',
            examples: ['Define compartment cytoplasm with volume 1', 'Create compartment membrane dim 2']
        };
    }
    
    // Generic fallback
    return {
        message: 'Unrecognized sentence. Common patterns:',
        examples: [
            'Define <Molecule> with sites <a, b>',
            '<A> binds <B>',
            '<Kinase> phosphorylates <Target>',
            'Start with 100 of <Molecule>',
            'Simulate for 100s'
        ]
    };
}

export class BioParser {

    static parseDocument(text: string): BioSentence[] {
        const lines = text.split('\n');
        return lines.map(line => this.parseSentence(line.trim())).filter(s => s !== null) as BioSentence[];
    }

    static parseSentence(text: string): BioSentence {
        if (!text || text.trim() === '') return { id: uuidv4(), text, type: 'COMMENT', isValid: true };
        if (PATTERNS.COMMENT.test(text)) return { id: uuidv4(), text, type: 'COMMENT', isValid: true };

        // Try Compartment first so "Define compartment" isn't swallowed by DEFINITION
        const compMatch = text.match(PATTERNS.COMPARTMENT);
        if (compMatch) {
            return this.parseCompartment(text, compMatch);
        }

        // Try Definition
        const defMatch = text.match(PATTERNS.DEFINITION);
        if (defMatch) {
            return this.parseDefinition(text, defMatch);
        }

        // Try Observable
        const obsMatch = text.match(PATTERNS.OBSERVABLE);
        if (obsMatch) {
            return this.parseObservable(text, obsMatch);
        }

        // Try all interaction types with flexible verb matching
        const interaction = this.tryParseInteraction(text);
        if (interaction) {
            const validation = validateInteractionSentence(interaction);
            if (validation.isValid) {
                return interaction;
            }

            return {
                id: uuidv4(),
                text,
                type: 'INVALID',
                isValid: false,
                error: {
                    message: `Invalid interaction: ${validation.errors.join('; ')}`,
                    startColumn: 0,
                    endColumn: text.length,
                },
            };
        }

        // Try Initialization
        const initMatch = text.match(PATTERNS.INITIALIZATION);
        if (initMatch) {
            return this.parseInitialization(text, initMatch);
        }

        // Try Simulation
        const simMatch = text.match(PATTERNS.SIMULATION);
        if (simMatch) {
            return this.parseSimulation(text, simMatch);
        }

        // Smart error with suggestions
        const suggestion = getSuggestion(text);
        return {
            id: uuidv4(),
            text,
            type: 'INVALID',
            isValid: false,
            error: { 
                message: `${suggestion.message}\n• ${suggestion.examples.join('\n• ')}`, 
                startColumn: 0, 
                endColumn: text.length 
            }
        };
    }

    private static tryParseInteraction(text: string): InteractionSentence | null {
        const lowerText = text.toLowerCase();
        
        // Helper to extract subject and object from pattern
        const extractEntities = (pattern: RegExp, actionType: ActionType, options: {
            isBidirectional?: boolean,
            defaultRate?: string,
            defaultReverseRate?: string,
            extractSite?: boolean,
            extractCompartment?: boolean,
            selfAction?: boolean
        } = {}): InteractionSentence | null => {
            const match = text.match(pattern);
            if (!match) return null;
            
            const subject = { name: match[1], stateConstraints: {} };
            const object = options.selfAction 
                ? { name: match[1], stateConstraints: {} }
                : { name: match[2], stateConstraints: {} };
            
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: actionType,
                subject,
                object,
                isBidirectional: options.isBidirectional ?? false,
                rate: match[options.selfAction ? 2 : 3] || options.defaultRate || 'k_fwd',
                reverseRate: options.isBidirectional ? (match[options.selfAction ? 3 : 4] || options.defaultReverseRate || 'k_rev') : undefined,
                site: options.extractSite ? match[options.selfAction ? 2 : 3] : undefined,
                compartment: options.extractCompartment ? match[2] : undefined
            };
        };

        // BINDING
        const bindPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(BINDING_VERBS)})\\s+(\\w+)(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+)(?:[,\\s]+([0-9.e-]+))?)?`, 'i');
        const bindResult = extractEntities(bindPattern, 'binds', { 
            isBidirectional: true, 
            defaultRate: 'k_on', 
            defaultReverseRate: 'k_off' 
        });
        if (bindResult) return bindResult;

        // PHOSPHORYLATION
        const phosPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(PHOSPHORYLATION_VERBS)})\\s+(\\w+)(?:\\s+(?:at|on)\\s+(\\w+))?(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const phosMatch = text.match(phosPattern);
        if (phosMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'phosphorylates',
                subject: { name: phosMatch[1], stateConstraints: {} },
                object: { name: phosMatch[2], stateConstraints: {} },
                site: phosMatch[3],
                rate: phosMatch[4] || 'k_cat',
                isBidirectional: false
            };
        }

        // DEPHOSPHORYLATION
        const dephosPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(DEPHOSPHORYLATION_VERBS)})\\s+(\\w+)(?:\\s+(?:at|on)\\s+(\\w+))?(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const dephosMatch = text.match(dephosPattern);
        if (dephosMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'dephosphorylates',
                subject: { name: dephosMatch[1], stateConstraints: {} },
                object: { name: dephosMatch[2], stateConstraints: {} },
                site: dephosMatch[3],
                rate: dephosMatch[4] || 'k_dephos',
                isBidirectional: false
            };
        }

        // SYNTHESIS (produces object, subject is source/context)
        const synthPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(SYNTHESIS_VERBS)})\\s+(\\w+)(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const synthResult = extractEntities(synthPattern, 'synthesizes', { defaultRate: 'k_syn' });
        if (synthResult) return synthResult;

        // DEGRADATION
        const degPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(DEGRADATION_VERBS)})\\s+(\\w+)(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const degResult = extractEntities(degPattern, 'degrades', { defaultRate: 'k_deg' });
        if (degResult) return degResult;

        // Alternative degradation: "X is degraded" / "X degrades"
        const passiveDegPattern = /^(\w+)\s+(?:is\s+)?(?:degraded|destroyed|eliminated)(?:\s+(?:with\s+)?(?:rate|k)\s+([0-9.e-]+))?/i;
        const passiveDegMatch = text.match(passiveDegPattern);
        if (passiveDegMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'degrades',
                subject: { name: 'Null', stateConstraints: {} },
                object: { name: passiveDegMatch[1], stateConstraints: {} },
                rate: passiveDegMatch[2] || 'k_deg',
                isBidirectional: false
            };
        }

        // DIMERIZATION (self or with partner)
        const dimerSelfPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(DIMERIZATION_VERBS)})(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+)(?:[,\\s]+([0-9.e-]+))?)?$`, 'i');
        const dimerSelfMatch = text.match(dimerSelfPattern);
        if (dimerSelfMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'dimerizes',
                subject: { name: dimerSelfMatch[1], stateConstraints: {} },
                object: { name: dimerSelfMatch[1], stateConstraints: {} },
                rate: dimerSelfMatch[2] || 'k_dim',
                reverseRate: dimerSelfMatch[3] || 'k_undim',
                isBidirectional: true
            };
        }

        // Heterodimerization
        const dimerWithPattern = /^(\w+)\s+(?:dimerizes|forms\s+dimer|heterodimerizes)\s+with\s+(\w+)(?:\s+(?:with\s+)?(?:rate|k)\s+([0-9.e-]+)(?:[,\s]+([0-9.e-]+))?)?/i;
        const dimerWithMatch = text.match(dimerWithPattern);
        if (dimerWithMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'dimerizes',
                subject: { name: dimerWithMatch[1], stateConstraints: {} },
                object: { name: dimerWithMatch[2], stateConstraints: {} },
                rate: dimerWithMatch[3] || 'k_dim',
                reverseRate: dimerWithMatch[4] || 'k_undim',
                isBidirectional: true
            };
        }

        // TRANSLOCATION
        const translocPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(TRANSLOCATION_VERBS)})\\s+(\\w+)(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const translocMatch = text.match(translocPattern);
        if (translocMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'translocates',
                subject: { name: translocMatch[1], stateConstraints: {} },
                object: { name: translocMatch[1], stateConstraints: {} },
                targetCompartment: translocMatch[2],
                rate: translocMatch[3] || 'k_trans',
                isBidirectional: false
            };
        }

        // ACTIVATION (abstract - converts to state change)
        const actPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(ACTIVATION_VERBS)})\\s+(\\w+)(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const actResult = extractEntities(actPattern, 'activates', { defaultRate: 'k_act' });
        if (actResult) return actResult;

        // INHIBITION
        const inhibPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(INHIBITION_VERBS)})\\s+(\\w+)(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const inhibResult = extractEntities(inhibPattern, 'inhibits', { defaultRate: 'k_inhib' });
        if (inhibResult) return inhibResult;

        // CLEAVAGE
        const cleavePattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(CLEAVAGE_VERBS)})\\s+(\\w+)(?:\\s+(?:at|into)\\s+(\\w+))?(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const cleaveMatch = text.match(cleavePattern);
        if (cleaveMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'cleaves',
                subject: { name: cleaveMatch[1], stateConstraints: {} },
                object: { name: cleaveMatch[2], stateConstraints: {} },
                site: cleaveMatch[3],
                rate: cleaveMatch[4] || 'k_cleave',
                isBidirectional: false
            };
        }

        // UBIQUITINATION
        const ubiqPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(UBIQUITINATION_VERBS)})\\s+(\\w+)(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const ubiqResult = extractEntities(ubiqPattern, 'ubiquitinates', { defaultRate: 'k_ubiq' });
        if (ubiqResult) return ubiqResult;

        // DEUBIQUITINATION
        const deubiqPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(DEUBIQUITINATION_VERBS)})\\s+(\\w+)(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const deubiqResult = extractEntities(deubiqPattern, 'deubiquitinates', { defaultRate: 'k_deubiq' });
        if (deubiqResult) return deubiqResult;

        // METHYLATION
        const methPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(METHYLATION_VERBS)})\\s+(\\w+)(?:\\s+(?:at|on)\\s+(\\w+))?(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const methMatch = text.match(methPattern);
        if (methMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'methylates',
                subject: { name: methMatch[1], stateConstraints: {} },
                object: { name: methMatch[2], stateConstraints: {} },
                site: methMatch[3],
                rate: methMatch[4] || 'k_meth',
                isBidirectional: false
            };
        }

        // DEMETHYLATION
        const demethPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(DEMETHYLATION_VERBS)})\\s+(\\w+)(?:\\s+(?:at|on)\\s+(\\w+))?(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const demethMatch = text.match(demethPattern);
        if (demethMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'demethylates',
                subject: { name: demethMatch[1], stateConstraints: {} },
                object: { name: demethMatch[2], stateConstraints: {} },
                site: demethMatch[3],
                rate: demethMatch[4] || 'k_demeth',
                isBidirectional: false
            };
        }

        // ACETYLATION
        const acetPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(ACETYLATION_VERBS)})\\s+(\\w+)(?:\\s+(?:at|on)\\s+(\\w+))?(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const acetMatch = text.match(acetPattern);
        if (acetMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'acetylates',
                subject: { name: acetMatch[1], stateConstraints: {} },
                object: { name: acetMatch[2], stateConstraints: {} },
                site: acetMatch[3],
                rate: acetMatch[4] || 'k_acet',
                isBidirectional: false
            };
        }

        // DEACETYLATION
        const deacetPattern = new RegExp(`^(\\w+)\\s+(?:${buildVerbPattern(DEACETYLATION_VERBS)})\\s+(\\w+)(?:\\s+(?:at|on)\\s+(\\w+))?(?:\\s+(?:with\\s+)?(?:rate|k)\\s+([0-9.e-]+))?`, 'i');
        const deacetMatch = text.match(deacetPattern);
        if (deacetMatch) {
            return {
                id: uuidv4(),
                text,
                type: 'INTERACTION',
                isValid: true,
                action: 'deacetylates',
                subject: { name: deacetMatch[1], stateConstraints: {} },
                object: { name: deacetMatch[2], stateConstraints: {} },
                site: deacetMatch[3],
                rate: deacetMatch[4] || 'k_deacet',
                isBidirectional: false
            };
        }

        return null;
    }

    private static parseDefinition(text: string, match: RegExpMatchArray): DefinitionSentence {
        const name = match[1];
        const sitesStr = match[2];

        const sites: string[] = [];
        const states: Record<string, string[]> = {};

        if (sitesStr) {
            const parts = sitesStr.split(',').map(s => s.trim());
            parts.forEach(part => {
                if (part.includes('~')) {
                    const [siteName, ...siteStates] = part.split('~');
                    sites.push(siteName);
                    states[siteName] = siteStates;
                } else {
                    sites.push(part);
                    states[part] = [];
                }
            });
        }

        return {
            id: uuidv4(),
            text,
            type: 'DEFINITION',
            isValid: true,
            agent: { name, sites, states }
        };
    }

    private static parseCompartment(text: string, match: RegExpMatchArray): BioSentence {
        const name = match[1];
        const volumeStr = match[2];
        const dimStr = match[3];

        return {
            id: uuidv4(),
            text,
            type: 'COMPARTMENT',
            isValid: true,
            name,
            volume: volumeStr ? parseFloat(volumeStr) : undefined,
            dimension: dimStr ? parseInt(dimStr, 10) : undefined
        };
    }

    private static parseObservable(text: string, match: RegExpMatchArray): BioSentence {
        // For now, return as a comment/special type - extend types.ts if needed
        return {
            id: uuidv4(),
            text,
            type: 'COMMENT', // TODO: Add OBSERVABLE type
            isValid: true
        };
    }

    private static parseInitialization(text: string, match: RegExpMatchArray): InitializationSentence {
        const count = match[1];
        const moleculeStr = match[2].trim();

        return {
            id: uuidv4(),
            text,
            type: 'INITIALIZATION',
            isValid: true,
            molecule: { name: moleculeStr, stateConstraints: {} },
            count
        };
    }

    private static parseSimulation(text: string, match: RegExpMatchArray): SimulationSentence {
        const duration = parseFloat(match[1]);
        const steps = match[2] ? parseInt(match[2], 10) : 100;

        return {
            id: uuidv4(),
            text,
            type: 'SIMULATION',
            isValid: !isNaN(duration),
            duration,
            steps
        };
    }
}

