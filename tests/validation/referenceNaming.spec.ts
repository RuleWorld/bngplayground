/**
 * The reference generator writes one file per model into `bng_test_output/`,
 * keyed on the model's basename. RuleHub holds distinct models that share a
 * basename, so those names are only unique if colliding models are given
 * distinct ones. Getting this wrong is silent and expensive: the generator
 * deduplicated by basename and dropped 51 of the 79 colliding models in the
 * CI-visible corpus before BNG2 ever ran, so they had no reference at all, and
 * the gates compared the survivors against whichever model won the dedupe.
 *
 * These are the invariants that keep that from coming back.
 */
import { describe, expect, it } from 'vitest';

import { buildReferenceNames, safeReferenceBaseName } from '../../tools/validation/referenceNaming';

const candidate = (relativePath: string, source = 'rulehub-published') => ({
	relativePath,
	fileAbs: `/corpus/${relativePath}`,
	source,
});

describe('safeReferenceBaseName', () => {
	it('sanitises a basename without trimming the way safeModelName does', () => {
		expect(safeReferenceBaseName('Published/Mitra2019/11-TLBR/tlbr.bngl')).toBe('tlbr');
		expect(safeReferenceBaseName('Tutorials/NativeTutorials/FceRIji/FceRI_ji.bngl')).toBe('fceri_ji');
		expect(safeReferenceBaseName('Published/Mitra2019/19-raf-constraint/RAFi.bngl')).toBe('rafi');
	});

	it('ignores the directory, which is what makes it collide', () => {
		const paths = [
			'Published/Hlavacek2018Egg/BioNetFit_files/egg.bngl',
			'Published/Hlavacek2018Egg/egg.bngl',
			'Published/Mitra2019/07-egg/egg.bngl',
			'Published/PyBioNetGen/tests/egg/egg.bngl',
		];
		expect(new Set(paths.map(safeReferenceBaseName)).size).toBe(1);
	});
});

describe('buildReferenceNames', () => {
	it('gives every model its own name, however many share a basename', () => {
		const corpus = [
			candidate('Published/Mitra2019Likelihood/problem4/model0_tofit.bngl'),
			candidate('Published/Mitra2019Likelihood/problem8/model0_tofit.bngl'),
			candidate('Published/Mitra2019Likelihood/problem16/model0_tofit.bngl'),
			candidate('Published/Mitra2019Likelihood/problem32/model0_tofit.bngl'),
			candidate('Published/Mitra2019Likelihood/problem64/model0_tofit.bngl'),
			candidate('Published/Mitra2019Likelihood/problem4_3cat/model0_tofit.bngl'),
			candidate('Published/Mitra2019Likelihood/problem8_3cat/model0_tofit.bngl'),
			candidate('Published/Mitra2019Likelihood/problem16_3cat/model0_tofit.bngl'),
			candidate('Published/Mitra2019Likelihood/problem32_3cat/model0_tofit.bngl'),
			candidate('Published/Mitra2019Likelihood/problem64_3cat/model0_tofit.bngl'),
		];

		const names = buildReferenceNames(corpus);

		expect(names.size).toBe(corpus.length);
		expect(new Set(names.values()).size).toBe(corpus.length);
		// Exactly one model keeps the bare name; the rest are distinguished.
		expect([...names.values()].filter(name => name === 'model0_tofit')).toHaveLength(1);
		expect(names.get('Published/Mitra2019Likelihood/problem4_3cat/model0_tofit.bngl')).toBe(
			'model0_tofit_problem4_3cat'
		);
		expect(names.get('Published/Mitra2019Likelihood/problem8/model0_tofit.bngl')).toBe('model0_tofit_problem8');
	});

	it('leaves a model whose basename is unique on that basename', () => {
		const corpus = [
			candidate('Published/Mitra2019/11-TLBR/tlbr.bngl'),
			candidate('Tutorials/General/simple/simple.bngl'),
			candidate('Published/Mitra2019/12-TCR/tcr.bngl'),
		];
		const names = buildReferenceNames(corpus);
		expect(names.get('Published/Mitra2019/11-TLBR/tlbr.bngl')).toBe('tlbr');
		expect(names.get('Tutorials/General/simple/simple.bngl')).toBe('simple');
		expect(names.get('Published/Mitra2019/12-TCR/tcr.bngl')).toBe('tcr');
	});

	it('keeps the bare name with the same model the old deduplication picked', () => {
		// The pre-fix generator kept one candidate per basename, choosing by
		// source priority (published beats tutorial), then shortest path. Every
		// existing fixture keeps the bytes it had, which is what lets
		// `netShapeUnsupported.ts` and the alias tables stay keyed as they are.
		const corpus = [
			candidate('Published/PyBioNetGen/tests/Simple/Simple.bngl'),
			candidate('Tutorials/General/simple/simple.bngl', 'rulehub-tutorial'),
		];
		const names = buildReferenceNames(corpus);
		expect(names.get('Published/PyBioNetGen/tests/Simple/Simple.bngl')).toBe('simple');
		expect(names.get('Tutorials/General/simple/simple.bngl')).not.toBe('simple');
	});

	it('widens the discriminator only until the siblings separate', () => {
		const corpus = [
			candidate('Published/Mitra2019/02-egfr/egfr.bngl'),
			candidate('Published/Mitra2019/17-egfr-ssa/egfr.bngl'),
			candidate('Published/PyBioNetGen/core/egfr/egfr.bngl'),
		];
		const names = buildReferenceNames(corpus);
		// Parent directory alone already tells the 17-egfr-ssa model apart.
		expect(names.get('Published/Mitra2019/17-egfr-ssa/egfr.bngl')).toBe('egfr_17_egfr_ssa');
		expect(new Set(names.values()).size).toBe(3);
	});
	it('does not hand a colliding model a name that is another model’s basename', () => {
		// `core/egfr/egfr.bngl` wants the discriminator `egfr`, i.e. the name
		// `egfr_egfr` — which is also the bare basename of a separate model. If
		// the discriminator were spent, the two models would share a fixture
		// path, which is the collision this module exists to prevent.
		const corpus = [
			candidate('Published/Mitra2019/02-egfr/egfr.bngl'),
			candidate('Published/PyBioNetGen/core/egfr/egfr.bngl'),
			candidate('Published/Mitra2019/17-egfr-ssa/egfr.bngl'),
			candidate('egfr_egfr.bngl', 'public-models'),
		];
		const names = buildReferenceNames(corpus);

		expect(names.get('egfr_egfr.bngl')).toBe('egfr_egfr');
		expect(names.get('Published/PyBioNetGen/core/egfr/egfr.bngl')).not.toBe('egfr_egfr');
		expect(new Set(names.values()).size).toBe(4);
	});

	it('is deterministic regardless of the order candidates arrive in', () => {
		const corpus = [
			candidate('Published/Mitra2019/07-egg/egg.bngl'),
			candidate('Published/Hlavacek2018Egg/egg.bngl'),
			candidate('Published/Hlavacek2018Egg/BioNetFit_files/egg.bngl'),
			candidate('Published/Mitra2019/12-TCR/tcr.bngl'),
		];
		const forward = buildReferenceNames(corpus);
		const reversed = buildReferenceNames([...corpus].reverse());
		expect(Object.fromEntries(reversed)).toEqual(Object.fromEntries(forward));
	});
});
