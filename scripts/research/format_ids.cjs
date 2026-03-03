const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public_models_compatibility.json', 'utf8'));
const formatted = data.pass.map(id => `  '${id}',`).join('\n');
fs.writeFileSync('pass_ids.txt', formatted);
console.log('Formatted IDs written to pass_ids.txt');
