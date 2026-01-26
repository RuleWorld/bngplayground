#!/usr/bin/env node
import { dirname, resolve, basename, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, copyFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from './bngDefaults.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const defaultExampleDir = resolve(projectRoot, 'example-models');
const defaultOutDir = resolve(projectRoot, 'tests/fixtures/gdat');
const NATIVE_NFSIM = resolve(projectRoot, 'src/wasm/nfsim/nfsim-src/build_native/NFsim.exe');
const BUNDLED_NFSIM = resolve(projectRoot, 'bionetgen_python/bng-win/bin/NFsim.exe');

const NFSIM_PATH = existsSync(NATIVE_NFSIM) ? NATIVE_NFSIM : BUNDLED_NFSIM;

function printHelp() {
  console.log(`Generate GDAT baselines with BioNetGen via Perl.

Usage: node scripts/generateGdat.mjs [options] [paths...]

Options:
  --out <dir>       Output directory for GDAT files (default: tests/fixtures/gdat)
  --bng2 <path>     Path to BNG2.pl (default: env BNG2_PATH or bundled path)
  --perl <cmd>      Perl executable to invoke (default: env PERL_CMD or perl)
  --examples        Use all BNGL files under example-models (default when no paths)
  --verbose         Print full BioNetGen output while running models
  --help            Show this message

Any positional path can be a single BNGL file or a directory that will be scanned for *.bngl files.
`);
}

function parseArgs(argv) {
  const args = {
    outDir: defaultOutDir,
    bng2: process.env.BNG2_PATH || DEFAULT_BNG2_PATH,
    perl: process.env.PERL_CMD || DEFAULT_PERL_CMD,
    verbose: false,
    targets: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      case '--out':
        args.outDir = resolve(process.cwd(), argv[++i] ?? '');
        break;
      case '--bng2':
        args.bng2 = resolve(process.cwd(), argv[++i] ?? '');
        break;
      case '--perl':
        args.perl = argv[++i] ?? args.perl;
        break;
      case '--examples':
        args.targets.push(defaultExampleDir);
        break;
      case '--verbose':
        args.verbose = true;
        break;
      default:
        args.targets.push(resolve(process.cwd(), token));
    }
  }

  if (args.targets.length === 0) {
    args.targets.push(defaultExampleDir);
  }

  return args;
}

function ensureBng2Exists(bng2Path) {
  if (!existsSync(bng2Path)) {
    throw new Error(`BNG2.pl not found at ${bng2Path}. Provide --bng2 or set BNG2_PATH.`);
  }
}

function collectBnGLTargets(targets) {
  const files = new Set();
  targets.forEach((target) => {
    let stat;
    try {
      stat = statSync(target);
    } catch (error) {
      console.warn(`Skipping missing path: ${target}`);
      return;
    }

    if (stat.isDirectory()) {
      readdirSync(target).forEach((entry) => {
        if (entry.toLowerCase().endsWith('.bngl')) {
          files.add(resolve(target, entry));
        }
      });
    } else if (stat.isFile()) {
      if (target.toLowerCase().endsWith('.bngl')) {
        files.add(resolve(target));
      } else {
        console.warn(`Ignoring non-BNGL file: ${target}`);
      }
    }
  });
  return [...files].sort();
}

function runBngModel(perlCmd, bng2Path, sourcePath, outDir, verbose) {
  const tempDir = mkdtempSync(join(tmpdir(), 'bng-'));
  const modelName = basename(sourcePath);
  const modelCopy = join(tempDir, modelName);
  copyFileSync(sourcePath, modelCopy);

  // If this BNGL requests NFsim simulation, generate an NFsim-compatible
  // `.species` file from the BNGL `begin seed species` block so NFsim
  // can read initial species (prevents "Couldn't read from file" aborts).
  try {
    const modelTxt = readFileSync(modelCopy, 'utf8');
    if (/simulate_nf\s*\(/i.test(modelTxt)) {
      const m = modelTxt.match(/begin\s+seed\s+species([\s\S]*?)end\s+seed\s+species/i);
      if (m) {
        const body = m[1];
        const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const speciesLines = [];
        for (const l of lines) {
          // Match lines like: '1 @c0:A(b1,b2,c) 300.0' or 'A(b) 10'
          // Capture optional compartment prefix (e.g. @c0:)
          const sm = l.match(/^(?:\d+\s+)?(@[^:]+:)?(.+?)\s+([0-9.+\-eE]+)/);
          if (sm) {
            let comp = (sm[1] || '').trim();
            // BioNetGen 2.x XML export for NFsim uses double-colon '::' for compartments in the name field.
            // When reading from BNGL, we see '@c0:', but NFsim XML expects '@c0::'.
            if (comp.startsWith('@') && comp.endsWith(':') && !comp.endsWith('::')) {
              comp = comp.slice(0, -1) + '::';
            }
            const species = sm[2].trim();
            const count = Math.round(Number(sm[3]));
            // Preserve compartment prefix with double colon — NFsim requires it for compartmental models
            speciesLines.push(`${comp}${species}  ${count}`);
          }
        }
        if (speciesLines.length > 0) {
          const baseName = basename(sourcePath, extname(sourcePath));
          const speciesPath = join(tempDir, `${baseName}.species`);
          writeFileSync(speciesPath, '# species file generated from BNGL seed species\n' + speciesLines.join('\n') + '\n', 'utf8');
          console.log(`  ✓ Wrote species file: ${relative(projectRoot, speciesPath)}`);
        }
      }
    }
  } catch (e) {
    // Non-fatal: if parsing fails, continue and let BNG2.pl run as before
    if (process.env.DEBUG) console.warn('Failed to auto-generate species file:', e.message);
  }

  const result = spawnSync(perlCmd, [bng2Path, modelName], {
    cwd: tempDir,
    env: { ...process.env, NFSIM_EXEC: NFSIM_PATH },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const stdout = result.stdout?.toString() ?? '';
  const stderr = result.stderr?.toString() ?? '';

  if (verbose && stdout.trim().length) {
    console.log(stdout.trim());
  }

  if (result.status !== 0) {
    if (stderr.trim().length) {
      console.error(stderr.trim());
    }
    // Deep log for NFsim debugging
    const logFile = resolve(projectRoot, 'bng_test_output/nfsim_debug.log');
    mkdirSync(dirname(logFile), { recursive: true });
    appendFileSync(logFile, `--- FAILED: ${modelName} ---\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\n\n`);
    
    if (!process.env.DEBUG) rmSync(tempDir, { recursive: true, force: true });
    else console.log(`  [DEBUG] Preserved temp dir: ${tempDir}`);
    throw new Error(`BNG2.pl failed for ${modelName} with exit code ${result.status ?? 'unknown'}. See bng_test_output/nfsim_debug.log for details.`);
  }
  if (stderr.trim().length) {
    console.warn(stderr.trim());
  }

  const outputs = readdirSync(tempDir);
  const gdatFiles = outputs.filter((file) => file.toLowerCase().endsWith('.gdat'));

  if (gdatFiles.length === 0) {
    // Log for debugging empty GDAT output
    const logFile = resolve(projectRoot, 'bng_test_output/nfsim_debug.log');
    mkdirSync(dirname(logFile), { recursive: true });
    appendFileSync(logFile, `--- EMPTY GDAT: ${modelName} (status: ${result.status}) ---\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\n\n`);
    
    if (!process.env.DEBUG) rmSync(tempDir, { recursive: true, force: true });
    else console.log(`  [DEBUG] Preserved temp dir: ${tempDir}`);
    throw new Error(`No GDAT produced for ${modelName}. See bng_test_output/nfsim_debug.log for details.`);
  }

  // Copy all produced GDAT files to the output directory. Preserve their original
  // filenames (including any phase/suffix) so downstream tools can locate phases.
  const copiedPaths = [];
  for (const gf of gdatFiles) {
    const sourceGdat = join(tempDir, gf);
    const destName = gf; // preserve original filename
    const destPath = join(outDir, destName);

    if (existsSync(destPath)) {
      // If a file with this name already exists, append the new data but skip
      // header/comment lines (those starting with '#') to avoid duplicate headers.
      const content = readFileSync(sourceGdat, 'utf8').split(/\r?\n/).filter(Boolean);
      const toAppend = content.filter(line => !line.startsWith('#')).join('\n') + '\n';
      appendFileSync(destPath, toAppend);
      console.log(`  ✔ ${relative(projectRoot, sourcePath)} -> ${relative(projectRoot, destPath)}`);
    }

    copiedPaths.push(destPath);
  }

  rmSync(tempDir, { recursive: true, force: true });
  // Return the first copied path for backward compatibility with callers
  return copiedPaths[0];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureBng2Exists(args.bng2);
  mkdirSync(args.outDir, { recursive: true });

  const files = collectBnGLTargets(args.targets);

  if (files.length === 0) {
    console.error('No BNGL files found.');
    process.exit(1);
  }

  console.log(`Running BioNetGen for ${files.length} model(s) ...`);

  let success = 0;
  const failures = [];

  files.forEach((file) => {
    try {
  const output = runBngModel(args.perl, args.bng2, file, args.outDir, args.verbose);
      if (output) {
        success += 1;
        const rel = relative(projectRoot, output);
        console.log(`  ✔ ${relative(projectRoot, file)} -> ${rel}`);
      }
    } catch (error) {
      failures.push({ file, message: error.message });
      console.error(`  ✖ ${relative(projectRoot, file)} (${error.message})`);
    }
  });

  console.log(`Finished. ${success} GDAT file(s) copied to ${relative(projectRoot, args.outDir)}.`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach((failure) => {
      console.log(`  - ${relative(projectRoot, failure.file)}: ${failure.message}`);
    });
    process.exitCode = 1;
  }
}

main();
