import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import process from 'node:process';

const REPORT_PATH = path.resolve('reports/validation_report.md.resolved');
const WEB_OUTPUT_DIR = path.resolve('web_output');

function getModelList() {
  const content = fs.readFileSync(REPORT_PATH, 'utf8');
  const lines = content.split('\n');
  const models = [];
  let inTable = false;
  
  for (const line of lines) {
    if (line.includes('## 🧪 ODE Candidates')) {
      inTable = true;
      continue;
    }
    if (line.includes('## 🚫 Excluded')) {
      break;
    }
    if (inTable && line.trim().startsWith('|')) {
      const parts = line.split('|').map(s => s.trim());
      // | # | Name | Filename | Status | ...
      // parts[0] is empty, parts[1] is #, parts[2] is Name, parts[3] is Filename, parts[4] is Status
      if (parts.length > 4 && parts[2] !== 'Name' && parts[2] !== '---') {
        const name = parts[2];
        const status = parts[4];
        if (status.includes('Untested')) {
            models.push(name);
        }
      }
    }
  }
  return models;
}

function cleanOutput() {
  // DISABLED for incremental run
  /*
  if (fs.existsSync(WEB_OUTPUT_DIR)) {
    console.log('Cleaning web_output...');
    try {
        fs.rmSync(WEB_OUTPUT_DIR, { recursive: true, force: true });
    } catch (e) {
        console.warn('Could not fully clean web_output (files might be locked), continuing...');
    }
    if (!fs.existsSync(WEB_OUTPUT_DIR)) {
        fs.mkdirSync(WEB_OUTPUT_DIR);
    }
  } else {
    fs.mkdirSync(WEB_OUTPUT_DIR);
  }
  */
  if (!fs.existsSync(WEB_OUTPUT_DIR)) {
    fs.mkdirSync(WEB_OUTPUT_DIR);
  }
}

function killPorts() {
  const ports = [5173, 5174, 5175, 5176];
  
  for (const port of ports) {
     try {
        const cmd = `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }`;
        execSync(`powershell -Command "${cmd}"`, { stdio: 'ignore' });
     } catch (e) {}
  }
}

function runChunk(models) {
  killPorts();
  // Sleep briefly to allow port release
  const end = Date.now() + 2000;
  while (Date.now() < end) {}

  const modelStr = models.join(',');
  console.log(`\n----------------------------------------------------------------`);
  console.log(`Running chunk of ${models.length} models: ${models[0]} ... ${models[models.length-1]}`);
  
  const cmd = 'node';
  const scriptPath = path.resolve('scripts/generate_web_output_playwright.mjs');
  const args = [scriptPath, '--models', modelStr];
  
  const result = spawnSync(cmd, args, { 
    stdio: 'inherit',
    encoding: 'utf8',
    env: { ...process.env, WEB_OUTPUT_MODELS: modelStr }
  });
  
  if (result.error) {
     console.error('Spawn error:', result.error);
  }
  
  if (result.status !== 0) {
    console.error(`Chunk failed with code ${result.status}`);
  }
}

function main() {
  if (!fs.existsSync(REPORT_PATH)) {
      console.error(`Report file not found: ${REPORT_PATH}`);
      process.exit(1);
  }

  const models = getModelList();
  console.log(`Found ${models.length} models to process.`);
  
  cleanOutput();
  
  const CHUNK_SIZE = 10;
  for (let i = 0; i < models.length; i += CHUNK_SIZE) {
    const chunk = models.slice(i, i + CHUNK_SIZE);
    console.log(`\nProcessing chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(models.length/CHUNK_SIZE)}`);
    runChunk(chunk);
  }
}

main();
