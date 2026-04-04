import { z } from 'zod';
import { simulationMethods, finiteNumber, positiveInt } from './core.js';

const composeSeedSpeciesSchema = z.object({
    species: z.string(),
    count: finiteNumber,
}).strict();

const indraQuerySchema = z.object({
    subject: z.string().min(1).optional(),
    object: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    minEvidence: finiteNumber.optional(),
    minBelief: finiteNumber.optional(),
}).strict();

export const composeModelArgsSchema = z.object({
    statements: z.array(z.string().min(1)).min(1).optional(),
    parameters: z.record(z.string(), finiteNumber).optional(),
    seed_species: z.array(composeSeedSpeciesSchema).optional(),
    strict: z.boolean().optional(),
    source: z.enum(['grammar', 'indra_nlp', 'indra_db']).optional(),
    indra_text: z.string().min(1).optional(),
    indra_query: indraQuerySchema.optional(),
}).strict().superRefine((value, ctx) => {
    const source = value.source ?? 'grammar';
    if (source === 'grammar' && (!value.statements || value.statements.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '`statements` is required when source is `grammar`.',
            path: ['statements'],
        });
    }
    if (source === 'indra_nlp' && !value.indra_text) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '`indra_text` is required when source is `indra_nlp`.',
            path: ['indra_text'],
        });
    }
    if (source === 'indra_db' && !value.indra_query) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '`indra_query` is required when source is `indra_db`.',
            path: ['indra_query'],
        });
    }
});

const editOperationSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('add_rule'), rule: z.string() }).strict(),
    z.object({ action: z.literal('add_statement'), text: z.string() }).strict(),
    z.object({ action: z.literal('remove_rule'), name: z.string() }).strict(),
    z.object({ action: z.literal('remove_rule_index'), index: z.number().int().nonnegative() }).strict(),
    z.object({ action: z.literal('set_parameter'), name: z.string(), value: finiteNumber }).strict(),
    z.object({ action: z.literal('add_parameter'), name: z.string(), value: finiteNumber }).strict(),
    z.object({ action: z.literal('set_concentration'), species: z.string(), value: finiteNumber }).strict(),
    z.object({ action: z.literal('add_observable'), name: z.string(), type: z.enum(['Molecules', 'Species']), pattern: z.string() }).strict(),
    z.object({ action: z.literal('remove_observable'), name: z.string() }).strict(),
    z.object({ action: z.literal('add_molecule_type'), definition: z.string() }).strict(),
    z.object({ action: z.literal('add_species'), species: z.string(), concentration: finiteNumber }).strict(),
    z.object({ action: z.literal('knockout_rule'), name: z.string() }).strict(),
    z.object({ action: z.literal('randomize_parameters'), range: finiteNumber }).strict(),
    z.object({ action: z.literal('set_scope'), includes: z.array(z.string()), excludes: z.array(z.string()), justification: z.string() }).strict(),
]);

export const editModelArgsSchema = z.object({
    code: z.string(),
    operations: z.array(editOperationSchema).min(1),
}).strict();

export const diagnoseModelArgsSchema = z.object({
    code: z.string(),
    n_samples: positiveInt.optional(),
    n_bootstrap: positiveInt.optional(),
    max_parameters: positiveInt.optional(),
    method: z.enum(simulationMethods).optional(),
    t_end: finiteNumber.positive().optional(),
    n_steps: positiveInt.optional(),
    experimental_data: z.array(z.object({
        time: z.number(),
        observables: z.record(z.string(), z.number()),
        errors: z.record(z.string(), z.number()).optional(),
    })).optional().describe('Experimental data for profile likelihood. When provided, enables identifiability classification.'),
}).strict();

export const explainModelArgsSchema = z.object({
    code: z.string(),
    include_crux: z.boolean().optional(),
}).strict();

export const suggestFixArgsSchema = z.object({
    code: z.string(),
    include_auto_corrected_code: z.boolean().optional(),
}).strict();
