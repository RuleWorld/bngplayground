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
const NFSIM_LOG_PATH = resolve(projectRoot, 'artifacts/logs/nfsim_debug.log');

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
    seed: null,
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
      case '--seed':
        args.seed = argv[++i] ? parseInt(argv[i], 10) : null;
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


function getBnglFilesRecursive(dir) {
  let results = [];
  try {
    const list = readdirSync(dir);
    for (const file of list) {
      const filePath = resolve(dir, file);
      const stat = statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getBnglFilesRecursive(filePath));
      } else if (file.toLowerCase().endsWith('.bngl')) {
        results.push(filePath);
      }
    }
  } catch (e) {
    console.warn(`Error scanning directory ${dir}:`, e.message);
  }
  return results;
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
      const recursiveFiles = getBnglFilesRecursive(target);
      recursiveFiles.forEach(f => files.add(f));
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

function runBngModel(perlCmd, bng2Path, sourcePath, outDir, verbose, seed) {
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
              // keep as is, do not convert to ::
            }
            const species = sm[2].trim();
            const count = Math.round(Number(sm[3]));
            speciesLines.push(`${comp}${species}  ${count}`);
          }
        }
        if (speciesLines.length > 0) {
          const baseName = basename(sourcePath, extname(sourcePath));
          const speciesPath = join(tempDir, `${baseName}.species`);
          // writeFileSync(speciesPath, '# species file generated from BNGL seed species\n' + speciesLines.join('\n') + '\n', 'utf8');
          console.log(`  ✓ Skipped writing species file: ${relative(projectRoot, speciesPath)}`);
        }
      }
    }

    // Inject seed if provided and simulate_nf is present
    if (seed !== null && /simulate_nf\s*\(/.test(modelTxt)) {
      const newTxt = modelTxt.replace(/simulate_nf\s*\((.*?)\)/g, (match, args) => {
        // Remove existing curly braces to clean up args
        let cleanArgs = args.replace(/^\s*{/, '').replace(/}\s*$/, '').trim();

        // Remove existing seed or gml if present (to override)
        cleanArgs = cleanArgs.replace(/,?\s*seed\s*=>\s*\d+/, '');
        cleanArgs = cleanArgs.replace(/,?\s*gml\s*=>\s*\d+/, '');
        cleanArgs = cleanArgs.replace(/^,/, ''); // clean leading comma if any

        // output new call with our values
        return `simulate_nf({${cleanArgs}, seed=>${seed}, gml=>5000000, get_final_state=>0})`;
      });
      writeFileSync(modelCopy, newTxt, 'utf8');
      if (verbose) console.log(`  Included seed=${seed} and gml=1000000 in simulate_nf call.`);
    }

  } catch (e) {
    // Non-fatal: if parsing fails, continue and let BNG2.pl run as before
    if (process.env.DEBUG) console.warn('Failed to auto-generate species file:', e.message);
  }

  const result = spawnSync(perlCmd, [bng2Path, modelName], {
    cwd: tempDir,
    env: { 
      ...process.env, 
      NFSIM_EXEC: NFSIM_PATH,
      PERL5LIB: 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\Perl2',
      BNGPATH: 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win'
    },
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
    mkdirSync(dirname(NFSIM_LOG_PATH), { recursive: true });
    appendFileSync(NFSIM_LOG_PATH, `--- FAILED: ${modelName} ---\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\n\n`);

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
    mkdirSync(dirname(NFSIM_LOG_PATH), { recursive: true });
    appendFileSync(NFSIM_LOG_PATH, `--- EMPTY GDAT: ${modelName} (status: ${result.status}) ---\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\n\n`);

    if (!process.env.DEBUG) rmSync(tempDir, { recursive: true, force: true });
    else console.log(`  [DEBUG] Preserved temp dir: ${tempDir}`);
    throw new Error(`No GDAT produced for ${modelName}. See bng_test_output/nfsim_debug.log for details.`);
  }

  // Helper to stitch time in GDAT (handle resets)
  function stitchGdatFile(filePath) {
    try {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      if (lines.length < 2) return;

      const newLines = [];
      let headerIndices = null; // Map of colName -> index
      let timeIdx = -1;
      let prevTime = -Infinity;
      let timeOffset = 0;
      let lastOutputTime = -Infinity;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('#')) {
          // If multiple headers (concatenated runs), we typically only want the first one,
          // OR we accept them but don't reset offset?
          // BNG2 GDAT usually has one header at top. 
          // If we see another header later, it might be a restart?
          if (newLines.length === 0) {
            newLines.push(line);
            const cols = line.replace(/^#\s*/, '').split(/\s+/);
            timeIdx = cols.findIndex(c => c.toLowerCase() === 'time');
          }
          continue;
        }

        if (timeIdx === -1) {
          // fallback: assume first column is time
          timeIdx = 0;
        }

        const cols = line.split(/\s+/);
        // Clean columns to handle empty strings from split
        // Actually split(/\s+/) might return empty string at start if leading space
        // " 1.0  2.0" -> ["", "1.0", "2.0"]
        const dataCols = cols.filter(c => c.length > 0);

        if (dataCols.length <= timeIdx) {
          // bad line
          continue;
        }

        let rawTime = parseFloat(dataCols[timeIdx]);
        if (isNaN(rawTime)) continue;

        // Detection of reset
        if (rawTime < prevTime) {
          // Time went backward. Assume a new phase starting at 0 or t_start.
          // We assume continuity: new phase starts where last ended.
          // So we simply add offset such that newTime >= lastOutputTime
          timeOffset = lastOutputTime - rawTime;
        }

        let stitchedTime = rawTime + timeOffset;

        // Avoid slight backward steps due to precision if rawTime was 0 and we added offset
        if (stitchedTime < lastOutputTime) {
          // This shouldn't happen if we calculated offset = lastOutputTime - rawTime
          // But just in case
          stitchedTime = lastOutputTime;
        }

        prevTime = rawTime;
        lastOutputTime = stitchedTime;

        // Replace time column
        dataCols[timeIdx] = stitchedTime.toExponential(12); // Maintain precision
        newLines.push(' ' + dataCols.join('  '));
      }

      writeFileSync(filePath, newLines.join('\n') + '\n', 'utf8');
      if (timeOffset > 0) {
        console.log(`  Fixed time discontinuity in ${basename(filePath)} (offset: ${timeOffset})`);
      }
    } catch (e) {
      console.warn(`  Failed to stitch GDAT ${basename(filePath)}: ${e.message}`);
    }
  }

  // Copy all produced GDAT files to the output directory. Preserve their original
  // filenames (including any phase/suffix) so downstream tools can locate phases.
  const copiedPaths = [];
  for (const gf of gdatFiles) {
    const sourceGdat = join(tempDir, gf);
    const destName = gf; // preserve original filename
    const destPath = join(outDir, destName);

    // Always overwrite to prevent data duplication from repeated runs.
    // Multi-phase models produce separate files (model.gdat, model_2.gdat)
    // which are each copied individually by their original filenames.
    if (existsSync(destPath)) {
      console.log(`  ⟳ [OVERWRITE] ${relative(projectRoot, destPath)}`);
    }
    copyFileSync(sourceGdat, destPath);
    console.log(`  ✔ ${relative(projectRoot, sourcePath)} -> ${relative(projectRoot, destPath)}`);
    
    // Stitch AFTER copying/appending to ensure destination is fixed
    stitchGdatFile(destPath);

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

  // Wipe NFsim debug log at start of run
  mkdirSync(dirname(NFSIM_LOG_PATH), { recursive: true });
  writeFileSync(NFSIM_LOG_PATH, `--- NFsim Debug Log Started at ${new Date().toISOString()} ---\n\n`);

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
      const output = runBngModel(args.perl, args.bng2, file, args.outDir, args.verbose, args.seed);
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
