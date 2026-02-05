import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('public_atomizer_report.json', 'utf8'));

const failed = data.filter((m: any) => m.status === 'FAIL').sort((a: any, b: any) => b.mae - a.mae);
const passed = data.filter((m: any) => m.status === 'PASS');

console.log('=== ATOMIZER VERIFICATION SUMMARY ===\n');
console.log(`Total Models: ${data.length}`);
console.log(`Passed: ${passed.length}`);
console.log(`Failed: ${failed.length}`);
console.log(`Pass Rate: ${((passed.length / data.length) * 100).toFixed(1)}%\n`);

console.log('=== FAILED MODELS (sorted by MAE) ===\n');

// Categorize by MAE magnitude
const catastrophic = failed.filter((m: any) => m.mae >= 1e10);
const severe = failed.filter((m: any) => m.mae >= 1e3 && m.mae < 1e10);
const moderate = failed.filter((m: any) => m.mae >= 10 && m.mae < 1e3);
const minor = failed.filter((m: any) => m.mae < 10);

if (catastrophic.length > 0) {
  console.log(`CATASTROPHIC (MAE >= 1e10): ${catastrophic.length} models`);
  catastrophic.forEach((m: any) => {
    console.log(`  ${m.model.padEnd(35)} MAE: ${m.mae.toExponential(2)}`);
  });
  console.log();
}

if (severe.length > 0) {
  console.log(`SEVERE (1e3 <= MAE < 1e10): ${severe.length} models`);
  severe.forEach((m: any) => {
    console.log(`  ${m.model.padEnd(35)} MAE: ${m.mae.toExponential(2)}`);
  });
  console.log();
}

if (moderate.length > 0) {
  console.log(`MODERATE (10 <= MAE < 1e3): ${moderate.length} models`);
  moderate.forEach((m: any) => {
    console.log(`  ${m.model.padEnd(35)} MAE: ${m.mae.toFixed(2)}`);
  });
  console.log();
}

if (minor.length > 0) {
  console.log(`MINOR (MAE < 10): ${minor.length} models`);
  minor.forEach((m: any) => {
    console.log(`  ${m.model.padEnd(35)} MAE: ${m.mae.toFixed(4)}`);
  });
}
