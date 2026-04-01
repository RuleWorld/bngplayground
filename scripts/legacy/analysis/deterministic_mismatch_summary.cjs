const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'scripts', 'comparison_report_full.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const mismatches = report.filter((r) => r.status === 'mismatch');

function methodInfo(model) {
  const file = path.join(root, 'public', 'models', `${model}.bngl`);
  if (!fs.existsSync(file)) return { method: 'missing', exists: false };

  const txt = fs.readFileSync(file, 'utf8').toLowerCase();
  const norm = txt.replace(/\s+/g, '');

  const isSSA = norm.includes("method=>'ssa'") || norm.includes('method=>"ssa"');
  const isNF =
    norm.includes("method=>'nf'") ||
    norm.includes('method=>"nf"') ||
    norm.includes("method=>'nfsim'") ||
    norm.includes('method=>"nfsim"');

  if (isSSA) return { method: 'ssa', exists: true };
  if (isNF) return { method: 'nfsim', exists: true };
  if (/simulate_ode\s*\(/.test(txt)) return { method: 'ode', exists: true };
  return { method: 'unspecified', exists: true };
}

const enriched = mismatches.map((m) => {
  const mi = methodInfo(m.model);
  const err = m.details && m.details.maxRelativeError != null ? Number(m.details.maxRelativeError) : null;
  return {
    model: m.model,
    method: mi.method,
    fileExists: mi.exists,
    maxRelativeError: err,
    errorColumn: m.details ? m.details.errorColumn : null,
    errorAtTime: m.details ? m.details.errorAtTime : null,
  };
});

const missing = enriched.filter((x) => !x.fileExists);
const deterministic = enriched.filter((x) => x.fileExists && x.method !== 'ssa' && x.method !== 'nfsim');

const byMethod = {};
for (const x of deterministic) {
  byMethod[x.method] = (byMethod[x.method] || 0) + 1;
}

const top10 = [...deterministic]
  .sort((a, b) => (b.maxRelativeError ?? -Infinity) - (a.maxRelativeError ?? -Infinity))
  .slice(0, 10)
  .map((x) => ({
    model: x.model,
    method: x.method,
    maxRelativeErrorPercent:
      x.maxRelativeError == null ? null : Number((x.maxRelativeError * 100).toFixed(6)),
    errorColumn: x.errorColumn,
    errorAtTime: x.errorAtTime,
  }));

const out = {
  totalMismatches: mismatches.length,
  deterministicMismatches: deterministic.length,
  missingBNGLCount: missing.length,
  deterministicByMethod: byMethod,
  missingBNGLModels: missing.map((x) => x.model).sort(),
  top10DeterministicExistingBNGL: top10,
};

console.log(JSON.stringify(out, null, 2));
