const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DEFAULT_BNG2_PL =
    'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';

const BNG2_PL = process.env.BNG2_PL || DEFAULT_BNG2_PL;
const PERL = process.env.PERL || 'perl';
const TIMEOUT_MS = Number(process.env.BNG2_TIMEOUT_MS || 120_000);
const ONLY_ID = (process.env.ONLY_ID || '').trim();

// Scan public/models/
const MODEL_ROOT = path.join(PROJECT_ROOT, 'public', 'models');

// Extract BNG2_EXCLUDED_MODELS from constants.ts
function getExcludedModels() {
    const constantsPath = path.join(PROJECT_ROOT, 'constants.ts');
    if (!fs.existsSync(constantsPath)) return new Set();
    
    const content = fs.readFileSync(constantsPath, 'utf8');
    const match = content.match(/export const BNG2_EXCLUDED_MODELS = new Set\(\[([\s\S]*?)\]\);/);
    if (!match) return new Set();
    
    const modelsStr = match[1];
    const excluded = new Set();
    const regex = /'([^']+)'/g;
    let m;
    while ((m = regex.exec(modelsStr)) !== null) {
        excluded.add(m[1]);
    }
    return excluded;
}

const EXCLUDED_MODELS = getExcludedModels();

function listFilesRecursive(rootDir) {
    const out = [];
    const stack = [rootDir];

    while (stack.length) {
        const cur = stack.pop();
        if (!cur || !fs.existsSync(cur)) continue;

        const entries = fs.readdirSync(cur, { withFileTypes: true });
        for (const ent of entries) {
            const full = path.join(cur, ent.name);
            if (ent.isDirectory()) stack.push(full);
            else if (ent.isFile()) out.push(full);
        }
    }

    return out;
}

function shortWorkDirName(id) {
    const hash = crypto.createHash('sha1').update(id).digest('hex').slice(0, 10);
    return `${id}__${hash}`;
}

function verifyOneModel(absBnglPath) {
    const id = path.basename(absBnglPath, '.bngl');
    const outRoot = path.join(PROJECT_ROOT, 'temp_bng_output', 'verify_all_public');
    const workDir = path.join(outRoot, shortWorkDirName(id));

    if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workDir, { recursive: true });

    const localBngl = path.join(workDir, path.basename(absBnglPath));
    const content = fs.readFileSync(absBnglPath, 'utf8');
    fs.writeFileSync(localBngl, content);

    const cmdArgs = [BNG2_PL, path.basename(localBngl)];
    const t0 = Date.now();
    const res = spawnSync(PERL, cmdArgs, {
        cwd: workDir,
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 10,
        windowsHide: true,
    });
    const elapsedMs = Date.now() - t0;

    const timedOut = res.error && res.error.code === 'ETIMEDOUT';
    
    // Check for output files
    const netExists = fs.existsSync(path.join(workDir, `${id}.net`));
    const gdatExists = fs.existsSync(path.join(workDir, `${id}.gdat`));
    const cdatExists = fs.existsSync(path.join(workDir, `${id}.cdat`));
    
    const status = (!timedOut && res.status === 0 && netExists && (gdatExists || cdatExists)) ? 'PASS' : 'FAIL';
    
    let error = '';
    if (timedOut) error = 'TIMEOUT';
    else if (res.status !== 0) error = `EXIT_${res.status}`;
    else if (!netExists) error = 'MISSING_NET';
    else if (!(gdatExists || cdatExists)) error = 'MISSING_GDAT';

    return { id, status, elapsedMs, exitStatus: res.status, timedOut, error };
}

function main() {
    if (!fs.existsSync(BNG2_PL)) {
        console.error('BNG2.pl not found at:', BNG2_PL);
        process.exit(2);
    }

    console.log('Scanning:', MODEL_ROOT);
    const candidates = listFilesRecursive(MODEL_ROOT)
        .filter(f => f.toLowerCase().endsWith('.bngl'));

    if (ONLY_ID) {
        const filtered = candidates.filter(f => path.basename(f, '.bngl') === ONLY_ID);
        if (filtered.length > 0) candidates.length = 0, candidates.push(...filtered);
    }

    console.log(`Found ${candidates.length} candidates.`);
    console.log(`Excluded models: ${EXCLUDED_MODELS.size}`);

    const results = [];
    const skipped = [];
    
    for (let i = 0; i < candidates.length; i++) {
        const file = candidates[i];
        const id = path.basename(file, '.bngl');
        
        if (EXCLUDED_MODELS.has(id)) {
            skipped.push(id);
            continue;
        }

        process.stdout.write(`[${results.length + 1}/${candidates.length - skipped.length}] ${id}... `);

        const r = verifyOneModel(file);
        results.push(r);
        console.log(r.status + (r.error ? ` (${r.error})` : ''));
    }

    const pass = results.filter(r => r.status === 'PASS').map(r => r.id);
    const fail = results.filter(r => r.status === 'FAIL').map(r => r.id);

    console.log('\n=== SUMMARY ===');
    console.log('PASS:', pass.length);
    console.log('FAIL:', fail.length);
    console.log('SKIPPED:', skipped.length);

    const outPath = path.join(PROJECT_ROOT, 'public_models_compatibility.json');
    fs.writeFileSync(outPath, JSON.stringify({ pass, fail, skipped }, null, 2));
    console.log('\nWrote results to:', outPath);
}

main();
