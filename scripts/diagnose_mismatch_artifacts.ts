import fs from 'node:fs';
import path from 'node:path';
import { parseBNGL } from '../services/parseBNGL.ts';
import { generateExpandedNetwork } from '@bngplayground/engine';
import { simulate } from '@bngplayground/engine';
import { getSimulationOptionsFromParsedModel } from '../packages/engine/src/utils/simulationOptions.ts';

const ROOT = process.cwd();
const MODELS: Array<{ id: string; bngl: string; refGdat: string; refNet: string; refCdat?: string }> = [
  { id: 'an_2009', bngl: 'An_2009.bngl', refGdat: 'tests/fixtures/gdat/An_2009.gdat', refNet: 'bng_test_output/An_2009.net', refCdat: 'tests/pac/atomized_sim/An_2009/An_2009.cdat' },
  { id: 'cbngl_simple', bngl: 'cBNGL_simple.bngl', refGdat: 'tests/fixtures/gdat/cBNGL_simple.gdat', refNet: 'bng_test_output/cBNGL_simple.net', refCdat: 'bng_test_output/cBNGL_simple.cdat' },
  { id: 'eco_coevolution_host_parasite', bngl: 'eco_coevolution_host_parasite.bngl', refGdat: 'tests/fixtures/gdat/eco_coevolution_host_parasite.gdat', refNet: 'bng_test_output/eco_coevolution_host_parasite.net', refCdat: 'bng_test_output/eco_coevolution_host_parasite.cdat' },
  { id: 'egfr_simple', bngl: 'egfr_simple.bngl', refGdat: 'tests/fixtures/gdat/egfr_simple.gdat', refNet: 'bng_test_output/egfr_simple.net' },
  { id: 'genetic_bistability_energy', bngl: 'genetic_bistability_energy.bngl', refGdat: 'tests/fixtures/gdat/genetic_bistability_energy.gdat', refNet: 'bng_test_output/genetic_bistability_energy.net', refCdat: 'bng_test_output/genetic_bistability_energy.cdat' },
  { id: 'lin_prion_2019', bngl: 'Lin_Prion_2019.bngl', refGdat: 'tests/fixtures/gdat/Lin_Prion_2019_ODE.gdat', refNet: 'bng_test_output/Lin_Prion_2019_ODE.net' },
  { id: 'process_cell_adhesion_strength', bngl: 'process_cell_adhesion_strength.bngl', refGdat: 'tests/fixtures/gdat/process_cell_adhesion_strength.gdat', refNet: 'bng_test_output/process_cell_adhesion_strength.net', refCdat: 'bng_test_output/process_cell_adhesion_strength.cdat' },
];

const ABS_TOL = 1e-5;
const REL_TOL = 2e-4;

function parseCsv(filePath: string) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());
  const data = lines.slice(1).map((line) => line.split(',').map((v) => Number(v.trim())));
  return { headers, data };
}

function parseDat(filePath: string) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter((l) => l.trim());
  const headerLine = lines.find((l) => l.startsWith('#')) ?? '';
  const headers = headerLine.replace('#', '').trim().split(/\s+/);
  const data = lines.filter((l) => !l.startsWith('#')).map((line) => line.trim().split(/\s+/).map((v) => Number(v)));
  return { headers, data };
}

function normalizeHeader(h: string) {
  return h.toLowerCase().replace(/\s+/g, '_');
}

function compareTables(a: { headers: string[]; data: number[][] }, b: { headers: string[]; data: number[][] }) {
  const ah = a.headers.map(normalizeHeader);
  const bh = b.headers.map(normalizeHeader);
  const aiTime = ah.indexOf('time');
  const biTime = bh.indexOf('time');

  const bColByName = new Map<string, number>();
  bh.forEach((name, idx) => bColByName.set(name, idx));

  const commonCols = ah.filter((name) => name !== 'time' && bColByName.has(name));
  const minRows = Math.min(a.data.length, b.data.length);

  let maxRel = 0;
  let maxAbs = 0;
  let maxRelAt: { row: number; col: string; time: number } | null = null;
  let maxAbsAt: { row: number; col: string; time: number } | null = null;

  for (let r = 0; r < minRows; r++) {
    for (const colName of commonCols) {
      const ca = ah.indexOf(colName);
      const cb = bColByName.get(colName)!;
      const av = a.data[r][ca];
      const bv = b.data[r][cb];
      const abs = Math.abs(av - bv);
      const rel = abs / Math.max(Math.abs(av), Math.abs(bv), 1e-30);
      if (abs > maxAbs) {
        maxAbs = abs;
        maxAbsAt = { row: r, col: colName, time: aiTime >= 0 ? a.data[r][aiTime] : r };
      }
      if (rel > maxRel) {
        maxRel = rel;
        maxRelAt = { row: r, col: colName, time: aiTime >= 0 ? a.data[r][aiTime] : r };
      }
    }
  }

  let firstTimeMismatchRow = -1;
  if (aiTime >= 0 && biTime >= 0) {
    for (let r = 0; r < minRows; r++) {
      const dt = Math.abs(a.data[r][aiTime] - b.data[r][biTime]);
      if (dt > 1e-10) {
        firstTimeMismatchRow = r;
        break;
      }
    }
  }

  const pass = maxAbs <= ABS_TOL || maxRel <= REL_TOL;

  return {
    rowA: a.data.length,
    rowB: b.data.length,
    commonCols: commonCols.length,
    maxAbs,
    maxRel,
    maxAbsAt,
    maxRelAt,
    firstTimeMismatchRow,
    pass,
  };
}

function parseNetCounts(netPath: string) {
  const txt = fs.readFileSync(netPath, 'utf8');
  const lines = txt.split(/\r?\n/);
  let inSpecies = false;
  let inRxn = false;
  let species = 0;
  let reactions = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^begin\s+species/i.test(line)) { inSpecies = true; continue; }
    if (/^end\s+species/i.test(line)) { inSpecies = false; continue; }
    if (/^begin\s+reactions/i.test(line)) { inRxn = true; continue; }
    if (/^end\s+reactions/i.test(line)) { inRxn = false; continue; }
    if (inSpecies && /^\d+\s+/.test(line)) species++;
    if (inRxn && /^\d+\s+/.test(line)) reactions++;
  }
  return { species, reactions };
}

async function run() {
  const out: any[] = [];

  for (const model of MODELS) {
    const bnglPath = path.join(ROOT, 'public', 'models', model.bngl);
    const webCsvPath = path.join(ROOT, 'web_output', `results_${model.id}.csv`);
    const refGdatPath = path.join(ROOT, model.refGdat);
    const refNetPath = path.join(ROOT, model.refNet);
    const refCdatPath = model.refCdat ? path.join(ROOT, model.refCdat) : null;

    const bngl = fs.readFileSync(bnglPath, 'utf8');
    const parsed = parseBNGL(bngl);
    const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});

    const netRef = fs.existsSync(refNetPath) ? parseNetCounts(refNetPath) : null;
    const netWeb = {
      species: expanded.species.length,
      reactions: expanded.reactions.length,
    };

    const webGdat = parseCsv(webCsvPath);
    const refGdat = parseDat(refGdatPath);
    const gdatDiff = compareTables(webGdat, refGdat);

    let cdatDiff: any = null;
    if (refCdatPath && fs.existsSync(refCdatPath)) {
      const opts = getSimulationOptionsFromParsedModel(expanded, 'default', {
        solver: 'cvode',
        includeSpeciesData: true,
      });
      const sim = await simulate(0, expanded, opts, { checkCancelled: () => {}, postMessage: () => {} });
      const speciesHeaders = sim.speciesHeaders ?? expanded.species.map((s) => s.name);
      const speciesRows = (sim.speciesData ?? []).map((row) => {
        const arr: number[] = [row.time as number];
        for (const h of speciesHeaders) arr.push((row as any)[h] ?? 0);
        return arr;
      });
      const webCdat = { headers: ['time', ...speciesHeaders], data: speciesRows };
      const refCdat = parseDat(refCdatPath);
      cdatDiff = compareTables(webCdat, refCdat);
    }

    out.push({
      model: model.id,
      net: {
        ref: netRef,
        web: netWeb,
        speciesDelta: netRef ? netWeb.species - netRef.species : null,
        reactionDelta: netRef ? netWeb.reactions - netRef.reactions : null,
      },
      gdat: gdatDiff,
      cdat: cdatDiff,
    });
  }

  const outPath = path.join(ROOT, 'artifacts', 'mismatch_artifact_diagnosis.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('wrote', outPath);
  for (const item of out) {
    console.log(`\n[${item.model}]`);
    console.log('  net:', item.net);
    console.log('  gdat:', { maxRel: item.gdat.maxRel, maxAbs: item.gdat.maxAbs, firstTimeMismatchRow: item.gdat.firstTimeMismatchRow, rowA: item.gdat.rowA, rowB: item.gdat.rowB });
    if (item.cdat) console.log('  cdat:', { maxRel: item.cdat.maxRel, maxAbs: item.cdat.maxAbs, firstTimeMismatchRow: item.cdat.firstTimeMismatchRow, rowA: item.cdat.rowA, rowB: item.cdat.rowB });
    else console.log('  cdat: (no reference)');
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
