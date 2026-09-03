import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { SimulationOptions, SimulationResults } from '../../types';
import type { SpatialSimulationResult } from '@bngplayground/engine';
import {
  buildResultExport,
  createSimulationResultsExportDescriptor,
  createSpatialResultsExportDescriptor,
  createTrajectoryResultsExportDescriptor,
} from '../../services/resultsExport';

async function readZipEntry(blob: Blob, name: string): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const entry = zip.file(name);
  if (!entry) throw new Error(`Missing ZIP entry: ${name}`);
  return entry.async('string');
}

describe('result export serialization', () => {
  it('keeps current-view filters separate from complete simulation data', async () => {
    const results: SimulationResults = {
      headers: ['time', 'A', 'B'],
      data: [
        { time: 0, A: 10, B: 2 },
        { time: 1, A: 5, B: 7 },
      ],
    };
    const options = {
      method: 'ode',
      t_end: 1,
      n_steps: 2,
      seed: 999888777,
      softwareVersion: 'must-not-export',
    } as SimulationOptions & Record<string, unknown>;
    const descriptor = createSimulationResultsExportDescriptor({
      results,
      modelSource: 'begin model\nend model\n',
      simulationOptions: options,
      currentHeaders: ['time', 'A'],
      currentRows: [{ time: 1, A: 5 }],
    });

    const currentArtifact = descriptor.currentView?.artifacts.find((artifact) => artifact.id === 'current-view-data');
    expect(currentArtifact).toBeDefined();
    const current = await buildResultExport(descriptor, 'current', [{
      artifact: currentArtifact!,
      format: 'csv',
    }]);
    expect(current.isBundle).toBe(false);
    expect(await current.blob.text()).toBe('time,A\n1.000000000000e+00,5');

    const fullSelections = descriptor.fullResult!.artifacts.map((artifact) => ({
      artifact,
      format: artifact.defaultFormat,
    }));
    const full = await buildResultExport(descriptor, 'full', fullSelections);
    expect(full.isBundle).toBe(true);

    const root = full.filename.replace(/\.zip$/, '');
    const observableGdat = await readZipEntry(full.blob, `${root}/data/observables.gdat`);
    expect(observableGdat).toContain('# time\tA\tB');
    expect(observableGdat).toContain('0\t10\t2');
    expect(observableGdat).toContain('1\t5\t7');
    expect(await readZipEntry(full.blob, `${root}/model.bngl`)).toBe('begin model\nend model\n');

    const manifestText = await readZipEntry(full.blob, `${root}/manifest.json`);
    expect(manifestText).not.toContain('999888777');
    expect(manifestText).not.toContain('"seed"');
    expect(manifestText).not.toContain('softwareVersion');
    expect(manifestText).not.toContain('environment');
    const settings = JSON.parse(await readZipEntry(full.blob, `${root}/analysis/settings.json`)) as Record<string, unknown>;
    expect(settings).toEqual({ method: 'ode', t_end: 1, n_steps: 2 });
  });

  it('exports trajectory runs individually and preserves completed embedding settings', async () => {
    const makeRun = (value: number): SimulationResults => ({
      headers: ['time', 'A'],
      data: [{ time: 0, A: value }, { time: 1, A: value + 1 }],
    });
    const descriptor = createTrajectoryResultsExportDescriptor({
      runCount: 2,
      getRun: (index) => makeRun(index * 10),
      modelSource: 'begin model\nend model',
      settings: { method: 'ssa', ensembleSize: 2, seed: 9 },
      selectedRunIndex: 1,
      embedding: {
        coordinates: [[0.1, 0.2], [0.3, 0.4]],
        observableNames: ['A'],
        observableWeights: { A: 1 },
        normalization: 'robust',
        selectionMode: 'custom',
      },
    });

    const fullData = descriptor.fullResult!.artifacts.find((artifact) => artifact.id === 'trajectory-runs');
    const embedding = descriptor.fullResult!.artifacts.find((artifact) => artifact.id === 'trajectory-embedding');
    expect(fullData).toBeDefined();
    expect(embedding).toBeDefined();
    const files = [
      ...(await fullData!.build('gdat')),
      ...(await embedding!.build('csv-json')),
    ];
    expect(files.map((file) => file.path)).toEqual([
      'data/run_0001.gdat',
      'data/run_0002.gdat',
      'analysis/embedding.csv',
      'analysis/embedding-settings.json',
    ]);
    expect(files[0].content).toContain('# time\tA');
    expect(files[1].content).toContain('10');
    expect(files[2].content).toContain('run,x,y');
    expect(files[3].content).not.toContain('seed');
  });

  it('keeps spatial particle coordinates linked to observable output times without fake IDs', async () => {
    const result: SpatialSimulationResult = {
      time: [0, 1],
      observables: { A: [2, 1] },
      finalSpeciesCounts: { A: 1 },
      perCompartmentCounts: {},
      snapshots: [
        {
          time: 0,
          moleculeCount: 1,
          positions: new Float32Array([1, 2, 3, 0, 4]),
          observables: { A: 2 },
        },
        {
          time: 1,
          moleculeCount: 1,
          positions: new Float32Array([5, 6, 7, 0, 4]),
          observables: { A: 1 },
        },
      ],
    };
    const descriptor = createSpatialResultsExportDescriptor({
      result,
      speciesNames: new Map([[0, 'A()']]),
      config: { dt: 0.1, seed: 13 },
      modelSource: 'begin model\nend model',
    });
    const dataArtifact = descriptor.fullResult!.artifacts.find((artifact) => artifact.id === 'spatial-data');
    expect(dataArtifact).toBeDefined();
    const files = await dataArtifact!.build('csv-bundle');
    const particles = String(files.find((file) => file.path === 'data/particles.csv')?.content);
    const observables = String(files.find((file) => file.path === 'data/observables.csv')?.content);
    expect(particles.split('\n')[0]).toBe('time,species,x,y,z,compartment');
    expect(particles).toContain('A()');
    expect(particles).toContain('1.000000000000e+00');
    expect(particles).not.toContain('particle_id');
    expect(observables.split('\n')[0]).toBe('time,A');
    expect(observables.split('\n')).toHaveLength(3);
  });
});
