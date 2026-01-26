import { spawnSync } from 'child_process';
import { resolve } from 'path';

const binDir = resolve('bionetgen_python', 'bng-win', 'bin');
const nfsim = resolve(binDir, 'NFsim.exe');

console.log('Running NFsim from:', nfsim);
console.log('With PATH isolated to:', binDir);

const result = spawnSync(nfsim, ['-v'], {
    env: { ...process.env, PATH: binDir }
});

console.log('Exit code:', result.status);
console.log('STDOUT:', result.stdout?.toString() || '(empty)');
console.log('STDERR:', result.stderr?.toString() || '(empty)');

// Try with -h as well
const resultH = spawnSync(nfsim, ['-h'], {
    env: { ...process.env, PATH: binDir }
});
console.log('\n--- Help Output ---');
console.log('Exit code:', resultH.status);
console.log('STDOUT:', resultH.stdout?.toString() || '(empty)');
console.log('STDERR:', resultH.stderr?.toString() || '(empty)');
