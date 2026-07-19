import fs from 'fs';

const logPath = 'verify_all_output_v2.txt';

if (!fs.existsSync(logPath)) {
  console.error('Log file not found');
  process.exit(1);
}

// TS-Node might read as utf8 even if it's utf16le? 
// If it's UTF-16LE, readFileSync 'utf8' will be garbage.
// Let's try to detect or just read as buffer and decode.

// Actually, let's assume it's readable for now. If it was written by `> verify_all_output_v2.txt` in PowerShell, it's likely UTF-16LE.
// But `npx ts-node ... > ...` might use the node encoding.
// Let's try reading as utf16le first.

let lines: string[] = [];
try {
    // Try UTF-16LE (UCS-2) first as PowerShell > defaults to this
    const content16 = fs.readFileSync(logPath, 'ucs2');
    if (content16.includes('Verifying')) {
        lines = content16.split(/\r?\n/);
    } else {
        // Try UTF-8
        const content8 = fs.readFileSync(logPath, 'utf8');
        lines = content8.split(/\r?\n/);
    }
} catch (e) {
    console.error('Error reading file:', e);
    process.exit(1);
}

let passed = 0;
let failed = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.includes(': Passed')) {
    passed++;
  } else if (line.includes(': Failed')) {
    failed++;
    console.log(`FAILURE: ${line}`);
    // Try to find error
    for (let j = 1; j < 5; j++) {
        if (i + j < lines.length) {
            const nextLine = lines[i+j].trim();
            if (nextLine.includes('Error:')) {
                console.log(`  ${nextLine}`);
            }
        }
    }
  }
}

console.log(`Total: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
