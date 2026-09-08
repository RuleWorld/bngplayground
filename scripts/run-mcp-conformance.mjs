import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = await mkdtemp(join(tmpdir(), 'bng-mcp-conformance-'));
const outputDirectory = join(tempRoot, 'results');
await mkdir(outputDirectory, { recursive: true });

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function ensureBuild() {
  execFileSync(npmCommand(), ['run', 'build', '--workspace', '@bngplayground/mcp-server'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
}

async function waitForReady(child) {
  return new Promise((resolveReady, rejectReady) => {
    let output = '';
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/READY (\d+)/);
      if (match) {
        child.stdout.off('data', onData);
        resolveReady(Number(match[1]));
      }
    };
    child.stdout.on('data', onData);
    child.once('error', rejectReady);
    child.once('exit', (code) => {
      if (code !== null && code !== 0) rejectReady(new Error(`Conformance server exited before ready with code ${code}`));
    });
  });
}

async function collectJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJsonFiles(path));
    else if (entry.name.endsWith('.json')) files.push(path);
  }
  return files;
}

let child;
let exitCode = 1;
try {
  ensureBuild();
  child = spawn(process.execPath, ['--import', 'tsx', 'scripts/mcp-conformance-server.mjs'], {
    cwd: repositoryRoot,
    env: { ...process.env, BNG_MCP_PROFILE: 'stable' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await waitForReady(child);
  const conformanceBinary = resolve(repositoryRoot, 'node_modules/.bin/conformance');
  const args = [
    'server',
    '--url', `http://127.0.0.1:${port}/mcp`,
    '--requirements', '2026-07-28',
    '--output-dir', outputDirectory,
    '--verbose',
  ];
  const result = await new Promise((resolveResult, rejectResult) => {
    const processResult = spawn(conformanceBinary, args, { cwd: repositoryRoot, stdio: 'inherit' });
    processResult.once('error', rejectResult);
    processResult.once('exit', (code, signal) => resolveResult({ code: code ?? 1, signal }));
  });
  const jsonFiles = await collectJsonFiles(outputDirectory);
  const checks = [];
  for (const filename of jsonFiles) {
    try {
      const value = JSON.parse(await readFile(filename, 'utf8'));
      if (Array.isArray(value)) checks.push(...value);
      else checks.push(value);
    } catch {
      // Preserve non-check JSON artifacts without making the collector itself fail.
    }
  }
  const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'node_modules/@modelcontextprotocol/conformance/package.json'), 'utf8'));
  await writeFile(join(outputDirectory, 'run-summary.json'), JSON.stringify({
    package: '@modelcontextprotocol/conformance',
    version: packageJson.version,
    spec_version: '2026-07-28',
    requirements: '2026-07-28',
    url: `http://127.0.0.1:${port}/mcp`,
    result_exit_code: result.code,
    result_signal: result.signal,
    check_artifacts: jsonFiles.map((filename) => filename.slice(outputDirectory.length + 1)),
    checks,
  }, null, 2));
  exitCode = result.code;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
} finally {
  if (child && child.exitCode === null) child.kill('SIGTERM');
}

process.stdout.write(`Conformance artifacts: ${outputDirectory}\n`);
process.exitCode = exitCode;
