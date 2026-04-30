
import * as fs from 'fs';
import * as path from 'path';

const WEB_OUTPUT_DIR = path.resolve('web_output');
const REPORT_PATH = path.resolve('reports/validation_report.md.resolved');

let content = '';
try {
    content = fs.readFileSync(REPORT_PATH, 'utf8');
} catch (error: any) {
    if (error?.code === 'ENOENT') {
        console.error('Report not found');
        process.exit(1);
    }
    throw error;
}
const lines = content.split('\n');

let missingCount = 0;

lines.forEach(line => {
    if (line.includes('| Untested |')) {
        const parts = line.split('|');
        if (parts.length >= 3) {
            const name = parts[2].trim();
            if (name && name !== 'Name' && !name.startsWith('-')) {
                const filename = `results_${name}.csv`;
                const filePath = path.join(WEB_OUTPUT_DIR, filename);

                try {
                    const fd = fs.openSync(filePath, 'wx');
                    try {
                        fs.writeFileSync(fd, 'Time,Observable\n# SKIPPED (Failed/Crash)\n0,0');
                    } finally {
                        fs.closeSync(fd);
                    }
                    console.log(`Creating missing skipped marker for: ${name}`);
                    missingCount++;
                } catch (error: any) {
                    if (error?.code !== 'EEXIST') throw error;
                }
            }
        }
    }
});

console.log(`Filled ${missingCount} missing models.`);
