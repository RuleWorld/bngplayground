/**
 * types.ts — shared types for the worker message handlers.
 */

/** Per-job cancellation state tracked by the worker. */
export interface JobState {
    cancelled: boolean;
    controller?: AbortController;
}
