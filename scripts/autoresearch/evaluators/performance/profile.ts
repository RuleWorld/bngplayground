import { readFileSync } from 'node:fs';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const reportPath = argument('--report');
const metric = argument('--metric') ?? 'networkgen';
if (!reportPath) {
  process.stdout.write(`${JSON.stringify({ primary_name: `${metric}_ms`, value: Number.POSITIVE_INFINITY, note: 'No profile report supplied' })}\n`);
  process.exit(0);
}

const parsed = JSON.parse(readFileSync(reportPath, 'utf8')) as unknown;
const rows = Array.isArray(parsed)
  ? parsed
  : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown[] }).rows)
    ? (parsed as { rows: unknown[] }).rows
    : [];
const key = metric === 'networkgen' ? 'genMs' : 'simMs';
const values = rows
  .map((row) => row && typeof row === 'object' ? (row as Record<string, unknown>)[key] : undefined)
  .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
const value = values.length === 0 ? Number.POSITIVE_INFINITY : values.reduce((sum, entry) => sum + entry, 0) / values.length;
process.stdout.write(`${JSON.stringify({ primary_name: `${metric}_ms`, value, samples: values.length })}\n`);
