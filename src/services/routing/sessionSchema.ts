/**
 * sessionSchema.ts — Zod schema for the analysis session URL.
 */

import { z } from 'zod';
import { TAB_IDS } from './tabIds';

const tabIdEnum = z.enum(TAB_IDS);

export const simulationConfigSchema = z.object({
	method: z.enum(['ode', 'ssa', 'nfsim', 'pla', 'psa']).optional(),
	tEnd: z.number().positive().finite().optional(),
	nSteps: z.number().int().positive().max(1_000_000).optional(),
	seed: z.number().int().optional(),
	rtol: z.number().positive().finite().optional(),
	atol: z.number().positive().finite().optional(),
}).strict();

export const sessionSchema = z.object({
	tab: tabIdEnum.default('time-courses'),
	modelId: z.string().max(256).optional(),
	params: z.record(z.string(), z.number().finite()).optional(),
	simulation: simulationConfigSchema.optional(),
	observable: z.string().max(128).optional(),
	tabState: z.record(z.string(), z.unknown()).optional(),
	embeddedSource: z.string().max(100_000).optional(),
}).strict();

export type Session = z.infer<typeof sessionSchema>;
export type SimulationConfig = z.infer<typeof simulationConfigSchema>;
