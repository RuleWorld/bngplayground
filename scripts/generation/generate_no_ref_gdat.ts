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
import { buildReferenceNames, referenceCorpus } from '../../tools/validation/referenceNaming';

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
	/**
	 * File name stem for this model's reference in `bng_test_output/`. Equal to
	 * the sanitised basename for every model that does not share one, so
	 * existing fixture paths are untouched; see `tools/validation/referenceNaming.ts`
	 * for why colliding models need more than a basename.
	 */
	referenceName: string;
	fileAbs: string;
	source: Exclude<ModelSource, 'missing'>;
	sourceId: string;
};

type GenerationResult = {
	referenceName: string;
	source: ModelSource;
	sourceId?: string;
	status: 'generated' | 'skipped_exists' | 'bng2_failed' | 'source_missing' | 'network_free';
	elapsedMs?: number;
	exitStatus?: number | null;
	timedOut?: boolean;
	producedFiles?: string[];
	copiedFiles?: string[];
	logFile?: string;
	error?: string;
};


function ensureDir(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
}

function tail(str: string, maxChars = 4000): string {
	if (str.length <= maxChars) return str;
	return str.slice(-maxChars);
}

/**
 * True when the model declares simulate actions but every one of them is
 * network-free (NFsim) or stochastic (SSA), and it never asks for a network.
 *
 * The model is inspected exactly as published — nothing injected, nothing
 * commented out — and comments are stripped first, because a commented-out
 * action is not a request: `#generate_network({max_stoich=>...})` sitting above
 * an active `simulate({method=>"nf"...})` (BLBR, Dolan2015) means the author
 * abandoned expansion for a network-free run. Without stripping, those models
 * were classified as network-needing, BNG2 ran NFsim, which writes a `.gdat`
 * but never a `.net`, and the network-shape gate then demanded a ratchet entry
 * for a fixture that should never have been written.
 */
export function isNetworkFreeModel(originalCode: string): boolean {
	const code = originalCode.replace(/#[^\n]*/g, '');
	const simulateCalls = code.match(/\b(?:simulate|simulate_ode|simulate_ssa|simulate_nf|simulate_psa|simulate_pla|simulate_rm)\s*\([^;]*\)/gi);
	if (!simulateCalls || simulateCalls.length === 0) return false;
	// An explicit request for a network means the model is not network-free.
	if (/\bgenerate_network\s*\(/i.test(code)) return false;
	const networkFree = simulateCalls.every((call) =>
		/\bsimulate_nf\s*\(/i.test(call) ||
		/\bsimulate_ssa\s*\(/i.test(call) ||
		/\bsimulate_psa\s*\(/i.test(call) ||
		/\bmethod\s*=>\s*["'](?:nf|nfsim|ssa|psa)["']/i.test(call)
	);
	return networkFree;
}

function discoverModelCandidates(): ModelCandidate[] {
	// One reference per model, not one per basename: the CI-visible RuleHub
	// corpus holds 28 basename groups covering 79 distinct models, and the old
	// one-per-basename deduplication silently dropped 51 of them before BNG2
	// ever ran. Naming is shared with the gates so a reference is never written
	// under a name they would not look up.
	const models = referenceCorpus(PROJECT_ROOT);
	const referenceNames = buildReferenceNames(models);

	return models
		.map(model => ({ model, referenceName: referenceNames.get(model.relativePath) }))
		// A basename that sanitises to nothing cannot name a fixture; the
		// naming pass skips it, so it must not reach the file writes either.
		.filter((entry): entry is { model: typeof entry.model; referenceName: string } => Boolean(entry.referenceName))
		.map(({ model, referenceName }) => ({
			referenceName,
			fileAbs: model.fileAbs,
			source: model.source as ModelCandidate['source'],
			sourceId: model.relativePath,
		}))
		.sort((left, right) => left.referenceName.localeCompare(right.referenceName));
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
	const referenceName = model.referenceName;
	const hasReferenceGdat = fs.existsSync(path.join(BNG_TEST_OUTPUT_DIR, `${referenceName}.gdat`));
	if (hasReferenceGdat) {
		return {
			referenceName,
			source: model.source,
			sourceId: model.sourceId,
			status: 'skipped_exists',
			error: 'Reference .gdat already exists in bng_test_output/',
		};
	}

	if (!fs.existsSync(model.fileAbs)) {
		return { referenceName, source: 'missing', status: 'source_missing', error: 'Model source file no longer exists' };
	}

	const loadedCode = fs.readFileSync(model.fileAbs, 'utf8').replace(/^\uFEFF/, '');

	ensureDir(WORK_ROOT);
	ensureDir(LOG_ROOT);

	const workDir = path.join(WORK_ROOT, referenceName);
	if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
	ensureDir(workDir);

	// BNG2 is given the model EXACTLY AS PUBLISHED. Nothing is injected,
	// commented out or appended.
	//
	// This is not a stylistic choice. A reference built from a modified model is
	// a reference to a different model than the one the playground runs, and the
	// comparison is then meaningless while still reporting a number:
	//   - `nyc`/`phoenix` had 21 lines of `*__FREE 0` injected. BNG2 aborts on the
	//     published file (`Parameter ts0__FREE is referenced but not defined`), so
	//     the fixture was a model BioNetGen would never accept.
	//   - `toggle`/`baruabcr_2012` had `generate_network` + `simulate` appended to
	//     files that contain no `simulate()` at all.
	// The playground does not modify models either: with no `simulate()` action it
	// falls back to ODE at whatever the UI supplies, running the file as written.
	// So a model BNG2 cannot process has no reference, and that is the honest
	// outcome — reported as such rather than papered over with a synthetic fixture.
	//
	// A network-free model (only NFsim/ssa actions) is skipped rather than left to
	// burn the per-model timeout: BNG2 writes no .net for those, and appending
	// `generate_network` for one is how `tcr_iter28p4h2` went 20 -> 53 -> 203 ->
	// 2659 species and never converged.
	if (isNetworkFreeModel(loadedCode)) {
		return {
			referenceName,
			source: model.source,
			sourceId: model.sourceId,
			status: 'network_free',
			error: 'Model is network-free (only NFsim/ssa simulate actions); BioNetGen writes no network for it either.',
		};
	}

	const sanitized = loadedCode;

	const bnglPath = path.join(workDir, `${referenceName}.bngl`);
	fs.writeFileSync(bnglPath, sanitized, 'utf8');

	// BioNetGen master (ruleworld/bionetgen) resolves `default.geometry.mdl`
	// from the MODEL FILE's directory — Perl2/BNGOutput.pm:127 does
	// `catfile(dirname($model->Params->{'file'}), "default.geometry.mdl")` and
	// dies without it. The packaged release ships no geometry file, so it
	// tolerated the absence. Because each model is copied into a fresh
	// `workDir` above, that per-model directory is the model's directory, and a
	// copy placed anywhere else is never read. Without this the three
	// writeMDL() models (fceri_ji_comp, rec_dim, rec_dim_comp) abort before
	// simulate() and produce no .gdat at all.
	const geometrySource = path.join(path.dirname(BNG2_PL), 'Models2', 'MCell', 'default.geometry.mdl');
	if (fs.existsSync(geometrySource)) {
		fs.copyFileSync(geometrySource, path.join(workDir, 'default.geometry.mdl'));
	}

	const t0 = Date.now();
	const res = await runBng2Process(workDir, bnglPath);
	const elapsedMs = Date.now() - t0;

	const timedOut = res.timedOut;
	const stdout = res.stdout || '';
	const stderr = res.stderr || '';

	const produced = fs.readdirSync(workDir);
	const producedFiles = produced.filter((f) => /\.(gdat|cdat|net)$/i.test(f)).sort();

	const logFileAbs = path.join(LOG_ROOT, `${referenceName}.log.txt`);
	const logRel = path.relative(PROJECT_ROOT, logFileAbs).replace(/\\/g, '/');
	fs.writeFileSync(
		logFileAbs,
		[
			`REFERENCE_NAME: ${referenceName}`,
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
			referenceName,
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

	const dstBngl = path.join(BNG_TEST_OUTPUT_DIR, `${referenceName}.bngl`);
	if (!fs.existsSync(dstBngl)) {
		fs.copyFileSync(bnglPath, dstBngl);
		copiedFiles.push(path.basename(dstBngl));
	}

	// Copy all produced files. For suffixed outputs (e.g., model_ODE.gdat from
	// simulate({suffix=>"ODE",...})), also create a canonical unsuffixed copy
	// (model.gdat) so the parity checker can find it by reference name.
	let hasCanonicalGdat = false;
	for (const f of producedFiles) {
		const src = path.join(workDir, f);
		const dst = path.join(BNG_TEST_OUTPUT_DIR, f);
		fs.copyFileSync(src, dst);
		copiedFiles.push(f);
		if (f === `${referenceName}.gdat`) hasCanonicalGdat = true;
	}
	if (!hasCanonicalGdat) {
		// BNG2 produced suffixed gdat(s) but no unsuffixed one.
		// Copy the first suffixed gdat as the canonical reference.
		const firstGdat = producedFiles.find((f) => f.endsWith('.gdat'));
		if (firstGdat) {
			const src = path.join(workDir, firstGdat);
			const canonicalDst = path.join(BNG_TEST_OUTPUT_DIR, `${referenceName}.gdat`);
			fs.copyFileSync(src, canonicalDst);
			copiedFiles.push(`${referenceName}.gdat (alias of ${firstGdat})`);
		}
	}

	return {
		referenceName,
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
			console.log(`--- [${current + 1}/${models.length}] ${model.referenceName} (${model.source}) ---`);
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
		(model) => !fs.existsSync(path.join(BNG_TEST_OUTPUT_DIR, `${model.referenceName}.gdat`))
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

// Run only when executed directly: `tests/` imports `isNetworkFreeModel`, and
// an unguarded `main()` here would start a full reference generation on import.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error('[generate:gdat] Fatal error:', err);
		process.exitCode = 1;
	});
}
