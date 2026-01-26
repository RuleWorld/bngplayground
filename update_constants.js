import fs from 'fs';
const keep = new Set(fs.readFileSync('keep_list.txt', 'utf8').split('\n').filter(Boolean));
let constants = fs.readFileSync('constants.ts', 'utf8');

const regex = /export const BNG2_COMPATIBLE_MODELS = new Set\(\[([\s\S]*?)\]\);/;
const match = constants.match(regex);
if (match) {
    const formatted = Array.from(keep).sort().map(m => `  '${m}',`).join('\n');
    const fullBlock = `export const BNG2_COMPATIBLE_MODELS = new Set([\n  // ========================================================\n  // Models verified to pass BNG2.pl (BNG2-compatible)\n  // Last updated: 2026-01-25 using parity report\n  // Total: ${keep.size} models\n  // ========================================================\n${formatted}\n]);`;
    constants = constants.replace(regex, fullBlock);
}

// Verified models list - just filter existing or replace if requested
const regex2 = /export const BNG2_PARSE_AND_ODE_VERIFIED_MODELS = new Set\(\[([\s\S]*?)\]\);/;
const match2 = constants.match(regex2);
if (match2) {
    const lines = match2[1].split('\n');
    const filtered = lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('=') || trimmed.startsWith('Last updated') || trimmed.startsWith('Total:')) return true;
        const id = trimmed.replace(/['",]/g, '');
        return keep.has(id);
    }).join('\n');
    constants = constants.replace(match2[1], filtered);
}

fs.writeFileSync('constants.ts', constants);
console.log('constants.ts updated with full list');
