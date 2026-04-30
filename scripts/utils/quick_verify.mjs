import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BNG_PATH = "C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl";
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RULEHUB_ROOT = process.env.RULEHUB_ROOT
  ? path.resolve(process.env.RULEHUB_ROOT)
  : path.resolve(PROJECT_ROOT, '..', 'RuleHub');
const PUBLISHED_MODELS_DIR = path.join(RULEHUB_ROOT, 'Published');
const TEMP_DIR = path.resolve(__dirname, '../temp_verify');

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

function getBnglFiles(dir) {
  let files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(getBnglFiles(fullPath));
    } else if (item.name.endsWith('.bngl')) {
      files.push(fullPath);
    }
  }
  return files;
}

function verifyModel(filePath) {
  const modelName = path.basename(filePath, '.bngl');
  const tempPath = path.join(TEMP_DIR, path.basename(filePath));
  
  // Copy file to temp dir
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check for NFsim usage (simulate_nf or method=>"nf")
  const usesNFsim = content.includes('simulate_nf') || content.includes('method=>"nf"') || content.includes("method=>'nf'");
  if (usesNFsim) {
    return { model: modelName, compatible: false, reason: 'Uses NFsim' };
  }
  
  // Strip simulate commands to focus on parsing/network generation
  content = content.replace(/^\s*simulate_.*$/gm, '# simulate removed');
  fs.writeFileSync(tempPath, content);
  
    try {
      execFileSync('perl', [BNG_PATH, tempPath], { 
      cwd: TEMP_DIR, 
      stdio: 'ignore',
      timeout: 60000
    });
    return { model: modelName, compatible: true };
  } catch (e) {
    return { model: modelName, compatible: false, reason: 'BNG2.pl error' };
  }
}

const files = getBnglFiles(PUBLISHED_MODELS_DIR);
console.log(`Verifying ${files.length} models...\n`);

const compatible = [];
const incompatible = [];

for (const file of files) {
  process.stdout.write(`${path.basename(file, '.bngl')}... `);
  const result = verifyModel(file);
  if (result.compatible) {
    console.log('✅');
    compatible.push(result.model);
  } else {
    console.log(`❌ (${result.reason})`);
    incompatible.push(result);
  }
}

console.log('\n=== SUMMARY ===');
console.log(`Compatible: ${compatible.length}/${files.length}`);
console.log(`Incompatible: ${incompatible.length}/${files.length}`);

console.log('\n=== COMPATIBLE MODEL IDs ===');
console.log(JSON.stringify(compatible, null, 2));

console.log('\n=== INCOMPATIBLE MODELS ===');
incompatible.forEach(m => console.log(`  ${m.model}: ${m.reason}`));
