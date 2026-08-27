import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type RoutingCase = {
  intent: string;
  expected: string[];
  avoid: string[];
};

const path = resolve(process.cwd(), 'tests/fixtures/mcp-routing-intents.json');
const cases = JSON.parse(readFileSync(path, 'utf8')) as RoutingCase[];
const valid = cases.filter((entry) => entry.intent.trim() && entry.expected.length > 0 && entry.avoid.length > 0);
process.stdout.write(`${JSON.stringify({
  primary_name: 'routing_fixture_validity',
  value: valid.length / Math.max(cases.length, 1),
  cases: cases.length,
})}\n`);
