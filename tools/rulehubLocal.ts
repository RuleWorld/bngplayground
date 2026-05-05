import * as fs from 'fs';
import * as path from 'path';

export interface RuleHubManifestEntry {
  id?: string;
  path?: string;
  file?: string;
  collectionId?: string;
  bng2_compatible?: boolean;
  compatibility?: { bng2?: boolean; nfsim?: boolean; excluded?: boolean; methods?: string[] };
  origin?: string;
  category?: string;
  visible?: boolean;
}

export type RuleHubModelSource =
  | 'rulehub-published'
  | 'rulehub-example'
  | 'rulehub-validation'
  | 'rulehub-runtime'
  | 'rulehub-tutorial'
  | 'rulehub-pybionetgen'
  | 'rulehub-other';

export function normalizeModelKey(raw: string): string {
  return path.basename(raw)
    .toLowerCase()
    .replace(/\.bngl$/i, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function resolveRuleHubRoot(projectRoot: string): string | null {
  const fromEnv = process.env.RULEHUB_ROOT?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (fs.existsSync(resolved)) return resolved;
  }

  const sibling = path.resolve(projectRoot, '..', 'RuleHub');
  if (fs.existsSync(sibling)) return sibling;

  return null;
}

export function resolveRuleHubManifestPath(projectRoot: string): string | null {
  const ruleHubRoot = resolveRuleHubRoot(projectRoot);
  if (!ruleHubRoot) return null;
  const manifestPath = path.join(ruleHubRoot, 'manifest.json');
  return fs.existsSync(manifestPath) ? manifestPath : null;
}

export function loadRuleHubManifest(projectRoot: string): RuleHubManifestEntry[] {
  const manifestPath = resolveRuleHubManifestPath(projectRoot);
  if (!manifestPath) return [];

  const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as RuleHubManifestEntry[] | { models?: RuleHubManifestEntry[] };
  return Array.isArray(payload) ? payload : payload.models ?? [];
}

export function collectBnglFilesRecursive(rootDir: string, results: string[] = []): string[] {
  if (!fs.existsSync(rootDir)) return results;

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectBnglFilesRecursive(fullPath, results);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.bngl')) {
      results.push(fullPath);
    }
  }

  return results;
}

export function listRuleHubExampleModelFiles(projectRoot: string): string[] {
  const ruleHubRoot = resolveRuleHubRoot(projectRoot);
  if (!ruleHubRoot) return [];
  return collectBnglFilesRecursive(path.join(ruleHubRoot, 'Contributed', 'BNGPlayground_Examples'));
}

export function listRuleHubPublishedModelFiles(projectRoot: string): string[] {
  const ruleHubRoot = resolveRuleHubRoot(projectRoot);
  if (!ruleHubRoot) return [];
  return collectBnglFilesRecursive(path.join(ruleHubRoot, 'Published'));
}

export function findRuleHubModelPath(projectRoot: string, modelName: string): string | null {
  const ruleHubRoot = resolveRuleHubRoot(projectRoot);
  if (!ruleHubRoot) return null;

  const manifest = loadRuleHubManifest(projectRoot);
  const targetKey = normalizeModelKey(modelName);
  for (const entry of manifest) {
    const candidates = [
      entry.id,
      entry.file,
      entry.path,
      entry.path ? path.basename(entry.path, '.bngl') : null,
    ].filter((value): value is string => Boolean(value));

    if (candidates.some((candidate) => normalizeModelKey(candidate) === targetKey)) {
      if (entry.path) {
        const fullPath = path.join(ruleHubRoot, entry.path);
        if (fs.existsSync(fullPath)) return fullPath;
      }
    }
  }

  const fallbackFiles = [
    ...listRuleHubPublishedModelFiles(projectRoot),
    ...listRuleHubExampleModelFiles(projectRoot),
  ];
  return fallbackFiles.find((filePath) => normalizeModelKey(filePath) === targetKey) ?? null;
}

export function getRuleHubManifestBnglPaths(
  projectRoot: string,
  predicate?: (entry: RuleHubManifestEntry) => boolean,
): string[] {
  const ruleHubRoot = resolveRuleHubRoot(projectRoot);
  if (!ruleHubRoot) return [];

  return loadRuleHubManifest(projectRoot)
    .filter((entry) => Boolean(entry.path))
    .filter((entry) => (predicate ? predicate(entry) : true))
    .map((entry) => path.join(ruleHubRoot, entry.path!))
    .filter((filePath) => fs.existsSync(filePath));
}

export function classifyRuleHubPath(ruleHubRoot: string, filePath: string): RuleHubModelSource {
  const relativePath = path.relative(ruleHubRoot, filePath).replace(/\\/g, '/');

  if (relativePath.startsWith('Published/')) return 'rulehub-published';
  if (relativePath.startsWith('Contributed/BNGPlayground_Examples/')) return 'rulehub-example';
  if (relativePath.startsWith('Contributed/BNGPlayground_Validation/')) return 'rulehub-validation';
  if (relativePath.startsWith('Contributed/BNGPlayground_PublicRuntime/')) return 'rulehub-runtime';
  if (relativePath.startsWith('Tutorials/')) return 'rulehub-tutorial';
  if (relativePath.startsWith('PyBioNetGen/')) return 'rulehub-pybionetgen';

  return 'rulehub-other';
}

export function listAllRuleHubModelFiles(
  projectRoot: string,
): Array<{ filePath: string; relativePath: string; source: RuleHubModelSource }> {
  const ruleHubRoot = resolveRuleHubRoot(projectRoot);
  if (!ruleHubRoot) return [];

  const roots = [
    path.join(ruleHubRoot, 'Published'),
    path.join(ruleHubRoot, 'Contributed', 'BNGPlayground_Examples'),
    path.join(ruleHubRoot, 'Contributed', 'BNGPlayground_Validation'),
    path.join(ruleHubRoot, 'Contributed', 'BNGPlayground_PublicRuntime'),
    path.join(ruleHubRoot, 'Tutorials'),
    path.join(ruleHubRoot, 'PyBioNetGen'),
  ];

  const seen = new Set<string>();
  const files: Array<{ filePath: string; relativePath: string; source: RuleHubModelSource }> = [];

  for (const root of roots) {
    for (const filePath of collectBnglFilesRecursive(root)) {
      const normalized = path.normalize(filePath);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      files.push({
        filePath,
        relativePath: path.relative(ruleHubRoot, filePath).replace(/\\/g, '/'),
        source: classifyRuleHubPath(ruleHubRoot, filePath),
      });
    }
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;
}