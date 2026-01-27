#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const sbmlPath = process.argv[2];
if (!sbmlPath) {
  console.error('Usage: node atomize_with_dist_runner.js <sbml-file>');
  process.exit(2);
}
const fullPath = path.resolve(sbmlPath);
if (!fs.existsSync(fullPath)) {
  console.error('SBML file not found:', fullPath);
  process.exit(2);
}

(async () => {
  try {
    const atomizerModule = require(path.resolve(__dirname, '../dist/atomizer.cjs'));
    if (!atomizerModule || typeof atomizerModule.sbmlToBngl !== 'function') {
      console.error('Bundled atomizer did not export sbmlToBngl');
      process.exit(3);
    }

    const sbml = fs.readFileSync(fullPath, 'utf8');
    const res = await atomizerModule.sbmlToBngl(sbml);
    console.log('--- BNGL OUTPUT START ---');
    console.log(res.bngl);
    console.log('--- BNGL OUTPUT END ---');
    if (!res.success) {
      console.error('Atomizer reported failure:', res.error || res.log);
      process.exit(4);
    }
  } catch (e) {
    console.error('Error running bundled Atomizer:', e);
    process.exit(5);
  }
})();
