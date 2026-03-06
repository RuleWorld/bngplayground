import * as fs from 'fs';
import * as path from 'path';

// Paths
const RESOLVED_REPORT = path.resolve('reports/validation_report.md.resolved');
const RESULTS_JSON = path.resolve('artifacts/SESSION_2026_01_05_web_output_parity/compare_results.after_refs.json');
const ARTIFACT_PATH = 'C:/Users/Achyudhan/.gemini/antigravity/brain/a33d9450-7b3c-4c15-a02f-53f7c9eae367/validation_report.md';

interface ParityResult {
    model: string;
    status: string;
    details?: {
        maxRelativeError: number;
    } | null;
    error?: string;
}

function normalize(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function main() {
    if (!fs.existsSync(RESOLVED_REPORT)) {
        console.error("Report template not found");
        process.exit(1);
    }

    // Read Comparison Results if available
    let results: ParityResult[] = [];
    if (fs.existsSync(RESULTS_JSON)) {
        try {
            const json = JSON.parse(fs.readFileSync(RESULTS_JSON, 'utf8'));
            results = Array.isArray(json) ? json : (json.results || []);
        } catch (e) {
            console.error("Error reading results json:", e);
        }
    }

    const reportContent = fs.readFileSync(RESOLVED_REPORT, 'utf8');
    // Split on any newline characters to handle CRLF vs LF
    const lines = reportContent.split(/\r?\n/);

    const outLines: string[] = [];
    let inTable = false;

    const resultMap = new Map<string, ParityResult>();
    results.forEach(r => resultMap.set(normalize(r.model), r));

    for (const line of lines) {
        if (line.includes('## 🧪 ODE Candidates')) {
            outLines.push(line);
            inTable = true;
            continue;
        }

        if (line.includes('## 🚫 Excluded')) {
            inTable = false;
            outLines.push(line);
            continue;
        }

        // Match table rows: | something | ...
        const tableRowRegex = /^\s*\|/;

        if (inTable && tableRowRegex.test(line)) {
            // Handle Header
            if (line.includes('| Name |') && line.includes('| Description |')) {
                outLines.push('| # | Name | Filename | Status | Max Rel. Error | Description |');
                continue;
            }
            if (line.includes('---') && line.includes('|')) {
                outLines.push('| --- | --- | --- | --- | --- | --- |');
                continue;
            }

            // Data Row
            const parts = line.split('|');
            // parts[0] is usually empty string if line starts with |
            // 4-column source line: | 1 | AB | AB.bngl | No description |
            // parts: ["", " 1 ", " AB ", " AB.bngl ", " No description ", ""]

            if (parts.length >= 5) {
                const num = parts[1] ? parts[1].trim() : '';
                const name = parts[2] ? parts[2].trim() : '';
                const filename = parts[3] ? parts[3].trim() : '';

                // If name is header-like or separator, just push as is (should be caught above but safety first)
                if (name === 'Name' || name.match(/^-+$/)) {
                    outLines.push(line);
                    continue;
                }

                // Capture Description
                // If source has 4 cols, description is at index 4.
                // If source has 6 cols (re-run on generated file), description is at index 6.
                let desc = '';
                if (parts.length >= 7) {
                    desc = parts[6].trim();
                } else {
                    desc = parts[4].trim();
                }

                const res = resultMap.get(normalize(name));
                let status = 'Untested';
                let error = '-';

                if (res) {
                    if (res.status === 'match') {
                        status = '✅ PASS';
                        error = res.details ? (res.details.maxRelativeError * 100).toExponential(2) + '%' : '0%';
                    } else if (res.status === 'mismatch') {
                        status = '❌ FAIL';
                        error = res.details ? (res.details.maxRelativeError * 100).toExponential(2) + '%' : 'N/A';
                    } else if (res.status === 'error') {
                        status = '⚠️ ERROR';
                        error = res.error || 'Process Error';
                    } else if (res.status === 'skipped') {
                        status = '⚠️ SKIPPED (Timeout)';
                        error = 'Timeout > 30s';
                    } else if (res.status === 'bng_failed') {
                        status = '❌ BNG_FAILED';
                        error = res.error || 'BNG Error';
                    } else if (res.status === 'source_missing') {
                        status = '❓ SOURCE_MISSING';
                        error = res.error || 'File not found';
                    } else {
                        status = '❓ ' + res.status.toUpperCase();
                    }
                }

                // Sanitize error for table row
                error = error.replace(/[\r\n]+/g, ' ').trim();
                if (error.length > 200) {
                    error = error.substring(0, 197) + '...';
                }

                outLines.push(`| ${num} | ${name} | ${filename} | ${status} | ${error} | ${desc} |`);
            } else {
                outLines.push(line);
            }
        } else {
            outLines.push(line);
        }
    }

    fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
    // Write with standard LF for consistency
    fs.writeFileSync(ARTIFACT_PATH, outLines.join('\n'));
    console.log(`Generated report at ${ARTIFACT_PATH}`);
}

main();
