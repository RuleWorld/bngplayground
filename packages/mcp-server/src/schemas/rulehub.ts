import { z } from 'zod';

export const searchModelsArgsSchema = z.object({
  query: z.string().trim().min(1).max(500).describe('Biological mechanism, model name, or BNGL feature to search for'),
  limit: z.number().int().min(1).max(20).optional().describe('Maximum results (default 5)'),
  origin: z.array(z.string().min(1)).max(20).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  simulation_methods: z.array(z.string().min(1)).max(20).optional(),
  bng2_compatible: z.boolean().optional(),
  nfsim_compatible: z.boolean().optional(),
  features: z.array(z.string().min(1)).max(20).optional(),
  include_excluded: z.boolean().optional().describe('Include manifest entries marked excluded (default false)'),
}).strict();
