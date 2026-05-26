import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RULEHUB_ROOT = process.env.RULEHUB_ROOT
  ? path.resolve(process.env.RULEHUB_ROOT)
  : (fs.existsSync(path.resolve(PROJECT_ROOT, '..', 'RuleHub')) ? path.resolve(PROJECT_ROOT, '..', 'RuleHub') : null);
const BNG2_PL = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';
const PERL = 'perl';

function trimToModelEnd(code) {
  const endModelRe = /\bend\s+model\b/i;
  const match = endModelRe.exec(code);
  if (match) {
    // Keep 'end model' and then add one simple action to make BNG2 happy
    return code.slice(0, match.index + match[0].length) + '\n# No actions\n';
  }
  return code;
}

async function main() {
  const manifestPath = RULEHUB_ROOT ? path.join(RULEHUB_ROOT, 'manifest.json') : null;
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    console.error('Could not find a local RuleHub checkout. Set RULEHUB_ROOT before running this script.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const ids = (Array.isArray(manifest) ? manifest : manifest.models)
    .filter((entry) => entry?.bng2_compatible || entry?.compatibility?.bng2)
    .map((entry) => entry.id)
    .filter(Boolean);
  console.log(`Verifying ${ids.length} models (Parsing ONLY)...`);

  const results = { pass: [], fail: [] };
  const resultsPath = path.join(PROJECT_ROOT, 'verification_results.json');
  const tempDir = path.join(PROJECT_ROOT, 'temp_verify_parsing_v4');
  
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir);

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const entry = (Array.isArray(manifest) ? manifest : manifest.models).find((item) => item.id === id);
    const bnglPath = entry?.path ? path.join(RULEHUB_ROOT, entry.path) : null;
    
    if (!bnglPath || !fs.existsSync(bnglPath)) {
      results.fail.push({ id, error: 'File missing' });
      continue;
    }

    const original = fs.readFileSync(bnglPath, 'utf8');
    const trimmed = trimToModelEnd(original);
    const localBngl = path.join(tempDir, `${id}.bngl`);
    fs.writeFileSync(localBngl, trimmed);

    // Run BNG2.pl. Without actions, it still parses the model.
    const res = spawnSync(PERL, [BNG2_PL, `${id}.bngl`], {
      cwd: tempDir,
      encoding: 'utf8',
      timeout: 5000, 
    });

    if (res.status === 0) {
      console.log(`[${i+1}/${ids.length}] ${id}: PASS`);
      results.pass.push(id);
    } else {
      console.log(`[${i+1}/${ids.length}] ${id}: FAIL`);
      results.fail.push({ id, status: res.status, error: 'Parsing error' });
    }
    
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    try {
      fs.readdirSync(tempDir).forEach(f => {
        if (f.startsWith(id)) fs.rmSync(path.join(tempDir, f), { force: true, recursive: true });
      });
    } catch (e) {}
  }

  console.log('\nVerification Complete.');
  console.log('PASS:', results.pass.length);
  console.log('FAIL:', results.fail.length);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

main().catch(console.error);
