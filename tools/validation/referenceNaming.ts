/**
 * One reference per model, under a name that is unique across the whole corpus.
 *
 * The reference generator used to key `bng_test_output/` on the model's
 * basename alone, sanitised to `[a-z0-9_]`. RuleHub contains distinct models
 * that share a basename — `Published/Mitra2019Likelihood/problem{4,8,16,32,64}
 * [_3cat]/model0_tofit.bngl` is ten different models, and the CI-visible corpus
 * holds 28 such groups covering 79 models. The generator deduplicated by that
 * name, so 51 of them were dropped before BNG2 ever ran: no reference was
 * generated for them at all, and `compare_outputs` resolved the one surviving
 * CSV against whichever model happened to win the dedupe.
 *
 * So each group gets one name per model:
 *
 *   - the bare sanitised basename stays with the model that owns it TODAY, so
 *     every existing fixture path keeps the same bytes it has always had and
 *     nothing keyed on it (`netShapeUnsupported.ts`, the alias tables, the
 *     checked-in parity reports) has to be revisited;
 *   - the siblings get a short discriminator derived from their source path.
 *
 * That split leaves `compare_outputs` a job it can only do through the
 * manifest: the web batch run labels each CSV from the catalog id, and the bare
 * label now names a different model than the one it belongs to. It therefore
 * resolves a CSV label to its model first, then to that model's reference
 * name — see `modelReferenceNameFor` below. Mirroring the bare name is not an
 * option: `exportLabelFor` in `src/utils/batchRunner.ts` takes the last six
 * alphanumerics of the catalog id, which is not injective — over the current
 * manifest it emits `parabola_rabola` four times and `egfr_egfr` twice — so
 * two different models share a CSV label and no naming scheme derived from it
 * can be one-to-one. The source path is unique per model by construction.
 */

import * as fs from 'fs';
import * as path from 'path';

import { collectBnglFilesRecursive, listAllRuleHubModelFiles } from '../rulehubLocal';

/** A corpus member the naming pass has to place. */
export interface ReferenceNameCandidate {
	/** Path relative to the corpus root; identity, and the discriminator source. */
	relativePath: string;
	/** Absolute path to the model BNG2 must be given. */
	fileAbs: string;
	/** `RuleHubModelSource`, or `public-models` for the bundled gallery. */
	source: string;
}

/**
 * Which corpus a model came from, most authoritative first.
 *
 * This reproduces the generator's historical `sourcePriority` table verbatim.
 * It matters because it decides the bare-name owner in a colliding group: the
 * deduplication that used to drop models picked its winner by exactly this
 * order, and keeping it is what lets every existing fixture path keep its
 * current bytes.
 */
const SOURCE_PRIORITY: Record<string, number> = {
	'public-models': 0,
	'rulehub-published': 1,
	'rulehub-example': 2,
	'rulehub-validation': 3,
	'rulehub-runtime': 4,
	'rulehub-tutorial': 5,
	'rulehub-pybionetgen': 6,
	'rulehub-other': 7,
};

/**
 * The bare sanitised basename: `Published/Mitra2019/11-TLBR/tlbr.bngl` -> `tlbr`.
 *
 * Deliberately identical to the historical rule (and to `safeModelName`), so
 * every non-colliding model keeps the exact fixture path it has today.
 */
export function safeReferenceBaseName(filePath: string): string {
	return path
		.basename(filePath, path.extname(filePath))
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

/** The same sanitising rule applied to a path fragment rather than a whole path. */
function sanitizeFragment(fragment: string): string {
	return fragment
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

/** Deterministic 32-bit FNV-1a, rendered as 8 lowercase hex digits. */
function pathHash(value: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

/**
 * Directory segments of a model path, most specific last.
 *
 * `Published/Mitra2019Likelihood/problem4_3cat/model0_tofit.bngl` yields
 * `['Published', 'Mitra2019Likelihood', 'problem4_3cat']`.
 */
function directorySegments(relativePath: string): string[] {
	return relativePath
		.replace(/\.[^./\\]+$/, '')
		.split(/[\\/]/)
		.slice(0, -1)
		.filter(Boolean);
}

/**
 * The model that keeps the bare basename: same rule the old deduplication used
 * to pick its single winner — authoritative source first, then the shorter
 * path, then alphabetical — so the fixture bytes do not move.
 */
function bareOwner(group: ReferenceNameCandidate[]): ReferenceNameCandidate {
	return [...group].sort((left, right) => {
		const priorityDelta = (SOURCE_PRIORITY[left.source] ?? 99) - (SOURCE_PRIORITY[right.source] ?? 99);
		if (priorityDelta !== 0) return priorityDelta;
		if (left.relativePath.length !== right.relativePath.length) {
			return left.relativePath.length - right.relativePath.length;
		}
		return left.relativePath.localeCompare(right.relativePath);
	})[0];
}

/**
 * Pick the shortest trailing run of directory segments that tells this model
 * apart from every other model in its group and from every name already taken.
 *
 * Shortest-first keeps the discriminators readable: the ten `model0_tofit`
 * models become `model0_tofit_problem4`, `model0_tofit_problem4_3cat`, ...
 * rather than a wall of path. Widening only as far as needed means a model
 * whose parent directory is already unique never pays for its grandparent.
 */
function chooseDiscriminator(
	relativePath: string,
	groupPaths: string[],
	base: string,
	taken: Set<string>,
	reservedBasenames: Set<string>
): string {
	const segments = directorySegments(relativePath);
	for (let depth = 1; depth <= segments.length; depth++) {
		const candidate = sanitizeFragment(segments.slice(-depth).join('_'));
		if (!candidate) continue;
		const clashesWithinGroup = groupPaths.some(
			(other) =>
				other !== relativePath &&
				sanitizeFragment(directorySegments(other).slice(-depth).join('_')) === candidate
		);
		if (clashesWithinGroup) continue;
		if (taken.has(`${base}_${candidate}`)) continue;
		// `egfr_egfr` is a plausible discriminator for `core/egfr/egfr.bngl` and
		// also a plausible basename for some other model. If both existed the
		// two would share a fixture path, which is the very collision this
		// module exists to prevent, so a name that is any model's bare basename
		// is never spent as a discriminator.
		if (reservedBasenames.has(`${base}_${candidate}`)) continue;
		return candidate;
	}

	// Every trailing run of directories collided (two collection roots reaching
	// the same path, or a model sitting at the corpus root). Fall back to the
	// full path, then to a hash of it: the name must be unique, and a hash of
	// the path always is.
	const full = sanitizeFragment(segments.join('_'));
	if (full && !taken.has(`${base}_${full}`) && !reservedBasenames.has(`${base}_${full}`)) return full;
	return pathHash(relativePath);
}

/**
 * Assign a unique reference name to every candidate, keyed by `relativePath`.
 *
 * Every model gets a name; a model whose basename is unique keeps it verbatim.
 */
export function buildReferenceNames(candidates: ReferenceNameCandidate[]): Map<string, string> {
	const groups = new Map<string, ReferenceNameCandidate[]>();
	for (const candidate of candidates) {
		const safeName = safeReferenceBaseName(candidate.relativePath);
		if (!safeName) continue;
		const group = groups.get(safeName);
		if (group) group.push(candidate);
		else groups.set(safeName, [candidate]);
	}

	const taken = new Set<string>();
	const reservedBasenames = new Set(groups.keys());
	const assigned = new Map<string, string>();

	// Deterministic group order, so the result cannot depend on the order the
	// filesystem happened to hand the candidates over.
	const orderedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));

	for (const [safeName, group] of orderedGroups) {
		const owner = bareOwner(group);
		const rest = group.filter((candidate) => candidate.relativePath !== owner.relativePath);

		assigned.set(owner.relativePath, safeName);
		taken.add(safeName);

		const groupPaths = group.map((candidate) => candidate.relativePath);
		for (const candidate of rest) {
			const discriminator = chooseDiscriminator(candidate.relativePath, groupPaths, safeName, taken, reservedBasenames);
			assigned.set(candidate.relativePath, `${safeName}_${discriminator}`);
			taken.add(`${safeName}_${discriminator}`);
		}
	}

	return assigned;
}

/**
 * Every model the reference pipeline covers: the RuleHub corpus CI generates
 * from, plus the bundled `public/models` gallery.
 *
 * Shared so the generator and the gates name the corpus identically. If the two
 * disagreed about which models exist, a reference could be written under a name
 * no gate would ever look up.
 */
export function referenceCorpus(projectRoot: string): ReferenceNameCandidate[] {
	const ruleHubModels = listAllRuleHubModelFiles(projectRoot).map((entry) => ({
		relativePath: entry.relativePath,
		fileAbs: entry.filePath,
		source: entry.source,
	}));

	const publicModelsDir = path.join(projectRoot, 'public', 'models');
	const publicModels = fs.existsSync(publicModelsDir)
		? collectBnglFilesRecursive(publicModelsDir).map((fileAbs) => ({
				relativePath: path.relative(projectRoot, fileAbs).replace(/\\/g, '/'),
				fileAbs,
				source: 'public-models',
			}))
		: [];

	return [...ruleHubModels, ...publicModels];
}

let cachedCorpusProjectRoot: string | null = null;
let cachedReferenceNames: Map<string, string> | null = null;

/**
 * Reference names for the whole corpus, computed once per process.
 *
 * The corpus is hundreds of files read from disk; `compare_outputs` asks for a
 * name per CSV, and re-deriving the whole map per CSV would re-walk the
 * RuleHub checkout hundreds of times.
 */
export function referenceNamesFor(projectRoot: string): Map<string, string> {
	if (cachedCorpusProjectRoot === projectRoot && cachedReferenceNames) return cachedReferenceNames;
	cachedCorpusProjectRoot = projectRoot;
	cachedReferenceNames = buildReferenceNames(referenceCorpus(projectRoot));
	return cachedReferenceNames;
}

/**
 * The reference name for the model a web export came from.
 *
 * `relativePath` is the model path relative to the RuleHub root, as recorded in
 * the manifest. Returns null when the model is not one this pipeline generates
 * references for, so callers report "no reference" rather than guessing.
 */
export function modelReferenceNameFor(projectRoot: string, relativePath: string): string | null {
	const normalised = relativePath.replace(/\\/g, '/');
	return referenceNamesFor(projectRoot).get(normalised) ?? null;
}
