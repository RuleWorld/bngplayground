
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function resolveRuleHubRoot(projectRoot: string): string | null {
  const fromEnv = process.env.RULEHUB_ROOT?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (fs.existsSync(resolved)) return resolved;
  }

  const sibling = path.resolve(projectRoot, '..', 'RuleHub');
  return fs.existsSync(sibling) ? sibling : null;
}

const RULEHUB_ROOT = resolveRuleHubRoot(PROJECT_ROOT);
if (!RULEHUB_ROOT) {
  throw new Error('RuleHub checkout not found. Set RULEHUB_ROOT or place RuleHub beside this repo.');
}

const TUTORIAL_DIR = path.join(RULEHUB_ROOT, 'Tutorials');

function findBNGLFiles(dir: string, fileList: string[] = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && !file.startsWith('.')) {
      findBNGLFiles(filePath, fileList);
    } else if (file.endsWith('.bngl')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = findBNGLFiles(TUTORIAL_DIR);

let imports = '';
let arrayItems = '';

const toCamelCase = (str: string) => {
  return str.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
}

files.forEach((file) => {
  const relativePath = path.relative(RULEHUB_ROOT, file).replace(/\\/g, '/');
  const basename = path.basename(file, '.bngl');
  const variableName = toCamelCase(basename) + 'Tutorial';
  
  // Clean name: replace underscores with spaces, Title Case
  const cleanName = basename.replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  imports += `// ${relativePath}\nconst ${variableName}Id = '${basename}';\n`;
  
  arrayItems += `  {
    id: ${variableName}Id,
    name: '${cleanName}',
    description: 'RuleHub tutorial: ${cleanName}',
    tags: ['published', 'tutorial', 'native'],
  },\n`;
});

console.log('// Imports');
console.log(imports);
console.log('\n// Array');
console.log('const NATIVE_TUTORIALS: Example[] = [');
console.log(arrayItems);
console.log('];');
