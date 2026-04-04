import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

export interface BNG2Paths {
  bng2pl: string | null;
  nfsim: string | null;
  runNetwork: string | null;
  bngRoot: string | null;
  perl5lib: string | null;
}

function findFirstExistingPath(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getPythonPackageRoot(): string | null {
  try {
    return execSync(
      'python -c "import bionetgen, os; print(os.path.dirname(bionetgen.__file__))"',
      { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch {
    return null;
  }
}

export function resolveBNG2Paths(): BNG2Paths {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const result: BNG2Paths = {
    bng2pl: null,
    nfsim: null,
    runNetwork: null,
    bngRoot: null,
    perl5lib: null,
  };

  if (process.env.BNG2_PATH && existsSync(process.env.BNG2_PATH)) {
    result.bng2pl = process.env.BNG2_PATH;
  }
  if (process.env.NFSIM_PATH && existsSync(process.env.NFSIM_PATH)) {
    result.nfsim = process.env.NFSIM_PATH;
  }
  if (process.env.BNGPATH && existsSync(process.env.BNGPATH)) {
    result.bngRoot = process.env.BNGPATH;
  }

  if (!result.nfsim) {
    result.nfsim = findFirstExistingPath([
      resolve(`nfsim/build/NFsim${ext}`),
      resolve(`nfsim/build_native/NFsim${ext}`),
      resolve(`nfsim/build_win/NFsim${ext}`),
      resolve(`nfsim/bin/NFsim${ext}`),
    ]);
  }

  if (!result.bngRoot) {
    const pythonPackageRoot = getPythonPackageRoot();
    if (pythonPackageRoot) {
      const platform = process.platform === 'win32' ? 'bng-win'
        : process.platform === 'darwin' ? 'bng-mac'
        : 'bng-linux';
      const bngDir = join(pythonPackageRoot, platform);
      if (existsSync(bngDir)) {
        result.bngRoot = bngDir;
      }
    }
  }

  if (!result.bngRoot) {
    const platform = process.platform === 'win32' ? 'bng-win'
      : process.platform === 'darwin' ? 'bng-mac'
      : 'bng-linux';
    const localPath = resolve(`bionetgen_python/${platform}`);
    if (existsSync(localPath)) {
      result.bngRoot = localPath;
    }
  }

  // Check for sibling bionetgen-cpp/bng2 directory (common local dev layout)
  if (!result.bngRoot) {
    const siblingCandidates = [
      resolve('../bionetgen-cpp/bng2'),
      resolve('../../bionetgen-cpp/bng2'),
      resolve('../bng2'),
    ];
    for (const candidate of siblingCandidates) {
      if (existsSync(join(candidate, 'BNG2.pl'))) {
        result.bngRoot = candidate;
        break;
      }
    }
  }

  if (result.bngRoot) {
    if (!result.bng2pl) {
      const bng2pl = join(result.bngRoot, 'BNG2.pl');
      if (existsSync(bng2pl)) result.bng2pl = bng2pl;
    }
    if (!result.nfsim) {
      const nfsim = join(result.bngRoot, 'bin', `NFsim${ext}`);
      if (existsSync(nfsim)) result.nfsim = nfsim;
    }
    if (!result.runNetwork) {
      const runNetworkCandidates = [
        join(result.bngRoot, 'bin', `run_network${ext}`),
        join(result.bngRoot, 'Network3', 'bin', `run_network${ext}`),
      ];
      for (const candidate of runNetworkCandidates) {
        if (existsSync(candidate)) {
          result.runNetwork = candidate;
          break;
        }
      }
    }
    const perl2 = join(result.bngRoot, 'Perl2');
    if (existsSync(perl2)) {
      result.perl5lib = perl2;
    }
  }

  return result;
}

export function hasBNG2(): boolean {
  return resolveBNG2Paths().bng2pl !== null;
}

export function hasNFsim(): boolean {
  return resolveBNG2Paths().nfsim !== null;
}

export function resolveBNGValidateDir(): string | null {
  const pythonPackageRoot = getPythonPackageRoot();

  const envCandidates = [
    process.env.BNG_VALIDATE_DIR,
    process.env.BNGPATH ? join(process.env.BNGPATH, 'Validate') : null,
    pythonPackageRoot ? join(pythonPackageRoot, 'Validate') : null,
    pythonPackageRoot ? join(pythonPackageRoot, 'bng2', 'Validate') : null,
  ].filter(Boolean) as string[];

  for (const candidate of envCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const { bngRoot } = resolveBNG2Paths();
  if (bngRoot) {
    const bundledValidate = join(bngRoot, 'Validate');
    if (existsSync(bundledValidate)) {
      return bundledValidate;
    }
  }

  const repoValidate = resolve('bionetgen/bng2/Validate');
  if (existsSync(repoValidate)) {
    return repoValidate;
  }

  return null;
}
