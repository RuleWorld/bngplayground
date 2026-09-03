/**
 * Errors raised when an analysis cannot consume the simulation contract it
 * was given. These are intentionally distinguishable from solver failures so
 * MCP adapters can return an actionable diagnostic instead of misclassifying
 * a malformed trajectory as a model-value error.
 */
export class AnalysisDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisDataError';
  }
}
