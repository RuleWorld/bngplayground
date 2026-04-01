
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseBNGL } from '../services/parseBNGL';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function runStressTest() {
  console.log('Starting BNGL Parser Stress Test...');
  
  // Find all .bngl files
  const bnglFiles = await glob('**/*.bngl', { 
    cwd: rootDir, 
    ignore: ['node_modules/**', 'dist/**'] 
  });

  console.log(`Found ${bnglFiles.length} BNGL files.`);
  
  const directories = new Set(bnglFiles.map(f => path.dirname(f)));
  console.log('Directories containing BNGL files:');
  directories.forEach(d => console.log(` - ${d}`));
  console.log('----------------------------------------');

  let passed = 0;
  let failed = 0;
  const failures: { file: string; error: string }[] = [];

  for (const file of bnglFiles) {
    const fullPath = path.join(rootDir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      parseBNGL(content);
      passed++;
      // Optional: Print a dot for progress to avoid spamming output
      process.stdout.write('.');
    } catch (e: any) {
      failed++;
      process.stdout.write('F');
      failures.push({
        file: file,
        error: e.message || String(e)
      });
    }
  }

  console.log('\n\nStress Test Complete.');
  console.log(`Total: ${bnglFiles.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => {
      console.log(`\nFile: ${f.file}`);
      console.log(`Error: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\nAll files parsed successfully!');
    process.exit(0);
  }
}

runStressTest().catch(console.error);
