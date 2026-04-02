const fs = require('fs');
const path = require('path');

function resolveRuleHubRoot(projectRoot) {
	const fromEnv = process.env.RULEHUB_ROOT && process.env.RULEHUB_ROOT.trim();
	if (fromEnv) {
		const resolved = path.resolve(fromEnv);
		if (fs.existsSync(resolved)) return resolved;
	}

	const sibling = path.resolve(projectRoot, '..', 'RuleHub');
	return fs.existsSync(sibling) ? sibling : null;
}

const projectRoot = process.cwd();
const ruleHubRoot = resolveRuleHubRoot(projectRoot);
if (!ruleHubRoot) {
	throw new Error('RuleHub checkout not found. Set RULEHUB_ROOT or place RuleHub beside this repo.');
}

const src = path.join(ruleHubRoot, 'Tutorials', 'General', 'polymer', 'polymer.bngl');
const dst = 'temp_poly_debug/polymer_cvode.bngl';
let s = fs.readFileSync(src, 'utf8');
// Replace simulate_nf({...}) with simulate({method=>"cvode", t_end=>1.0, n_steps=>20})
s = s.replace(/simulate_nf\([^)]*\)/g, 'simulate({method=>"cvode", t_end=>1.0, n_steps=>20})');
fs.writeFileSync(dst, s, 'utf8');
console.log('Wrote', dst);
