const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const BNG2_PL =
  process.env.BNG2_PL ||
  process.env.BNG2_PATH ||
  (process.env.BNGPATH ? path.join(process.env.BNGPATH, 'BNG2.pl') : 'BNG2.pl');
const PERL = process.env.PERL || 'perl';
const TIMEOUT_MS = Number(process.env.BNG2_TIMEOUT_MS || 120_000);
const ONLY_ID = (process.env.ONLY_ID || '').trim();
// VERIFY_MODE:
// - 'ode_outputs' (default): require .net and (.gdat or .cdat)
// - 'parse': only require that BNG2.pl completes successfully (exit status 0)
const VERIFY_MODE = (process.env.VERIFY_MODE || 'ode_outputs').trim().toLowerCase();

// VERIFY_SCOPE:
// - 'published' (default): scan RuleHub Published/
// - 'example': scan RuleHub Contributed/BNGPlayground_Examples/
// - 'both': scan both RuleHub locations
// Back-compat: INCLUDE_EXAMPLE_MODELS=1 implies VERIFY_SCOPE='both'.
let VERIFY_SCOPE = (process.env.VERIFY_SCOPE || 'published').trim().toLowerCase();
const INCLUDE_EXAMPLE_MODELS = (process.env.INCLUDE_EXAMPLE_MODELS || '').trim() === '1';
if (INCLUDE_EXAMPLE_MODELS && VERIFY_SCOPE === 'published') VERIFY_SCOPE = 'both';
if (!['published', 'example', 'both'].includes(VERIFY_SCOPE)) VERIFY_SCOPE = 'published';

function resolveRuleHubRoot(projectRoot) {
  const fromEnv = process.env.RULEHUB_ROOT && process.env.RULEHUB_ROOT.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (fs.existsSync(resolved)) return resolved;
  }

  const sibling = path.resolve(projectRoot, '..', 'RuleHub');
  return fs.existsSync(sibling) ? sibling : null;
}

function stripBnglCommentLines(code) {
  return code.replace(/^\s*#.*$/gm, '');
}

const ODE_SIMULATE_ACTION_RE =
  /\b(?:simulate\s*\(\s*\{[\s\S]*?\bmethod\s*=>\s*["']ode["'][\s\S]*?\}\s*\)|simulate_ode\s*\()\s*/i;

function sanitizeActionsKeepFirstOdeSimulateOnly(code) {
  // Keep the first ODE timecourse simulate active; comment out subsequent simulate* calls.
  // This prevents long SSA runs from dominating verification time.
  const beginRe = /\bbegin\s+actions\b/i;
  const endRe = /\bend\s+actions\b/i;

  const beginMatch = beginRe.exec(code);
  if (!beginMatch) return code;
  const beginIdx = beginMatch.index;

  const afterBeginIdx = beginIdx + beginMatch[0].length;
  const endMatch = endRe.exec(code.slice(afterBeginIdx));
  if (!endMatch) return code;
  const endIdx = afterBeginIdx + endMatch.index;

  const before = code.slice(0, afterBeginIdx);
  const actionsBody = code.slice(afterBeginIdx, endIdx);
  const after = code.slice(endIdx);

  let seenOdeSim = false;
  const lines = actionsBody.split(/\r?\n/);
  const outLines = lines.map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('#')) return line;
    if (!/\b(simulate|simulate_ode)\s*\(/i.test(line)) return line;

    const isOde = /\bsimulate_ode\s*\(/i.test(line) || /\bmethod\s*=>\s*["']ode["']/i.test(line);
    if (isOde && !seenOdeSim) {
      seenOdeSim = true;
      return line;
    }

    // Comment out all other simulate/simulate_ode lines.
    return `# [auto-disabled] ${line}`;
  });

  return `${before}\n${outLines.join('\n')}\n${after}`;
}

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

function safeDirName(relPath) {
  return relPath.replace(/[\\/]/g, '__').replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function shortWorkDirName(relPath, id) {
  const hash = crypto.createHash('sha1').update(relPath).digest('hex').slice(0, 10);
  return safeDirName(`${id}__${hash}`);
}

function tail(str, maxChars = 2000) {
  if (!str) return '';
  if (str.length <= maxChars) return str;
  return str.slice(-maxChars);
}

function verifyOneModel(absBnglPath) {
  const rel = path.relative(PROJECT_ROOT, absBnglPath).replace(/\\/g, '/');
  const id = path.basename(absBnglPath, '.bngl');

  const outRoot = path.join(PROJECT_ROOT, 'temp_bng_output', 'bng2_verify_published');
  const workDir = path.join(outRoot, shortWorkDirName(rel, id));
  if (fs.existsSync(workDir)) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  fs.mkdirSync(workDir, { recursive: true });

  const localBngl = path.join(workDir, path.basename(absBnglPath));
  const original = fs.readFileSync(absBnglPath, 'utf8');
  const sanitized = sanitizeActionsKeepFirstOdeSimulateOnly(original);
  fs.writeFileSync(localBngl, sanitized);

  const cmdArgs = [BNG2_PL, path.basename(localBngl)];
  const t0 = Date.now();
  const res = spawnSync(PERL, cmdArgs, {
    cwd: workDir,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 50,
    windowsHide: true,
  });
  const elapsedMs = Date.now() - t0;

  const stderr = res.stderr || '';
  const stdout = res.stdout || '';

  const produced = fs.readdirSync(workDir);
  const netFiles = produced.filter((f) => f.toLowerCase().endsWith('.net'));
  const gdatFiles = produced.filter((f) => f.toLowerCase().endsWith('.gdat'));
  const cdatFiles = produced.filter((f) => f.toLowerCase().endsWith('.cdat'));

  const hasNet = netFiles.length > 0;
  const hasGdat = gdatFiles.length > 0;
  const hasCdat = cdatFiles.length > 0;

  // Classification
  const timedOut = res.error && res.error.code === 'ETIMEDOUT';
  let status = 'FAIL';
  if (VERIFY_MODE === 'parse') {
    // In parse-only mode, treat successful completion as PASS even if no outputs are produced.
    if (!timedOut && res.status === 0) status = 'PASS';
  } else {
    // Default: ODE timecourse verification expects outputs.
    if (hasNet && (hasGdat || hasCdat)) status = 'PASS';
    else if (hasNet && timedOut) status = 'PARSE_OK_BUT_TIMEOUT';
    else if (hasNet) status = 'PARSE_OK_OUTPUT_MISSING';
  }

  const logPath = path.join(workDir, 'bng2_run.log');
  fs.writeFileSync(
    logPath,
    [
      `REL: ${rel}`,
      `ID: ${id}`,
      `VERIFY_MODE: ${VERIFY_MODE}`,
      `TIMEOUT_MS: ${TIMEOUT_MS}`,
      `CMD: ${PERL} ${cmdArgs.map((a) => JSON.stringify(a)).join(' ')}`,
      `CWD: ${workDir}`,
      `EXIT_STATUS: ${res.status}`,
      `SIGNAL: ${res.signal}`,
      `TIMED_OUT: ${timedOut}`,
      `ELAPSED_MS: ${elapsedMs}`,
      `HAS_NET: ${hasNet}`,
      `HAS_GDAT: ${hasGdat}`,
      `HAS_CDAT: ${hasCdat}`,
      `NET_FILES: ${netFiles.join(', ')}`,
      `GDAT_FILES: ${gdatFiles.join(', ')}`,
      `CDAT_FILES: ${cdatFiles.join(', ')}`,
      `\n=== STDOUT (tail) ===\n${tail(stdout)}`,
      `\n=== STDERR (tail) ===\n${tail(stderr)}`,
    ].join('\n')
  );

  return {
    id,
    rel,
    status,
    elapsedMs,
    exitStatus: res.status,
    signal: res.signal,
    timedOut,
    hasNet,
    hasGdat,
    hasCdat,
    netFiles,
    gdatFiles,
    cdatFiles,
    workDir: path.relative(PROJECT_ROOT, workDir).replace(/\\/g, '/'),
  };
}

function main() {
  if (!fs.existsSync(BNG2_PL)) {
    console.error('BNG2.pl not found at:', BNG2_PL);
    process.exit(2);
  }

  const ruleHubRoot = resolveRuleHubRoot(PROJECT_ROOT);
  if (!ruleHubRoot) {
    console.error('RuleHub checkout not found. Set RULEHUB_ROOT or place RuleHub beside this repo.');
    process.exit(2);
  }

  const roots = [];
  if (VERIFY_SCOPE === 'published' || VERIFY_SCOPE === 'both') {
    roots.push(path.join(ruleHubRoot, 'Published'));
  }
  if (VERIFY_SCOPE === 'example' || VERIFY_SCOPE === 'both') {
    roots.push(path.join(ruleHubRoot, 'Contributed', 'BNGPlayground_Examples'));
  }

  const candidates = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const file of listFilesRecursive(root)) {
      if (!file.toLowerCase().endsWith('.bngl')) continue;
      if (VERIFY_MODE !== 'parse') {
        const code = stripBnglCommentLines(fs.readFileSync(file, 'utf8'));
        if (!ODE_SIMULATE_ACTION_RE.test(code)) continue;
      }
      const id = path.basename(file, '.bngl');
      if (ONLY_ID && id !== ONLY_ID) continue;
      candidates.push(file);
    }
  }

  candidates.sort((a, b) => a.localeCompare(b));

  console.log('BNG2.pl:', BNG2_PL);
  console.log('Perl:', PERL);
  console.log('Verify mode:', VERIFY_MODE);
  console.log('Verify scope:', VERIFY_SCOPE);
  console.log('Timeout (ms):', TIMEOUT_MS);
  if (ONLY_ID) console.log('ONLY_ID:', ONLY_ID);
  const labelBase =
    VERIFY_SCOPE === 'example'
      ? 'RuleHub example model'
      : VERIFY_SCOPE === 'both'
        ? 'RuleHub published+example model'
        : 'RuleHub published model';
  console.log(
    VERIFY_MODE === 'parse'
      ? `${labelBase} candidates (all .bngl):`
      : `${labelBase} ODE simulate candidates:`
  , candidates.length);

  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const file = candidates[i];
    const rel = path.relative(PROJECT_ROOT, file).replace(/\\/g, '/');
    console.log(`\n[${i + 1}/${candidates.length}] ${rel}`);

    const r = verifyOneModel(file);
    results.push(r);

    console.log(
      `  ${r.status} (net=${r.hasNet ? 'y' : 'n'} gdat=${r.hasGdat ? 'y' : 'n'} cdat=${r.hasCdat ? 'y' : 'n'}) ${Math.round(
        r.elapsedMs / 1000
      )}s`
    );
  }

  const pass = results.filter((r) => r.status === 'PASS');
  const parseOkButTimeout = results.filter((r) => r.status === 'PARSE_OK_BUT_TIMEOUT');
  const parseOkOutputMissing = results.filter((r) => r.status === 'PARSE_OK_OUTPUT_MISSING');
  const fail = results.filter((r) => r.status === 'FAIL');

  console.log('\n=== SUMMARY ===');
  console.log('PASS:', pass.length);
  console.log('PARSE_OK_BUT_TIMEOUT:', parseOkButTimeout.length);
  console.log('PARSE_OK_OUTPUT_MISSING:', parseOkOutputMissing.length);
  console.log('FAIL:', fail.length);

  const reportPath = path.join(
    PROJECT_ROOT,
    'temp_bng_output',
    `bng2_verify_${VERIFY_SCOPE}_${VERIFY_MODE}_report.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    bng2Pl: BNG2_PL,
    perl: PERL,
    verifyMode: VERIFY_MODE,
    verifyScope: VERIFY_SCOPE,
    timeoutMs: TIMEOUT_MS,
    roots: roots.map((r) => path.relative(PROJECT_ROOT, r).replace(/\\/g, '/')),
    results,
  }, null, 2));

  console.log('\nWrote report:', path.relative(PROJECT_ROOT, reportPath).replace(/\\/g, '/'));
  console.log('Output/log folders under: temp_bng_output/bng2_verify_published/');
}

main();
