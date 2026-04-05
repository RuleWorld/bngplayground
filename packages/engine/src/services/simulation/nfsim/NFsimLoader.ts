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
    throw new Error(
      'NFsim WASM runtime is not available. ' +
      'The network-free simulator requires the NFsim WebAssembly module to be loaded. ' +
      'If running in the browser, ensure nfsim.js and nfsim.wasm are served alongside the app. ' +
      'As an alternative, try simulate({method=>"ssa"}) or simulate({method=>"ode"}) with a generated network.'
    );
  }
  const result = await runtime.run(xml, options);
  return typeof result === 'string' ? result : String(result);
}

export function resetNFsim(): void {
  const runtime = getRuntime();
  runtime?.reset?.();
}
