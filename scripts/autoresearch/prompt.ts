import type { CampaignTarget } from './schemas.js';

const COMMON_LOCKED_PATHS = [
  '.github/workflows/autoresearch.yml',
  'scripts/autoresearch/evaluators/',
  'scripts/autoresearch/rank.ts',
  'scripts/autoresearch/promote.ts',
  'scripts/run_full_tests.mjs',
  'tests/profile-everything.spec.ts',
  'scripts/compare_profile_runs.mjs',
  'tests/',
  'artifacts/',
];

export function buildCandidatePrompt(
  target: CampaignTarget,
  candidate: number,
  generation: number,
  baseSha: string,
): string {
  const skillPaths = [...new Set([
    ...target.relevant_skills,
    '.agents/skills/systematic-debugging/SKILL.md',
    '.agents/skills/verification-before-completion/SKILL.md',
  ])];
  return [
    `You are candidate ${candidate} in generation ${generation} of an independent multistart autoresearch campaign for BNG Playground.`,
    '',
    'BASE:',
    '- repository: akutuva21/julesplayground',
    `- frozen base commit: ${baseSha}`,
    `- campaign: ${target.campaign}`,
    `- target: ${target.target_id}`,
    '',
    'READ FIRST:',
    '- AGENTS.md',
    ...skillPaths.map((path) => `- ${path}`),
    '',
    'OBJECTIVE:',
    target.objective,
    '',
    'IMMUTABLE FITNESS:',
    `- ${target.fitness.primary_name} (${target.fitness.higher_is_better ? 'higher' : 'lower'} is better)`,
    `- Run: ${['node', ...target.fitness_command.args].map((part) => JSON.stringify(part)).join(' ')}`,
    '- Preserve all semantic, scientific, and protocol guards reported by the evaluator.',
    '',
    'EDITABLE SCOPE:',
    ...target.editable_paths.map((path) => `- ${path}`),
    '',
    'LOCKED:',
    ...[...COMMON_LOCKED_PATHS, ...target.locked_paths].map((path) => `- ${path}`),
    '',
    'RULES:',
    '1. Investigate and prove the measured bottleneck or failure before editing.',
    '2. Make one coherent root-cause improvement within the editable scope.',
    '3. Do not modify the evaluator, benchmark, threshold, tests, or target definition.',
    '4. Do not manufacture a diff. If there is no genuine improvement, leave source unchanged.',
    '5. Do not open a pull request and do not coordinate with other candidates.',
    '6. Run the required verification before claiming success.',
    '7. In the final message, state the root cause, changed files, verification, and caveats.',
    '',
    'Your output will be extracted as a change-set patch and independently evaluated from the frozen base.',
  ].join('\n');
}

export function buildRefinementPrompt(
  target: CampaignTarget,
  parentPatch: string,
  baseSha: string,
): string {
  return [
    buildCandidatePrompt(target, 1, 2, baseSha),
    '',
    'GENERATION-1 CONTEXT:',
    'A parent candidate produced the patch below and passed the hard guards.',
    'Preserve its measured win while looking for a cleaner or stronger implementation of the same objective.',
    'Evaluate against the original frozen-base baseline; do not weaken the fitness criterion.',
    'If no improvement is possible, make no source changes.',
    '',
    'PARENT PATCH:',
    '```diff',
    parentPatch,
    '```',
  ].join('\n');
}

export const globalLockedPaths = COMMON_LOCKED_PATHS;
