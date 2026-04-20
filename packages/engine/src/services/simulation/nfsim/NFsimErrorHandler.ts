export enum NFsimErrorType {
  WASM_CORRUPTION = 'WASM_CORRUPTION',
  MEMORY = 'MEMORY',
  TIMEOUT = 'TIMEOUT',
  XML = 'XML',
  COMPATIBILITY = 'COMPATIBILITY',
  PARAMETER = 'PARAMETER',
  RUNTIME = 'RUNTIME',
  UNKNOWN = 'UNKNOWN'
}

export enum RecoveryStrategy {
  RETRY = 'RETRY',
  RESET = 'RESET',
  REDUCE_LOAD = 'REDUCE_LOAD',
  FIX_INPUT = 'FIX_INPUT',
  ABORT = 'ABORT'
}

export interface NFsimError {
  type: NFsimErrorType;
  message: string;
  timestamp: Date;
  recovery: RecoveryStrategy;
}

export class NFsimErrorHandler {
  private history: NFsimError[] = [];

  classifyError(message: string | Error, context?: { timestamp?: Date }): NFsimError {
    const msg = typeof message === 'string' ? message : message.message;
    const lower = msg.toLowerCase();
    let type = NFsimErrorType.UNKNOWN;
    let recovery = RecoveryStrategy.ABORT;

    if (lower.includes('wasm') || lower.includes('corruption') || lower.includes('segmentation')) {
      type = NFsimErrorType.WASM_CORRUPTION;
      recovery = RecoveryStrategy.RESET;
    } else if (lower.includes('memory')) {
      type = NFsimErrorType.MEMORY;
      recovery = RecoveryStrategy.REDUCE_LOAD;
    } else if (lower.includes('timeout')) {
      type = NFsimErrorType.TIMEOUT;
      recovery = RecoveryStrategy.RETRY;
    } else if (lower.includes('xml') || lower.includes('parse')) {
      type = NFsimErrorType.XML;
      recovery = RecoveryStrategy.FIX_INPUT;
    } else if (lower.includes('totalrate') || lower.includes('observable')) {
      type = NFsimErrorType.COMPATIBILITY;
      recovery = RecoveryStrategy.FIX_INPUT;
    } else if (lower.includes('parameter') || lower.includes('utl') || lower.includes('gml')) {
      type = NFsimErrorType.PARAMETER;
      recovery = RecoveryStrategy.FIX_INPUT;
    } else if (lower.includes('nfsim') || lower.includes('runtime')) {
      type = NFsimErrorType.RUNTIME;
      recovery = RecoveryStrategy.RETRY;
    }

    const error: NFsimError = {
      type,
      message: msg,
      timestamp: context?.timestamp ?? new Date(),
      recovery
    };
    this.history.push(error);
    return error;
  }

  formatErrorForUser(error: NFsimError): string {
    return `[${error.type}] ${error.message}`;
  }

  getSuggestedRecovery(error: NFsimError): RecoveryStrategy {
    return error.recovery;
  }

  parseStderr(stderr: string): string[] {
    const result: string[] = [];
    let start = 0;
    let index: number;
    while ((index = stderr.indexOf('\n', start)) !== -1) {
      let s = start;
      let e = index;
      if (e > s && stderr.charCodeAt(e - 1) === 13) e--;
      while (s < e && stderr.charCodeAt(s) <= 32) s++;
      while (e > s && stderr.charCodeAt(e - 1) <= 32) e--;
      if (s < e) result.push(stderr.substring(s, e));
      start = index + 1;
    }

    let s = start;
    let e = stderr.length;
    if (e > s && stderr.charCodeAt(e - 1) === 13) e--;
    while (s < e && stderr.charCodeAt(s) <= 32) s++;
    while (e > s && stderr.charCodeAt(e - 1) <= 32) e--;
    if (s < e) result.push(stderr.substring(s, e));

    return result;
  }

  getErrorStatistics() {
    const counts: Record<string, number> = {};
    for (const err of this.history) {
      counts[err.type] = (counts[err.type] ?? 0) + 1;
    }
    return { total: this.history.length, counts };
  }

  clearHistory(): void {
    this.history = [];
  }
}

let handler: NFsimErrorHandler | null = null;

export function getErrorHandler(): NFsimErrorHandler {
  if (!handler) handler = new NFsimErrorHandler();
  return handler;
}

export function resetErrorHandler(): void {
  handler = null;
}
