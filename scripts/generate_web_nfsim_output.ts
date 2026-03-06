
import * as fs from 'fs';
import * as path from 'path';
import { parseBNGL } from '../services/parseBNGL';
import { BNGXMLWriter } from '@bngplayground/engine';
import { execSync } from 'child_process';

async function run() {
    const modelPath = path.resolve('public/models/polymer.bngl');
    console.log(`Loading model: ${modelPath}`);
    const bnglContent = fs.readFileSync(modelPath, 'utf8');

    console.log('Parsing BNGL...');
    const model = parseBNGL(bnglContent);

    console.log('Generating BNGXML...');
    const xml = BNGXMLWriter.write(model);
    const xmlPath = path.resolve('temp_parity_polymer', 'polymer_web.xml');
    fs.writeFileSync(xmlPath, xml);

    console.log('Running NFsim (local)...');
    // Assuming NFsim is in the path. If not, we might need the absolute path.
    // Based on project structure, NFsim might be a WASM module or a binary.
    // However, for parity check, we usually compare the XML first if NFsim binary isn't easily runnable.
    // Let's try to run NFsim if it exists.
    try {
        const nfsimPath = "C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\bin\\NFsim.exe";
        const gdatPath = path.resolve('temp_parity_polymer', 'polymer_web.gdat');
        const cmd = `"${nfsimPath}" -xml "${xmlPath}" -v -t 0.01 -osteps 10 -o "${gdatPath}"`;
        console.log(`Executing: ${cmd}`);
        const out = execSync(cmd, { encoding: 'utf8' });
        console.log('NFsim stdout:', out);
        console.log(`Web simulator NFsim output saved to: ${gdatPath}`);
    } catch (e) {
        console.error('Failed to run NFsim binary:', e);
    }
}

run().catch(console.error);
