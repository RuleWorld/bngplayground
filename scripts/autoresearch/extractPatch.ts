import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { jules, parseUnidiff, type JulesClient } from '@google/jules-sdk';
import { sessionRecordSchema, type Campaign, type SessionRecord } from './schemas.js';
import { writeJson } from './utils.js';

export type ExtractedPatch = {
  status: 'VALID_WIN' | 'NO_CHANGE' | 'SESSION_FAILED' | 'EVALUATION_ERROR';
  sessionRecord: SessionRecord;
  patchPath?: string;
  patch?: string;
  patchSha256?: string;
};

export async function extractPatch(options: {
  client?: JulesClient;
  sessionId: string;
  runId: string;
  candidate: number;
  generation: number;
  campaign: Campaign;
  targetId: string;
  baseSha: string;
  outputDirectory: string;
}): Promise<ExtractedPatch> {
  const client = options.client ?? jules;
  const session = client.session(options.sessionId);
  const startedAt = new Date().toISOString();
  let finalMessage: string | undefined;
  try {
    const outcome = await session.result();
    const generatedFiles = outcome.generatedFiles().all().map((file) => file.path);
    finalMessage = outcome.generatedFiles().get('answer.md')?.content;
    const artifact = outcome.changeSet();
    const patch = artifact?.gitPatch.unidiffPatch?.trim() ?? '';
    const recordBase: SessionRecord = sessionRecordSchema.parse({
      session_id: options.sessionId,
      candidate: options.candidate,
      generation: options.generation,
      campaign: options.campaign,
      target_id: options.targetId,
      base_sha: options.baseSha,
      state: outcome.state,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      ...(finalMessage ? { final_message: finalMessage } : {}),
      generated_files: generatedFiles,
    });

    if (outcome.state !== 'completed') {
      await writeJson(join(options.outputDirectory, 'session.json'), recordBase);
      return { status: 'SESSION_FAILED', sessionRecord: recordBase };
    }
    if (!patch) {
      await writeJson(join(options.outputDirectory, 'session.json'), recordBase);
      return { status: 'NO_CHANGE', sessionRecord: recordBase };
    }

    parseUnidiff(patch);
    const patchSha256 = createHash('sha256').update(patch).digest('hex');
    const patchPath = join(options.outputDirectory, 'candidate.patch');
    const updatedRecord = sessionRecordSchema.parse({ ...recordBase, patch_path: patchPath });
    await writeJson(join(options.outputDirectory, 'session.json'), updatedRecord);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(patchPath, `${patch}\n`, 'utf8');
    await writeJson(join(options.outputDirectory, 'patch.json'), {
      session_id: options.sessionId,
      base_commit_id: artifact?.gitPatch.baseCommitId,
      suggested_commit_message: artifact?.gitPatch.suggestedCommitMessage,
      patch_sha256: patchSha256,
      files: parseUnidiff(patch),
    });
    return { status: 'VALID_WIN', sessionRecord: updatedRecord, patchPath, patch, patchSha256 };
  } catch (error) {
    const fallback = sessionRecordSchema.parse({
      session_id: options.sessionId,
      candidate: options.candidate,
      generation: options.generation,
      campaign: options.campaign,
      target_id: options.targetId,
      base_sha: options.baseSha,
      state: 'failed',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      ...(finalMessage ? { final_message: finalMessage } : {}),
      generated_files: [],
    });
    await writeJson(join(options.outputDirectory, 'session.json'), fallback);
    await writeJson(join(options.outputDirectory, 'error.json'), {
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: 'EVALUATION_ERROR', sessionRecord: fallback };
  }
}

if (process.argv[1]?.endsWith('extractPatch.ts')) {
  const sessionId = process.argv[2];
  if (!sessionId) throw new Error('Usage: extractPatch.ts <session-id>');
  const outputDirectory = process.env.AUTORESEARCH_OUTPUT ?? 'artifacts/autoresearch/manual';
  const result = await extractPatch({
    sessionId,
    runId: process.env.AUTORESEARCH_RUN_ID ?? 'manual',
    candidate: Number(process.env.AUTORESEARCH_CANDIDATE ?? 1),
    generation: Number(process.env.AUTORESEARCH_GENERATION ?? 1),
    campaign: (process.env.AUTORESEARCH_CAMPAIGN as Campaign | undefined) ?? 'mcp',
    targetId: process.env.AUTORESEARCH_TARGET_ID ?? 'manual',
    baseSha: process.env.AUTORESEARCH_BASE_SHA ?? 'unknown',
    outputDirectory,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
