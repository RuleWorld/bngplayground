/**
 * Generate missing BNG2.pl reference outputs (GDAT/CDAT/NET) for models that
 * exist in the web gallery but are missing in bng_test_output/.
 *
 * This is intended to unblock strict parity comparisons of browser-exported CSV
 * outputs (web_output/) against canonical BNG2.pl outputs.
 *
 * Usage:
 *   npx -y tsx scripts/generate_no_ref_gdat.ts
 *
 * Environment:
 *   - BNG2_PL or BNG2_PATH: path to BNG2.pl
 *   - PERL: perl executable (default: perl)
 *   - BNG2_TIMEOUT_MS: per-model timeout (default: 300000)
 *   - BNG_MODEL_TIMEOUT_MS: shared per-model timeout (default: 60000)
 *   - BNG2_TIMEOUT_MS: legacy fallback timeout (default: 60000)
 *   - BNG_CONCURRENCY: number of concurrent BNG2 workers (default: 4)
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { once } from 'events';
import { fileURLToPath } from 'url';
import { collectBnglFilesRecursive, listAllRuleHubModelFiles } from '../../tools/rulehubLocal';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(THIS_DIR, '..', '..');
const BNG_TEST_OUTPUT_DIR = path.join(PROJECT_ROOT, 'bng_test_output');

const SESSION_DIR = path.join(PROJECT_ROOT, 'artifacts', 'SESSION_2026_01_05_web_output_parity');
const WORK_ROOT = path.join(SESSION_DIR, 'bng2_work');
const LOG_ROOT = path.join(SESSION_DIR, 'bng2_logs');

const DEFAULT_BNG2_PL =
	'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';

const BNG2_PL = process.env.BNG2_PL || process.env.BNG2_PATH || DEFAULT_BNG2_PL;
const PERL = process.env.PERL || 'perl';
const TIMEOUT_MS = Number(process.env.BNG_MODEL_TIMEOUT_MS || process.env.BNG2_TIMEOUT_MS || 60_000);
const CONCURRENCY = Math.max(1, Number(process.env.BNG_CONCURRENCY || 4));

const PUBLIC_MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models');

type ModelSource =
	| 'rulehub-published'
	| 'rulehub-example'
	| 'rulehub-validation'
	| 'rulehub-runtime'
	| 'rulehub-tutorial'
	| 'rulehub-pybionetgen'
	| 'rulehub-other'
	| 'public-models'
	| 'missing';

type ModelCandidate = {
	safeName: string;
	fileAbs: string;
	source: Exclude<ModelSource, 'missing'>;
	sourceId: string;
	priority: number;
};

type GenerationResult = {
	safeName: string;
	source: ModelSource;
	sourceId?: string;
	status: 'generated' | 'skipped_exists' | 'bng2_failed' | 'source_missing';
	elapsedMs?: number;
	exitStatus?: number | null;
	timedOut?: boolean;
	producedFiles?: string[];
	copiedFiles?: string[];
	logFile?: string;
	error?: string;
};

function toSafeName(filePath: string): string {
	return path
		.basename(filePath, path.extname(filePath))
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

function ensureDir(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
}

function tail(str: string, maxChars = 4000): string {
	if (str.length <= maxChars) return str;
	return str.slice(-maxChars);
}

function hasUncommentedSimulateAction(code: string): boolean {
	const uncommented = code
		.split(/\r?\n/)
		.map((line) => line.trimStart())
		.filter((line) => !line.startsWith('#'))
		.join('\n');
	return /\b(simulate|simulate_ode)\s*\(/i.test(uncommented);
}

function appendDefaultOdeActions(code: string): string {
	const cleaned = code.replace(/\s+$/, '');
	return `${cleaned}\n\n# [auto-generated] Default ODE actions for reference generation\ngenerate_network({overwrite=>1})\nsimulate({method=>"ode",t_end=>100,n_steps=>100})\n`;
}

function sanitizeActionsKeepAllOdeSimulates(code: string): string {
	// Keep all ODE simulate calls. Comment out SSA/NFsim simulate calls only.
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

	const lines = actionsBody.split(/\r?\n/);
	const outLines = lines.map((line) => {
		const trimmed = line.trimStart();
		if (trimmed.startsWith('#')) return line;
		if (!/\b(simulate|simulate_ode)\s*\(/i.test(line)) return line;

		const isSsa = /\bsimulate_ssa\s*\(/i.test(line) || /\bmethod\s*=>\s*["']ssa["']/i.test(line);
		const isNf = /\bsimulate_nf\s*\(/i.test(line) || /\bmethod\s*=>\s*["'](?:nf|nfsim)["']/i.test(line);
		if (isSsa || isNf) return `# [auto-disabled] ${line}`;
		return line;
	});

	return `${before}\n${outLines.join('\n')}\n${after}`;
}

function chooseBetterCandidate(left: ModelCandidate, right: ModelCandidate): ModelCandidate {
	if (right.priority !== left.priority) {
		return right.priority < left.priority ? right : left;
	}
	if (right.sourceId.length !== left.sourceId.length) {
		return right.sourceId.length < left.sourceId.length ? right : left;
	}
	return right.sourceId.localeCompare(left.sourceId) < 0 ? right : left;
}

function discoverModelCandidates(): ModelCandidate[] {
	const sourcePriority: Record<Exclude<ModelSource, 'missing'>, number> = {
		'public-models': 0,
		'rulehub-published': 1,
		'rulehub-example': 2,
		'rulehub-validation': 3,
		'rulehub-runtime': 4,
		'rulehub-tutorial': 5,
		'rulehub-pybionetgen': 6,
		'rulehub-other': 7,
	};

	const bySafeName = new Map<string, ModelCandidate>();

	for (const entry of listAllRuleHubModelFiles(PROJECT_ROOT)) {
		const safeName = toSafeName(entry.filePath);
		if (!safeName) continue;
		const candidate: ModelCandidate = {
			safeName,
			fileAbs: entry.filePath,
			source: entry.source,
			sourceId: entry.relativePath,
			priority: sourcePriority[entry.source],
		};
		const existing = bySafeName.get(safeName);
		bySafeName.set(safeName, existing ? chooseBetterCandidate(existing, candidate) : candidate);
	}

	if (fs.existsSync(PUBLIC_MODELS_DIR)) {
		for (const fileAbs of collectBnglFilesRecursive(PUBLIC_MODELS_DIR)) {
			const safeName = toSafeName(fileAbs);
			if (!safeName) continue;
			const sourceId = path.relative(PROJECT_ROOT, fileAbs).replace(/\\/g, '/');
			const candidate: ModelCandidate = {
				safeName,
				fileAbs,
				source: 'public-models',
				sourceId,
				priority: sourcePriority['public-models'],
			};
			const existing = bySafeName.get(safeName);
			bySafeName.set(safeName, existing ? chooseBetterCandidate(existing, candidate) : candidate);
		}
	}

	return Array.from(bySafeName.values()).sort((a, b) => a.safeName.localeCompare(b.safeName));
}

type Bng2RunResult = {
	status: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	errorMessage?: string;
};

async function runBng2Process(workDir: string, bnglPath: string): Promise<Bng2RunResult> {
	const child = spawn(PERL, [BNG2_PL, path.basename(bnglPath)], {
		cwd: workDir,
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: false,
	});

	let stdout = '';
	let stderr = '';
	let timedOut = false;
	let spawnError: string | undefined;

	child.stdout?.setEncoding('utf8');
	child.stderr?.setEncoding('utf8');
	child.stdout?.on('data', (chunk) => {
		stdout += String(chunk);
	});
	child.stderr?.on('data', (chunk) => {
		stderr += String(chunk);
	});
	child.on('error', (err) => {
		spawnError = err.message;
	});

	const timer = setTimeout(() => {
		timedOut = true;
		try {
			child.kill();
		} catch {
			// Best effort timeout kill
		}
	}, TIMEOUT_MS);

	const [status, signal] = (await once(child, 'close')) as [number | null, NodeJS.Signals | null];
	clearTimeout(timer);

	return {
		status,
		signal,
		stdout,
		stderr,
		timedOut,
		errorMessage: spawnError,
	};
}

async function generateOne(model: ModelCandidate): Promise<GenerationResult> {
	const safeName = model.safeName;
	const hasReferenceGdat = fs.existsSync(path.join(BNG_TEST_OUTPUT_DIR, `${safeName}.gdat`));
	if (hasReferenceGdat) {
		return {
			safeName,
			source: model.source,
			sourceId: model.sourceId,
			status: 'skipped_exists',
			error: 'Reference .gdat already exists in bng_test_output/',
		};
	}

	if (!fs.existsSync(model.fileAbs)) {
		return { safeName, source: 'missing', status: 'source_missing', error: 'Model source file no longer exists' };
	}

	const loadedCode = fs.readFileSync(model.fileAbs, 'utf8').replace(/^\uFEFF/, '');

	ensureDir(WORK_ROOT);
	ensureDir(LOG_ROOT);

	const workDir = path.join(WORK_ROOT, safeName);
	if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
	ensureDir(workDir);

	let sanitized = sanitizeActionsKeepAllOdeSimulates(loadedCode);
	if (!hasUncommentedSimulateAction(sanitized)) {
		sanitized = appendDefaultOdeActions(sanitized);
	}

	const bnglPath = path.join(workDir, `${safeName}.bngl`);
	fs.writeFileSync(bnglPath, sanitized, 'utf8');

	const t0 = Date.now();
	const res = await runBng2Process(workDir, bnglPath);
	const elapsedMs = Date.now() - t0;

	const timedOut = res.timedOut;
	const stdout = res.stdout || '';
	const stderr = res.stderr || '';

	const produced = fs.readdirSync(workDir);
	const producedFiles = produced.filter((f) => /\.(gdat|cdat|net)$/i.test(f)).sort();

	const logFileAbs = path.join(LOG_ROOT, `${safeName}.log.txt`);
	const logRel = path.relative(PROJECT_ROOT, logFileAbs).replace(/\\/g, '/');
	fs.writeFileSync(
		logFileAbs,
		[
			`SAFE_NAME: ${safeName}`,
			`SOURCE: ${model.source}`,
			`SOURCE_ID: ${model.sourceId ?? ''}`,
			`BNG2_PL: ${BNG2_PL}`,
			`PERL: ${PERL}`,
			`TIMEOUT_MS: ${TIMEOUT_MS}`,
			`WORKDIR: ${workDir}`,
			`EXIT_STATUS: ${res.status}`,
			`SIGNAL: ${res.signal}`,
			`TIMED_OUT: ${timedOut}`,
			`ELAPSED_MS: ${elapsedMs}`,
			`SPAWN_ERROR: ${res.errorMessage ?? ''}`,
			`PRODUCED: ${producedFiles.join(', ')}`,
			`\n=== STDOUT (tail) ===\n${tail(stdout)}`,
			`\n=== STDERR (tail) ===\n${tail(stderr)}`,
		].join('\n'),
		'utf8'
	);

	if (producedFiles.length === 0 || res.errorMessage) {
		return {
			safeName,
			source: model.source,
			sourceId: model.sourceId,
			status: 'bng2_failed',
			elapsedMs,
			exitStatus: res.status,
			timedOut,
			producedFiles,
			logFile: logRel,
			error: timedOut ? 'BNG2.pl timed out' : (res.errorMessage || 'BNG2.pl failed or produced no outputs'),
		};
	}

	// Copy the BNGL used for generation + produced outputs into bng_test_output.
	const copiedFiles: string[] = [];

	const dstBngl = path.join(BNG_TEST_OUTPUT_DIR, `${safeName}.bngl`);
	if (!fs.existsSync(dstBngl)) {
		fs.copyFileSync(bnglPath, dstBngl);
		copiedFiles.push(path.basename(dstBngl));
	}

	// Copy all produced files. For suffixed outputs (e.g., model_ODE.gdat from
	// simulate({suffix=>"ODE",...})), also create a canonical unsuffixed copy
	// (model.gdat) so the parity checker can find it by safeName.
	let hasCanonicalGdat = false;
	for (const f of producedFiles) {
		const src = path.join(workDir, f);
		const dst = path.join(BNG_TEST_OUTPUT_DIR, f);
		fs.copyFileSync(src, dst);
		copiedFiles.push(f);
		if (f === `${safeName}.gdat`) hasCanonicalGdat = true;
	}
	if (!hasCanonicalGdat) {
		// BNG2 produced suffixed gdat(s) but no unsuffixed one.
		// Copy the first suffixed gdat as the canonical reference.
		const firstGdat = producedFiles.find((f) => f.endsWith('.gdat'));
		if (firstGdat) {
			const src = path.join(workDir, firstGdat);
			const canonicalDst = path.join(BNG_TEST_OUTPUT_DIR, `${safeName}.gdat`);
			fs.copyFileSync(src, canonicalDst);
			copiedFiles.push(`${safeName}.gdat (alias of ${firstGdat})`);
		}
	}

	return {
		safeName,
		source: model.source,
		sourceId: model.sourceId,
		status: 'generated',
		elapsedMs,
		exitStatus: res.status,
		timedOut,
		producedFiles,
		copiedFiles,
		logFile: logRel,
	};
}

async function processPool(models: ModelCandidate[], concurrency: number): Promise<GenerationResult[]> {
	const workers = Math.max(1, Number.isFinite(concurrency) ? Math.floor(concurrency) : 1);
	const results: Array<GenerationResult | undefined> = new Array(models.length);
	let idx = 0;

	async function worker(): Promise<void> {
		while (true) {
			const current = idx++;
			if (current >= models.length) return;
			const model = models[current];
			console.log(`--- [${current + 1}/${models.length}] ${model.safeName} (${model.source}) ---`);
			const r = await generateOne(model);
			results[current] = r;
			console.log(`Status: ${r.status}`);
			if (r.error) console.log(`Error: ${r.error}`);
			if (r.producedFiles?.length) console.log(`Produced: ${r.producedFiles.join(', ')}`);
			if (r.copiedFiles?.length) console.log(`Copied: ${r.copiedFiles.join(', ')}`);
			if (r.logFile) console.log(`Log: ${r.logFile}`);
			console.log();
		}
	}

	await Promise.all(Array.from({ length: workers }, () => worker()));
	return results.filter((r): r is GenerationResult => Boolean(r));
}

async function main() {
	ensureDir(SESSION_DIR);
	ensureDir(WORK_ROOT);
	ensureDir(LOG_ROOT);

	if (!fs.existsSync(BNG2_PL)) {
		console.error('BNG2.pl not found at:', BNG2_PL);
		process.exitCode = 2;
		return;
	}
	ensureDir(BNG_TEST_OUTPUT_DIR);

	console.log('Generating missing BNG2 references for NOREF models...');
	console.log('BNG2_PL:', BNG2_PL);
	console.log('PERL:', PERL);
	console.log('TIMEOUT_MS:', TIMEOUT_MS);
	console.log('CONCURRENCY:', CONCURRENCY);

	const allCandidates = discoverModelCandidates();
	const pendingCandidates = allCandidates.filter(
		(model) => !fs.existsSync(path.join(BNG_TEST_OUTPUT_DIR, `${model.safeName}.gdat`))
	);

	console.log('Discovered .bngl candidates:', allCandidates.length);
	console.log('Pending (missing .gdat):', pendingCandidates.length);
	console.log();

	const results = await processPool(pendingCandidates, CONCURRENCY);

	const summaryPath = path.join(SESSION_DIR, 'generated_no_ref_gdat_summary.json');
	fs.writeFileSync(
		summaryPath,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				bng2Pl: BNG2_PL,
				perl: PERL,
				timeoutMs: TIMEOUT_MS,
				concurrency: CONCURRENCY,
				discoveredCount: allCandidates.length,
				pendingCount: pendingCandidates.length,
				results,
			},
			null,
			2
		),
		'utf8'
	);

	const ok = results.filter((r) => r.status === 'generated').length;
	const failed = results.filter((r) => r.status === 'bng2_failed').length;
	const missing = results.filter((r) => r.status === 'source_missing').length;
	const skipped = results.filter((r) => r.status === 'skipped_exists').length;

	console.log('Done.');
	console.log(`generated=${ok} failed=${failed} source_missing=${missing} skipped_exists=${skipped}`);
	console.log('Summary:', path.relative(PROJECT_ROOT, summaryPath).replace(/\\/g, '/'));
}

main().catch((err) => {
	console.error('[generate:gdat] Fatal error:', err);
	process.exitCode = 1;
});
