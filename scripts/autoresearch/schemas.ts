import { z } from 'zod';

export const campaignSchema = z.enum(['mcp', 'performance']);
export type Campaign = z.infer<typeof campaignSchema>;

export const targetStatusSchema = z.enum(['TARGET_FOUND', 'NO_TARGET']);
export const candidateStatusSchema = z.enum([
  'VALID_WIN',
  'VALID_NO_WIN',
  'NO_CHANGE',
  'PATCH_REJECTED',
  'GUARD_REJECTED',
  'TEST_FAILED',
  'SESSION_FAILED',
  'EVALUATION_ERROR',
]);

export const fitnessDefinitionSchema = z.object({
  primary_name: z.string(),
  higher_is_better: z.boolean(),
});

export const fitnessCommandSchema = z.object({
  args: z.array(z.string()).min(1),
});
export type FitnessCommand = z.infer<typeof fitnessCommandSchema>;

export const campaignTargetSchema = z.object({
  campaign: campaignSchema,
  status: z.literal('TARGET_FOUND'),
  target_id: z.string(),
  objective: z.string(),
  fitness_command: fitnessCommandSchema,
  editable_paths: z.array(z.string()).min(1),
  locked_paths: z.array(z.string()),
  baseline_metrics: z.record(z.string(), z.unknown()),
  fitness: fitnessDefinitionSchema,
  relevant_skills: z.array(z.string()).min(1),
});
export type CampaignTarget = z.infer<typeof campaignTargetSchema>;

export const noTargetSchema = z.object({
  campaign: campaignSchema,
  status: z.literal('NO_TARGET'),
  reason: z.string(),
});
export type NoTarget = z.infer<typeof noTargetSchema>;
export const targetSelectionSchema = z.discriminatedUnion('status', [campaignTargetSchema, noTargetSchema]);
export type TargetSelection = z.infer<typeof targetSelectionSchema>;

export const sessionRecordSchema = z.object({
  session_id: z.string(),
  candidate: z.number().int().positive(),
  generation: z.number().int().positive(),
  campaign: campaignSchema,
  target_id: z.string(),
  base_sha: z.string(),
  state: z.string(),
  started_at: z.string(),
  completed_at: z.string().optional(),
  final_message: z.string().optional(),
  generated_files: z.array(z.string()),
  patch_path: z.string().optional(),
});
export type SessionRecord = z.infer<typeof sessionRecordSchema>;

export const fitnessResultSchema = z.object({
  primary_name: z.string(),
  baseline: z.number(),
  candidate: z.number(),
  delta: z.number(),
  higher_is_better: z.boolean(),
});

export const guardResultSchema = z.object({
  locked_paths_clean: z.boolean(),
  typecheck: z.boolean(),
  tests: z.boolean(),
  scientific_suite: z.boolean(),
});

export const candidateResultSchema = z.object({
  run_id: z.string(),
  campaign: campaignSchema,
  generation: z.number().int().positive(),
  candidate: z.number().int().positive(),
  session_id: z.string().optional(),
  base_sha: z.string(),
  status: candidateStatusSchema,
  patch_sha256: z.string().optional(),
  patch_path: z.string().optional(),
  changed_files: z.array(z.string()),
  fitness: fitnessResultSchema.optional(),
  guards: guardResultSchema,
  notes: z.array(z.string()),
});
export type CandidateResult = z.infer<typeof candidateResultSchema>;

export const runManifestSchema = z.object({
  run_id: z.string(),
  base_sha: z.string(),
  base_branch: z.string(),
  started_at: z.string(),
  jules_budget_planned: z.number().int().nonnegative(),
  reserve_tasks: z.number().int().nonnegative(),
  campaigns: z.record(z.string(), targetSelectionSchema),
  generation1_starts: z.number().int().nonnegative(),
  refinement_requested: z.boolean(),
  dry_run: z.boolean(),
});
export type RunManifest = z.infer<typeof runManifestSchema>;

export const promotionRecordSchema = z.object({
  run_id: z.string(),
  campaign: campaignSchema,
  target_id: z.string(),
  mode: z.enum(['artifact', 'pr']),
  status: z.enum(['NOT_REQUESTED', 'ARTIFACT_WRITTEN', 'PR_OPENED', 'REJECTED', 'ERROR']),
  branch: z.string().optional(),
  pull_request_url: z.string().url().optional(),
  patch_sha256: z.string().optional(),
  notes: z.array(z.string()),
});
export type PromotionRecord = z.infer<typeof promotionRecordSchema>;

export const boardResultSchema = z.object({
  run_id: z.string(),
  base_sha: z.string(),
  targets: z.record(z.string(), targetSelectionSchema),
  candidates: z.array(candidateResultSchema),
  winners: z.record(z.string(), candidateResultSchema),
  promotions: z.array(promotionRecordSchema),
});
export type BoardResult = z.infer<typeof boardResultSchema>;
