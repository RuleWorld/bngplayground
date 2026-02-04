import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
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
  const constantsContent = fs.readFileSync(path.join(PROJECT_ROOT, 'constants.ts'), 'utf8');
  const match = constantsContent.match(/export const BNG2_COMPATIBLE_MODELS = new Set\(\[([\s\S]*?)\]\);/);
  if (!match) {
    console.error('Could not find BNG2_COMPATIBLE_MODELS in constants.ts');
    process.exit(1);
  }

  const ids = [...match[1].matchAll(/'(.*?)'/g)].map(m => m[1]);
  console.log(`Verifying ${ids.length} models (Parsing ONLY)...`);

  const results = { pass: [], fail: [] };
  const resultsPath = path.join(PROJECT_ROOT, 'verification_results.json');
  const tempDir = path.join(PROJECT_ROOT, 'temp_verify_parsing_v4');
  
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir);

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const bnglPath = path.join(PROJECT_ROOT, 'public', 'models', `${id}.bngl`);
    
    if (!fs.existsSync(bnglPath)) {
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
