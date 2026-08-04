/**
 * Legacy entry point for the web-vs-BNG2 output comparison.
 *
 * The canonical implementation lives in `tools/validation/compare_outputs.ts`.
 * This wrapper exists only to keep the historical `scripts/testing` entry point
 * working (see `scripts/README.md`); it delegates to the single source of truth.
 */
import '../../tools/validation/compare_outputs';
