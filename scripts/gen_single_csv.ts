/**
 * Generate a single web output CSV for a given BNGL file.
 * Usage: npx tsx scripts/gen_single_csv.ts <bngl_path> <output_csv_path>
 */
import * as fs from 'fs';
import { parseBNGLWithANTLR } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../packages/engine/src/services/simulation/NetworkExpansion';
import { simulate } from '../packages/engine/src/services/simulation/SimulationLoop';
import { getSimulationOptionsFromParsedModel } from '../packages/engine/src/utils/simulationOptions';

const [bnglPath, outPath] = process.argv.slice(2);
if (!bnglPath || !outPath) { console.error('Usage: gen_single_csv.ts <bngl> <out.csv>'); process.exit(1); }

async function main() {
  const code = fs.readFileSync(bnglPath, 'utf8');
  const parsed = parseBNGLWithANTLR(code);
  if (!parsed.model) { console.error('Parse failed'); process.exit(1); }
  const expanded = await generateExpandedNetwork(parsed.model, () => {}, () => {});
  const opts = getSimulationOptionsFromParsedModel(expanded, 'ode', { solver: 'cvode' });
  const result = await simulate(0, expanded, opts, { checkCancelled: () => {}, postMessage: (() => {}) as any });
  const obs = (result.headers || []).filter((h: string) => h !== 'time');
  if (!result.data || result.data.length < 2 || obs.length === 0) {
    console.error('No observable data produced');
    process.exit(1);
  }
  const rows = result.data.map((row: any) => [String(row.time ?? 0), ...obs.map((h: string) => String(row[h] ?? 0))].join(','));
  fs.writeFileSync(outPath, ['time,' + obs.join(','), ...rows].join('\n') + '\n');
  console.log('OK: ' + obs.length + ' obs, ' + result.data.length + ' rows');
}

main().catch(e => { console.error(e.message?.slice(0, 200)); process.exit(1); });
