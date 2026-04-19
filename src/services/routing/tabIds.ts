export const TAB_IDS = [
	'time-courses',
	'network',
	'parameter-scan',
	'steady-state',
	'fim',
	'parameter-estimation',
	'flux-analysis',
	'verification',
	'what-if-compare',
	'cartoon',
	'model-explorer',
	'trajectory-explorer',
	'jupyter-export',
	'network-analysis',
	'sobol-sensitivity',
	'profile-likelihood',
	'abc-smc',
	'spatial',
	'bifurcation',
	'temporal-analysis',
	'version-history',
	'multiscale',
	'pkpd',
	'contact-map',
	'debugger',
	'expression-evaluator',
	'parameters',
	'regulatory',
	'robustness',
	'rules',
	'structure-analysis',
] as const;

export type TabId = (typeof TAB_IDS)[number];

const TAB_ALIASES: Record<string, TabId> = {
	'temporal-info': 'temporal-analysis',
	'temporal-info-theory': 'temporal-analysis',
	'temporal': 'temporal-analysis',
	'multi-scale': 'multiscale',
	'pk-pd': 'pkpd',
	'local-sensitivity': 'fim',
	'comparison': 'what-if-compare',
	'what-if': 'what-if-compare',
	'contactmap': 'contact-map',
	'expression-eval': 'expression-evaluator',
};

export function normalizeTabId(value: string): TabId | string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	const canonical = TAB_ALIASES[normalized] ?? normalized;

	return (TAB_IDS as readonly string[]).includes(canonical) ? (canonical as TabId) : canonical;
}
