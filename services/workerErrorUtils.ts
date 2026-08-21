import type { SerializedWorkerError } from '../types';

export const extractErrorMessage = (payload: SerializedWorkerError | unknown): string => {
  if (payload && typeof payload === 'object' && 'message' in payload && typeof (payload as { message?: unknown }).message === 'string') {
    return (payload as { message: string }).message;
  }
  if (payload instanceof Error) {
    return payload.message;
  }
  if (typeof payload === 'string') {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return 'Worker error';
  }
};

export const toError = (type: string, payload: SerializedWorkerError | unknown): Error => {
  const extracted = extractErrorMessage(payload);
  const message = (type === 'worker_internal_error' && !extracted.startsWith('Worker internal error'))
    ? `Worker internal error: ${extracted}`
    : (extracted || `${type} failed`);
  if (payload && typeof payload === 'object') {
    const p = payload as SerializedWorkerError;
    const name = typeof p.name === 'string' ? p.name : undefined;
    const stack = typeof p.stack === 'string' ? p.stack : undefined;
    const details = p.details;
    const filename = details && typeof details.filename === 'string' ? details.filename : undefined;
    const lineno = details && typeof details.lineno === 'number' ? details.lineno : undefined;
    const colno = details && typeof details.colno === 'number' ? details.colno : undefined;

    if (name === 'AbortError') {
      return new DOMException(message || 'Operation cancelled', 'AbortError');
    }

    if (name === 'TimeoutError') {
      const err = new Error(message);
      err.name = 'TimeoutError';
      if (stack) (err as any).stack = stack;
      // attach the serialized payload for debugging
      try {
        (err as any).cause = payload;
      } catch (e) {
        // ignore property assignment errors
      }
      return err;
    }

    const err = new Error(message + (filename ? ` (${filename}:${lineno ?? '?'}:${colno ?? '?'})` : ''));
    if (name) err.name = String(name);
    if (stack) (err as any).stack = stack;
    try {
      (err as any).cause = payload;
    } catch (e) {
      // ignore
    }
    return err;
  }

  return new Error(message);
};
