import { join } from 'node:path';

import { boardResultSchema, type BoardResult, type CandidateResult, type PromotionRecord, type TargetSelection } from './schemas.js';
import { writeJson } from './utils.js';

export function renderBoard(board: BoardResult): string {
  const lines = [
    `# Autoresearch board: ${board.run_id}`,
    '',
    `- Frozen base: \`${board.base_sha}\``,
    `- Candidates recorded: ${board.candidates.length}`,
    `- Winners: ${Object.keys(board.winners).length}`,
    '',
    '## Targets',
    '',
    '| Campaign | Status | Target | Reason/objective |',
    '| --- | --- | --- | --- |',
  ];
  for (const [campaign, selection] of Object.entries(board.targets)) {
    if (selection.status === 'TARGET_FOUND') {
      lines.push(`| ${campaign} | TARGET_FOUND | \`${selection.target_id}\` | ${selection.objective} |`);
    } else {
      lines.push(`| ${campaign} | NO_TARGET | — | ${selection.reason} |`);
    }
  }
  lines.push('', '## Candidates', '', '| Campaign | Generation | Candidate | Status | Primary metric | Changed files |', '| --- | ---: | ---: | --- | --- | ---: |');
  for (const candidate of board.candidates) {
    lines.push(`| ${candidate.campaign} | ${candidate.generation} | ${candidate.candidate} | ${candidate.status} | ${candidate.fitness ? `${candidate.fitness.primary_name}: ${candidate.fitness.candidate}` : '—'} | ${candidate.changed_files.length} |`);
  }
  lines.push('', '## Winners', '');
  if (Object.keys(board.winners).length === 0) {
    lines.push('No candidate passed every hard guard and strictly improved its frozen-base metric.');
  } else {
    for (const [campaign, winner] of Object.entries(board.winners)) {
      lines.push(`- ${campaign}: candidate ${winner.candidate}, generation ${winner.generation}, ${winner.fitness?.primary_name}=${winner.fitness?.candidate}`);
    }
  }
  lines.push('', '## Promotions', '');
  if (board.promotions.length === 0) {
    lines.push('No promotion requested.');
  } else {
    for (const promotion of board.promotions) {
      lines.push(`- ${promotion.campaign}/${promotion.target_id}: ${promotion.status}${promotion.pull_request_url ? ` ([PR](${promotion.pull_request_url}))` : ''}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export async function writeBoard(outputDirectory: string, value: {
  run_id: string;
  base_sha: string;
  targets: Record<string, TargetSelection>;
  candidates: CandidateResult[];
  winners: Record<string, CandidateResult>;
  promotions?: PromotionRecord[];
}): Promise<BoardResult> {
  const board = boardResultSchema.parse({ ...value, promotions: value.promotions ?? [] });
  await writeJson(join(outputDirectory, 'results.json'), board);
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'board.md'), renderBoard(board), 'utf8');
  return board;
}
