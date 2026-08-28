import { execFile, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
) {
  return execFileAsync(executable, [...args], {
    cwd,
    env: { ...process.env, ...env },
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
  });
}

export async function runGit(repositoryRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repositoryRoot, ...args], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}

export function runGitSync(repositoryRoot: string, args: string[]): string {
  return execFileSync('git', ['-C', repositoryRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function parseBoundedInteger(value: string | undefined, defaultValue: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}, received "${value}".`);
  }
  return parsed;
}

export function shortId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'target';
}
