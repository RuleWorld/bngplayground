import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getToolDefinitions, stableToolNames } from '../../packages/mcp-server/src/toolRegistry.ts';
import { campaignTargetSchema, noTargetSchema, type CampaignTarget, type NoTarget } from './schemas.js';
import { runGitSync, shortId } from './utils.js';

const MCP_SKILLS = [
  '.agents/skills/bngplayground-mcp-development/SKILL.md',
  '.agents/skills/rulehub-model-search/SKILL.md',
];

const MCP_LOCKED_PATHS = [
  'packages/mcp-server/tests/',
  'tests/fixtures/',
  'scripts/autoresearch/',
];

const PERFORMANCE_SKILLS = [
  '.agents/skills/bionetgen-nfsim/SKILL.md',
];

const PERFORMANCE_LOCKED_PATHS = [
  'tests/profile-everything.spec.ts',
  'scripts/compare_profile_runs.mjs',
  'scripts/run_full_tests.mjs',
  'scripts/autoresearch/',
  'tests/',
];

function forcedTarget(campaign: 'mcp' | 'performance', baseDir: string): CampaignTarget | undefined {
  const forced = process.env.AUTORESEARCH_FORCE_TARGET?.trim();
  if (!forced || !forced.startsWith(`${campaign}:`)) return undefined;
  const targetId = forced.slice(campaign.length + 1) || `${campaign}-forced`;
  return campaignTargetSchema.parse({
    campaign,
    status: 'TARGET_FOUND',
    target_id: targetId,
    objective: process.env.AUTORESEARCH_FORCE_OBJECTIVE?.trim() || `Investigate the explicitly requested ${campaign} target ${targetId}.`,
    fitness_command: campaign === 'mcp'
      ? { args: ['--import', 'tsx', 'scripts/autoresearch/evaluators/mcp/registry.ts', '--metric', 'contrastive-description-coverage'] }
      : { args: ['--import', 'tsx', 'scripts/autoresearch/evaluators/performance/profile.ts'] },
    editable_paths: campaign === 'mcp'
      ? ['packages/mcp-server/src/']
      : ['packages/engine/src/'],
    locked_paths: campaign === 'mcp' ? MCP_LOCKED_PATHS : PERFORMANCE_LOCKED_PATHS,
    baseline_metrics: { forced: true, base_dir: baseDir },
    fitness: {
      primary_name: campaign === 'mcp' ? 'contrastive_description_coverage' : 'profiled_bottleneck_ms',
      higher_is_better: campaign === 'mcp',
    },
    relevant_skills: campaign === 'mcp' ? MCP_SKILLS : PERFORMANCE_SKILLS,
  });
}

export async function selectMcpTarget(baseDir: string): Promise<CampaignTarget | NoTarget> {
  const forced = forcedTarget('mcp', baseDir);
  if (forced) return forced;

  const definitions = getToolDefinitions('stable');
  const expectedStableCount = 36;
  if (definitions.length !== expectedStableCount) {
    return campaignTargetSchema.parse({
      campaign: 'mcp',
      status: 'TARGET_FOUND',
      target_id: 'mcp-stable-registry-count',
      objective: `Restore the stable MCP profile to exactly ${expectedStableCount} registered names without changing tool behavior or adding aliases.`,
      fitness_command: { args: ['--import', 'tsx', 'scripts/autoresearch/evaluators/mcp/registry.ts', '--metric', 'stable-tool-count'] },
      editable_paths: ['packages/mcp-server/src/toolRegistry.ts'],
      locked_paths: MCP_LOCKED_PATHS,
      baseline_metrics: { stable_tool_count: definitions.length, expected_stable_count: expectedStableCount },
      fitness: { primary_name: 'stable_tool_count_error', higher_is_better: false },
      relevant_skills: MCP_SKILLS,
    });
  }

  const contrastivePattern = /\b(do not|don't|prefer|use when|use for|instead of|rather than)\b/i;
  const missingContrast = definitions.filter((definition) => !contrastivePattern.test(definition.description));
  if (missingContrast.length > 0) {
    return campaignTargetSchema.parse({
      campaign: 'mcp',
      status: 'TARGET_FOUND',
      target_id: `mcp-contrastive-description-${shortId(missingContrast[0].name)}`,
      objective: `Add a concise, accurate contrastive routing description for ${missingContrast[0].name} so an assistant can distinguish it from neighboring tools. Preserve its scientific meaning and all existing schema/handler behavior.`,
      fitness_command: { args: ['--import', 'tsx', 'scripts/autoresearch/evaluators/mcp/registry.ts', '--metric', 'contrastive-description-coverage'] },
      editable_paths: ['packages/mcp-server/src/toolRegistry.ts'],
      locked_paths: MCP_LOCKED_PATHS,
      baseline_metrics: {
        stable_tool_count: definitions.length,
        contrastive_description_count: definitions.length - missingContrast.length,
        contrastive_description_coverage: (definitions.length - missingContrast.length) / definitions.length,
      },
      fitness: { primary_name: 'contrastive_description_coverage', higher_is_better: true },
      relevant_skills: MCP_SKILLS,
    });
  }

  if (stableToolNames.some((name) => !definitions.find((definition) => definition.name === name))) {
    return campaignTargetSchema.parse({
      campaign: 'mcp',
      status: 'TARGET_FOUND',
      target_id: 'mcp-stable-registry-integrity',
      objective: 'Restore the central stable tool registry invariant without weakening schemas, descriptions, or handler routing.',
      fitness_command: { args: ['--import', 'tsx', 'scripts/autoresearch/evaluators/mcp/registry.ts', '--metric', 'registry-integrity'] },
      editable_paths: ['packages/mcp-server/src/toolRegistry.ts'],
      locked_paths: MCP_LOCKED_PATHS,
      baseline_metrics: { registry_integrity: 0 },
      fitness: { primary_name: 'registry_integrity', higher_is_better: false },
      relevant_skills: MCP_SKILLS,
    });
  }

  return noTargetSchema.parse({
    campaign: 'mcp',
    status: 'NO_TARGET',
    reason: 'All deterministic MCP registry checks currently satisfy their thresholds; no measured product target is available.',
  });
}

function readProfileReport(baseDir: string): { path: string; rows: Array<Record<string, unknown>> } | undefined {
  const configured = process.env.AUTORESEARCH_PROFILE_REPORT?.trim();
  const candidates = configured
    ? [configured]
    : [join(baseDir, 'artifacts/perf/latest.json'), join(baseDir, 'artifacts/perf/profile.json')];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const value = JSON.parse(readFileSync(path, 'utf8'));
      const rows = Array.isArray(value) ? value : Array.isArray(value.rows) ? value.rows : [];
      if (rows.length > 0) return { path, rows };
    } catch {
      // A malformed optional report is not a candidate target.
    }
  }
  return undefined;
}

export async function selectPerformanceTarget(baseDir: string): Promise<CampaignTarget | NoTarget> {
  const forced = forcedTarget('performance', baseDir);
  if (forced) return forced;

  const report = readProfileReport(baseDir);
  if (!report) {
    return noTargetSchema.parse({
      campaign: 'performance',
      status: 'NO_TARGET',
      reason: 'No reviewed process-isolated profile report is present; parser work and speculative timing searches are excluded.',
    });
  }

  const candidates = report.rows.flatMap((row) => [
    typeof row.genMs === 'number' ? { name: 'networkgen', value: row.genMs } : undefined,
    typeof row.simMs === 'number' ? { name: 'simulation', value: row.simMs } : undefined,
  ]).filter((value): value is { name: string; value: number } => value !== undefined);
  const dominant = candidates.sort((a, b) => b.value - a.value)[0];
  if (!dominant) {
    return noTargetSchema.parse({
      campaign: 'performance',
      status: 'NO_TARGET',
      reason: `Profile report ${report.path} contains no supported network-generation or simulation timing metric.`,
    });
  }

  const editablePaths = dominant.name === 'networkgen'
    ? ['packages/engine/src/services/graph/']
    : ['packages/engine/src/services/simulation/'];
  return campaignTargetSchema.parse({
    campaign: 'performance',
    status: 'TARGET_FOUND',
    target_id: `performance-${dominant.name}`,
    objective: `Improve the measured ${dominant.name} bottleneck from the reviewed profile while preserving species/reaction counts, deterministic trajectory hashes, and scientific outputs. Do not target parser speed.`,
    fitness_command: {
      args: ['--import', 'tsx', 'scripts/autoresearch/evaluators/performance/profile.ts', '--report', report.path, '--metric', dominant.name],
    },
    editable_paths: editablePaths,
    locked_paths: PERFORMANCE_LOCKED_PATHS,
    baseline_metrics: { bottleneck: dominant.name, value_ms: dominant.value, report: report.path },
    fitness: { primary_name: `${dominant.name}_ms`, higher_is_better: false },
    relevant_skills: PERFORMANCE_SKILLS,
  });
}

export function currentBaseSha(baseDir: string): string {
  return runGitSync(baseDir, ['rev-parse', 'HEAD']);
}
