/**
 * guards.ts — small shared runtime type guards for worker message handling.
 */

/** True for a non-null, non-array object usable as a string-keyed record. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
