import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { campaignTargetSchema, candidateResultSchema, type CampaignTarget, type CandidateResult } from './schemas.js';

export function isEligibleWinner(candidate: CandidateResult, target: CampaignTarget): boolean {
  if (candidate.status !== 'VALID_WIN' || !candidate.fitness) return false;
  if (!candidate.guards.locked_paths_clean || !candidate.guards.typecheck || !candidate.guards.tests || !candidate.guards.scientific_suite) return false;
  if (candidate.fitness.primary_name !== target.fitness.primary_name || candidate.fitness.higher_is_better !== target.fitness.higher_is_better) return false;
  return target.fitness.higher_is_better
    ? candidate.fitness.candidate > candidate.fitness.baseline
    : candidate.fitness.candidate < candidate.fitness.baseline;
}

function improvement(candidate: CandidateResult, target: CampaignTarget): number {
  if (!candidate.fitness) return Number.NEGATIVE_INFINITY;
  const delta = candidate.fitness.candidate - candidate.fitness.baseline;
  return target.fitness.higher_is_better ? delta : -delta;
}

export function rankCandidates(candidates: CandidateResult[], target: CampaignTarget): CandidateResult[] {
  return [...candidates].sort((left, right) => {
    const leftEligible = isEligibleWinner(left, target);
    const rightEligible = isEligibleWinner(right, target);
    if (leftEligible !== rightEligible) return leftEligible ? -1 : 1;
    const improvementDifference = improvement(right, target) - improvement(left, target);
    if (improvementDifference !== 0) return improvementDifference;
    if (left.changed_files.length !== right.changed_files.length) return left.changed_files.length - right.changed_files.length;
    if (left.generation !== right.generation) return left.generation - right.generation;
    return left.candidate - right.candidate;
  });
}

export function selectWinner(candidates: CandidateResult[], target: CampaignTarget): CandidateResult | undefined {
  return rankCandidates(candidates, target).find((candidate) => isEligibleWinner(candidate, target));
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1]?.endsWith('rank.ts')) {
  const targetPath = argument('--target');
  const resultsPath = argument('--results');
  if (!targetPath || !resultsPath) throw new Error('Usage: rank.ts --target <target.json> --results <results.json>');
  const target = campaignTargetSchema.parse(JSON.parse(await readFile(resolve(targetPath), 'utf8')));
  const parsed = JSON.parse(await readFile(resolve(resultsPath), 'utf8')) as unknown;
  const rawCandidates = Array.isArray(parsed) ? parsed : (parsed as { candidates?: unknown[] }).candidates ?? [];
  const candidates = rawCandidates.map((candidate) => candidateResultSchema.parse(candidate));
  const ranked = rankCandidates(candidates, target);
  process.stdout.write(`${JSON.stringify({ ranked, winner: selectWinner(ranked, target) ?? null })}\n`);
}
