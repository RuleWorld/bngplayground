import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundlePath = resolve(import.meta.dirname, '..', 'dist', 'apps', 'bng-results.html');
const html = await readFile(bundlePath, 'utf8');

const failures = [];
if (/<script\b[^>]*\bsrc\s*=/i.test(html)) failures.push('contains an external script');
if (/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref\s*=/i.test(html)) {
  failures.push('contains an external stylesheet');
}
if (!html.includes('ui/initialize')) failures.push('does not include the MCP Apps bridge');
if (!html.includes('Simulation trajectories')) failures.push('does not include the simulation view');
if (!html.includes('Contact map')) failures.push('does not include the contact-map view');

if (failures.length > 0) {
  throw new Error(`Invalid MCP App bundle: ${failures.join('; ')}`);
}

console.log(`Verified self-contained MCP App bundle (${html.length} bytes).`);
