import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type SearchCase = { query: string; expected_any: string[]; top_k: number };
const path = resolve(process.cwd(), 'tests/fixtures/rulehub-search-cases.json');
const cases = JSON.parse(readFileSync(path, 'utf8')) as SearchCase[];
const valid = cases.filter((entry) => entry.query.trim() && entry.expected_any.length > 0 && entry.top_k > 0);
process.stdout.write(`${JSON.stringify({
  primary_name: 'rulehub_fixture_validity',
  value: valid.length / Math.max(cases.length, 1),
  cases: cases.length,
})}\n`);
