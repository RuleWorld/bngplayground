import { ensureNFsimRuntime } from './NFsimRuntimeLoader';

export interface NFsimRunOptions {
  t_end: number;
  n_steps: number;
  seed?: number;
  utl?: number;
  gml?: number;
  equilibrate?: number;
  cb?: boolean;
  timeoutMs?: number;
  verbose?: boolean;
  progressCallback?: (line: string) => void;
  [key: string]: any;
}

type NFsimRuntime = {
  run: (xml: string, options: NFsimRunOptions) => Promise<string> | string;
  reset?: () => void;
};

const getRuntime = (): NFsimRuntime | null => {
  const globalAny = globalThis as unknown as { __nfsimRuntime?: NFsimRuntime };
  return globalAny.__nfsimRuntime ?? null;
};

export async function runNFsim(xml: string, options: NFsimRunOptions): Promise<string> {
  const runtime = getRuntime() ?? (await ensureNFsimRuntime());
  if (!runtime) {
    throw new Error('NFsim WASM runtime not available');
  }
  const result = await runtime.run(xml, options);
  return typeof result === 'string' ? result : String(result);
}

export function resetNFsim(): void {
  const runtime = getRuntime();
  runtime?.reset?.();
}
