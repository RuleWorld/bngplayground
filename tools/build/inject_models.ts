
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const VALID_MODELS_JSON = path.join(PROJECT_ROOT, 'tests/bionetgen-repo/valid_models.json');
// Target root constants.ts
const DEST_FILE = path.join(PROJECT_ROOT, 'validation_models.ts');
const INDEX_FILE = path.join(PROJECT_ROOT, 'constants.ts');

const SKIP_MODELS = ['blbr'];

function shouldSkip(modelPath: string): boolean {
    const name = path.basename(modelPath, '.bngl');
    return SKIP_MODELS.some(s => name.toLowerCase().includes(s.toLowerCase()));
}

function main() {
    if (!fs.existsSync(VALID_MODELS_JSON)) {
        console.error(`valid_models.json not found.`);
        process.exit(1);
    }

    const models: string[] = JSON.parse(fs.readFileSync(VALID_MODELS_JSON, 'utf-8'));
    const validModels = models.filter(m => !shouldSkip(m));

    console.log(`Injecting ${validModels.length} models...`);

    const modelObjects = validModels.map(filepath => {
        const name = path.basename(filepath, '.bngl');
        const code = fs.readFileSync(filepath, 'utf-8').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
        return { name, code };
    });

    const content = `
import { BNGLModel } from './types';

export const VALIDATION_MODELS: BNGLModel[] = [
${modelObjects.map(m => `  {
    name: \`${m.name}\`,
    code: \`${m.code}\`
  }`).join(',\n')}
];
`;

    fs.writeFileSync(DEST_FILE, content);
    console.log(`Created ${DEST_FILE}`);

    // Update constants.ts to include this category
    const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
    if (!indexContent.includes('VALIDATION_MODELS')) {
        const importLine = `import { VALIDATION_MODELS } from './validation_models';\n`;
        // Look for the RAW_MODEL_CATEGORIES definition
        const exportLineToCheck = `const RAW_MODEL_CATEGORIES: ModelCategory[] = [`;

        let newContent = importLine + indexContent;
        if (newContent.includes(exportLineToCheck)) {
            newContent = newContent.replace(exportLineToCheck, `${exportLineToCheck}\n  {\n    name: 'Validation Candidates',\n    models: VALIDATION_MODELS\n  },`);
            fs.writeFileSync(INDEX_FILE, newContent);
            console.log(`Updated ${INDEX_FILE}`);
        } else {
            console.error(`Could not find RAW_MODEL_CATEGORIES in ${INDEX_FILE}`);
        }
    } else {
        console.log(`constants.ts already updated.`);
    }
}

main();
