import fs from 'fs';
const keep = fs.readFileSync('keep_list.txt', 'utf8').split('\n').filter(Boolean);
const formatted = keep.map(m => `  '${m}',`).join('\n');
fs.writeFileSync('formatted_list.txt', formatted);
