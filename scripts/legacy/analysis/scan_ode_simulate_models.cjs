const fs = require('fs');
const path = require('path');

function stripBnglCommentLines(code) {
  return code.replace(/^\s*#.*$/gm, '');
}

const ODE_SIMULATE_ACTION_RE = /\b(?:simulate\s*\(\s*\{[\s\S]*?\bmethod\s*=>\s*["']ode["'][\s\S]*?\}\s*\)|simulate_ode\s*\()\s*/i;

function listFilesRecursive(rootDir) {
  const out = [];
  const stack = [rootDir];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || !fs.existsSync(cur)) continue;

    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile()) {
        out.push(full);
      }
    }
  }

  return out;
}

function resolveRuleHubRoot(projectRoot) {
  const fromEnv = process.env.RULEHUB_ROOT && process.env.RULEHUB_ROOT.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (fs.existsSync(resolved)) return resolved;
  }

  const sibling = path.resolve(projectRoot, '..', 'RuleHub');
  return fs.existsSync(sibling) ? sibling : null;
}

function classifyRuleHubRel(rel) {
  if (rel.startsWith('Published/')) return 'rulehub-published';
  if (rel.startsWith('Contributed/BNGPlayground_Examples/')) return 'rulehub-example';
  if (rel.startsWith('Contributed/BNGPlayground_Validation/')) return 'rulehub-validation';
  if (rel.startsWith('Contributed/BNGPlayground_PublicRuntime/')) return 'rulehub-runtime';
  if (rel.startsWith('Tutorials/')) return 'rulehub-tutorial';
  if (rel.startsWith('PyBioNetGen/')) return 'rulehub-pybionetgen';
  return 'rulehub-other';
}

function readCompatibleSetFromConstants(constantsPath) {
  const txt = fs.readFileSync(constantsPath, 'utf8');
  // Be tolerant of formatting/CRLF differences in constants.ts.
  // Expected shape: const BNG2_COMPATIBLE_MODELS = new Set([ ... ]);
  const m = txt.match(
    /BNG2_COMPATIBLE_MODELS\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)\s*;?/
  );
  if (!m) return new Set();

  const body = m[1];
  const ids = [...body.matchAll(/'([^']+)'/g)].map((x) => x[1]);
  return new Set(ids);
}

function main() {
  const projectRoot = process.cwd();
  const ruleHubRoot = resolveRuleHubRoot(projectRoot);
  if (!ruleHubRoot) {
    console.error('RuleHub checkout not found. Set RULEHUB_ROOT or place RuleHub beside this repo.');
    process.exit(2);
  }

  const roots = [
    path.join(ruleHubRoot, 'Published'),
    path.join(ruleHubRoot, 'Contributed', 'BNGPlayground_Examples'),
    path.join(ruleHubRoot, 'Contributed', 'BNGPlayground_Validation'),
    path.join(ruleHubRoot, 'Contributed', 'BNGPlayground_PublicRuntime'),
    path.join(ruleHubRoot, 'Tutorials'),
    path.join(ruleHubRoot, 'PyBioNetGen'),
  ];

  const constantsPath = path.join(projectRoot, 'constants.ts');
  const compatible = fs.existsSync(constantsPath)
    ? readCompatibleSetFromConstants(constantsPath)
    : new Set();

  const candidates = [];
  const byKind = {
    'rulehub-published': new Set(),
    'rulehub-example': new Set(),
    'rulehub-validation': new Set(),
    'rulehub-runtime': new Set(),
    'rulehub-tutorial': new Set(),
    'rulehub-pybionetgen': new Set(),
    'rulehub-other': new Set(),
  };

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const files = listFilesRecursive(root);
    for (const file of files) {
      if (!file.endsWith('.bngl')) continue;
      const code = stripBnglCommentLines(fs.readFileSync(file, 'utf8'));
      if (!ODE_SIMULATE_ACTION_RE.test(code)) continue;

      const id = path.basename(file, '.bngl');
      const rel = path.relative(ruleHubRoot, file).replace(/\\/g, '/');
      const kind = classifyRuleHubRel(rel);
      byKind[kind].add(id);
      candidates.push({
        id,
        rel,
        kind,
        inCompatibleSet: compatible.has(id),
      });
    }
  }

  candidates.sort((a, b) => a.id.localeCompare(b.id));

  const inSet = candidates.filter((c) => c.inCompatibleSet);
  const notInSet = candidates.filter((c) => !c.inCompatibleSet);

  const uniqueIds = new Set(candidates.map((c) => c.id));
  const uniqueInSet = new Set(inSet.map((c) => c.id));
  const uniqueNotInSet = new Set(notInSet.map((c) => c.id));

  console.log('ODE simulate candidates found:', candidates.length);
  console.log(' - in BNG2_COMPATIBLE_MODELS:', inSet.length);
  console.log(' - NOT in BNG2_COMPATIBLE_MODELS:', notInSet.length);

  console.log('\nUnique IDs:');
  console.log(' - total:', uniqueIds.size);
  console.log(' - in BNG2_COMPATIBLE_MODELS:', uniqueInSet.size);
  console.log(' - NOT in BNG2_COMPATIBLE_MODELS:', uniqueNotInSet.size);

  console.log('\nUnique IDs by folder (ODE simulate present):');
  console.log(' - rulehub-published:', byKind['rulehub-published'].size);
  console.log(' - rulehub-example:', byKind['rulehub-example'].size);
  console.log(' - rulehub-validation:', byKind['rulehub-validation'].size);
  console.log(' - rulehub-runtime:', byKind['rulehub-runtime'].size);
  console.log(' - rulehub-tutorial:', byKind['rulehub-tutorial'].size);
  console.log(' - rulehub-pybionetgen:', byKind['rulehub-pybionetgen'].size);
  console.log(' - rulehub-other:', byKind['rulehub-other'].size);

  const visibleLike = new Set([
    ...[...byKind['rulehub-published']].filter((id) => compatible.has(id)),
    ...[...byKind['rulehub-example']].filter((id) => compatible.has(id)),
  ]);
  console.log(
    `\nApprox “UI visible” unique IDs (published+example AND allowlisted AND ODE simulate): ${visibleLike.size}`
  );

  if (notInSet.length) {
    console.log('\nFirst 100 NOT in BNG2_COMPATIBLE_MODELS:');
    for (const c of notInSet.slice(0, 100)) {
      console.log(`  ${c.id} -> ${c.rel}`);
    }
  }

  const nonVisibleKinds = candidates.filter((c) => !['rulehub-published', 'rulehub-example'].includes(c.kind));
  if (nonVisibleKinds.length) {
    console.log(`\nNon-published/example ODE-simulated entries: ${nonVisibleKinds.length}`);
    for (const c of nonVisibleKinds.slice(0, 50)) {
      console.log(`  ${c.id} -> ${c.rel}`);
    }
  }
}

main();
