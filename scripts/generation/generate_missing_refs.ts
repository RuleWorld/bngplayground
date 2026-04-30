
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { resolveBNG2Paths } from '../../tools/bng2-paths';
import { findRuleHubModelPath, resolveRuleHubRoot } from '../../tools/rulehubLocal';

const REPORT_PATH = path.resolve('reports/validation_report.md');
const BNG2_PATH = process.env.BNG2_PATH || resolveBNG2Paths().bng2pl;
const PERL_CMD = process.env.PERL_CMD || 'perl';
const PROJECT_ROOT = process.cwd();
const BNG_TEST_OUTPUT_DIR = path.resolve('bng_test_output');
const WORK_ROOT = path.resolve('artifacts/missing_refs_work');

const EXCLUDE_MODELS = ['Kozer_2014'];

if (!BNG2_PATH || !fs.existsSync(BNG2_PATH)) {
    console.error(`BNG2 not found at ${BNG2_PATH}`);
    process.exit(1);
}

const content = fs.readFileSync(REPORT_PATH, 'utf8');
const lines = content.split('\n');

const missingModels: string[] = [];

lines.forEach(line => {
    if (line.includes('MISSING_REFERENCE')) {
        const parts = line.split('|');
        if (parts.length >= 3) {
            const name = parts[2].trim();
            if (name && !EXCLUDE_MODELS.includes(name)) {
                missingModels.push(name);
            }
        }
    }
});

console.log(`Found ${missingModels.length} missing references:`, missingModels);

const ruleHubRoot = resolveRuleHubRoot(PROJECT_ROOT);
if (!ruleHubRoot) {
    console.error('RuleHub checkout not found. Set RULEHUB_ROOT or place RuleHub beside this repo.');
    process.exit(1);
}

fs.mkdirSync(BNG_TEST_OUTPUT_DIR, { recursive: true });
fs.mkdirSync(WORK_ROOT, { recursive: true });

for (const model of missingModels) {
    const bnglPath = findRuleHubModelPath(PROJECT_ROOT, model);

    if (!bnglPath) {
        console.error(`Could not find BNGL file for ${model}`);
        const nosourceMarker = path.join(BNG_TEST_OUTPUT_DIR, `${model}.nosource`);
        fs.writeFileSync(nosourceMarker, 'BNGL source file not found in search paths');
        continue;
    }

    console.log(`Generating reference for ${model} from ${bnglPath}...`);
    try {
        const workDir = path.join(WORK_ROOT, model);
        fs.rmSync(workDir, { recursive: true, force: true });
        fs.mkdirSync(workDir, { recursive: true });

        const workBnglPath = path.join(workDir, `${model}.bngl`);
        fs.copyFileSync(bnglPath, workBnglPath);

        console.log(`Running: ${PERL_CMD} "${BNG2_PATH}" "${workBnglPath}"`);

        let success = true;
        let errorOutput = '';
        try {
            execFileSync(PERL_CMD, [BNG2_PATH, workBnglPath], { cwd: workDir, stdio: [0, 'pipe', 'pipe'] });
        } catch (e: any) {
            console.error(`❌ BNG2 execution failed for ${model}`);
            success = false;
            errorOutput = e.stderr?.toString() || e.stdout?.toString() || e.message;
        }

        const gdatFile = path.join(workDir, `${model}.gdat`);
        const targetGdat = path.join(BNG_TEST_OUTPUT_DIR, `${model}.gdat`);
        const failMarker = path.join(BNG_TEST_OUTPUT_DIR, `${model}.bngfail`);

        if (success && fs.existsSync(gdatFile)) {
            console.log(`✓ successfully generated GDAT for ${model}`);
            fs.copyFileSync(gdatFile, targetGdat);
            if (fs.existsSync(failMarker)) fs.unlinkSync(failMarker);
            const nosourceMarker = path.join(BNG_TEST_OUTPUT_DIR, `${model}.nosource`);
            if (fs.existsSync(nosourceMarker)) fs.unlinkSync(nosourceMarker);
        } else {
            console.log(`⚠️ Marking ${model} as BNG_FAILED`);
            fs.writeFileSync(failMarker, errorOutput || 'BNG2.pl produced no GDAT output');
            if (fs.existsSync(targetGdat)) fs.unlinkSync(targetGdat);
        }

    } catch (e: any) {
        console.error(`❌ Failed script logic for ${model}:`, e.message);
    }
}
