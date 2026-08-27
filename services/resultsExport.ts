import JSZip from 'jszip';
import { gdatFromResults } from '@bngplayground/engine';
import type {
  SimulationOptions,
  SimulationResults,
} from '../types';
import type {
  SpatialSimulationConfig,
  SpatialSimulationResult,
  SpatialSnapshot,
} from '@bngplayground/engine';
import { toCsvTable } from '../src/utils/download';
import { exportFigure } from '../src/services/figure/FigureExporter';

export type ResultExportArtifactKind = 'data' | 'analysis' | 'figure' | 'model';

export interface ResultExportFormat {
  value: string;
  label: string;
}

export interface ResultExportFile {
  path: string;
  content: string | Uint8Array | Blob;
  mimeType: string;
  description?: string;
}

export interface ResultExportArtifact {
  id: string;
  label: string;
  kind: ResultExportArtifactKind;
  description?: string;
  formats: ResultExportFormat[];
  defaultFormat: string;
  selectedByDefault?: boolean;
  estimatedBytes?: number;
  available?: () => boolean;
  build: (format: string) => ResultExportFile[] | Promise<ResultExportFile[]>;
}

export interface ResultExportScope {
  description: string;
  artifacts: ResultExportArtifact[];
}

export interface ResultsExportDescriptor {
  analysisType: string;
  filenamePrefix: string;
  currentView?: ResultExportScope;
  fullResult?: ResultExportScope;
  settings?: Record<string, unknown>;
  largeExportWarning?: string;
}

export interface ResultExportSelection {
  artifact: ResultExportArtifact;
  format: string;
}

export interface BuiltResultExport {
  filename: string;
  blob: Blob;
  isBundle: boolean;
  files: ResultExportFile[];
  manifest?: Record<string, unknown>;
}

const FORBIDDEN_METADATA_KEYS = new Set([
  'seed',
  'rngseed',
  'randomseed',
  'version',
  'buildhash',
  'commit',
  'gitcommit',
  'browser',
  'environment',
  'fingerprint',
]);

const MIME_TYPES: Record<string, string> = {
  csv: 'text/csv',
  gdat: 'text/tab-separated-values',
  json: 'application/json',
  bngl: 'text/x-bngl',
  svg: 'image/svg+xml',
};

function sanitizeFilenamePart(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return sanitized || 'results';
}

function sanitizePath(value: string): string {
  const parts = value
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== '.' && part !== '..')
    .map((part) => part.replace(/[^a-z0-9._-]+/gi, '_'));
  return parts.join('/') || 'data/result';
}

function formatExtension(format: string): string {
  if (format === 'native') return 'zip';
  return format.replace(/[^a-z0-9]/gi, '') || 'dat';
}

function contentToBlob(content: ResultExportFile['content'], mimeType: string): Blob {
  if (content instanceof Blob) return content;
  if (typeof content === 'string') return new Blob([content], { type: mimeType });
  return new Blob([content as unknown as BlobPart], { type: mimeType });
}

function estimateContentBytes(content: ResultExportFile['content']): number {
  if (typeof content === 'string') return new TextEncoder().encode(content).byteLength;
  if (content instanceof Blob) return content.size;
  return content.byteLength;
}

function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeMetadata(item));
  if (!value || typeof value !== 'object') return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isForbidden = FORBIDDEN_METADATA_KEYS.has(normalizedKey)
      || normalizedKey.includes('version')
      || normalizedKey.includes('buildhash')
      || normalizedKey.includes('commit')
      || normalizedKey.includes('environment')
      || normalizedKey.includes('fingerprint')
      || normalizedKey.includes('randomseed');
    if (isForbidden) continue;
    sanitized[key] = sanitizeMetadata(nestedValue);
  }
  return sanitized;
}

export function timestampForFilename(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}

export function formatByteEstimate(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'an unknown size';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function createTextArtifact(config: {
  id: string;
  label: string;
  kind: ResultExportArtifactKind;
  description?: string;
  format: ResultExportFormat;
  path: string;
  mimeType?: string;
  selectedByDefault?: boolean;
  estimatedBytes?: number;
  available?: () => boolean;
  build: () => string | Uint8Array | Blob | Promise<string | Uint8Array | Blob>;
}): ResultExportArtifact {
  return {
    id: config.id,
    label: config.label,
    kind: config.kind,
    description: config.description,
    formats: [config.format],
    defaultFormat: config.format.value,
    selectedByDefault: config.selectedByDefault,
    estimatedBytes: config.estimatedBytes,
    available: config.available,
    build: async () => [{
      path: config.path,
      content: await config.build(),
      mimeType: config.mimeType ?? MIME_TYPES[config.format.value] ?? 'application/octet-stream',
      description: config.description,
    }],
  };
}

function normalizeBuiltFiles(files: ResultExportFile[]): ResultExportFile[] {
  const paths = new Set<string>();
  return files.map((file) => {
    const path = sanitizePath(file.path);
    if (paths.has(path)) throw new Error(`The export contains duplicate file path: ${path}`);
    paths.add(path);
    return { ...file, path };
  });
}

function buildReadme(
  analysisType: string,
  scope: 'current' | 'full',
  files: ResultExportFile[],
): string {
  const lines = [
    `# ${analysisType} export`,
    '',
    `This bundle contains the ${scope === 'full' ? 'complete successfully computed result' : 'current view'} from BNG Playground.`,
    'The numerical files are the primary scientific record; figures are presentation artifacts when included.',
    '',
    '## Files',
  ];

  for (const file of files) {
    lines.push(`- \`${file.path}\`${file.description ? `: ${file.description}` : ''}`);
  }

  lines.push('', '`manifest.json` records the export scope, included files, and relevant analysis settings.');
  return `${lines.join('\n')}\n`;
}

export async function buildResultExport(
  descriptor: ResultsExportDescriptor,
  scope: 'current' | 'full',
  selections: ResultExportSelection[],
): Promise<BuiltResultExport> {
  if (selections.length === 0) throw new Error('Select at least one item to export.');

  const files = normalizeBuiltFiles((await Promise.all(
    selections.map((selection) => selection.artifact.build(selection.format)),
  )).flat());

  if (files.length === 0) throw new Error('The selected export contains no data.');

  const now = new Date();
  const prefix = sanitizeFilenamePart(descriptor.filenamePrefix || descriptor.analysisType);
  const stamp = timestampForFilename(now);

  if (scope === 'current' && files.length === 1) {
    const file = files[0];
    const extension = formatExtension(selections[0].format);
    const filename = `${prefix}_${stamp}.${extension}`;
    return {
      filename,
      blob: contentToBlob(file.content, file.mimeType),
      isBundle: false,
      files,
    };
  }

  const root = `${prefix}_${stamp}`;
  const manifest: Record<string, unknown> = {
    analysisType: descriptor.analysisType,
    scope,
    exportedAt: now.toISOString(),
    artifacts: files.map((file) => ({
      path: file.path,
      description: file.description ?? '',
      sizeBytes: estimateContentBytes(file.content),
    })),
    settings: sanitizeMetadata(descriptor.settings ?? {}),
  };

  const zip = new JSZip();
  zip.file(`${root}/README.md`, buildReadme(descriptor.analysisType, scope, files));
  zip.file(`${root}/manifest.json`, JSON.stringify(manifest, null, 2));
  for (const file of files) {
    zip.file(`${root}/${file.path}`, file.content);
  }

  return {
    filename: `${root}.zip`,
    blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }),
    isBundle: true,
    files,
    manifest,
  };
}

export function downloadResultExport(result: BuiltResultExport): void {
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toSerializable(item, seen));
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries()).map(([key, nestedValue]) => [
      String(key),
      toSerializable(nestedValue, seen),
    ]));
  }
  if (value instanceof Set) return Array.from(value, (item) => toSerializable(item, seen));

  return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [
    key,
    toSerializable(nestedValue, seen),
  ]));
}

function stringifyStructured(value: unknown): string {
  return `${JSON.stringify(sanitizeMetadata(toSerializable(value)), null, 2) ?? 'null'}\n`;
}

export interface AnalysisTableExportInput {
  path: string;
  label: string;
  description: string;
  rows: Record<string, unknown>[];
  headers: string[];
  selectedByDefault?: boolean;
}

export interface StructuredAnalysisResultsExportInput {
  analysisType: string;
  filenamePrefix: string;
  result: unknown;
  resultFileName?: string;
  resultLabel?: string;
  resultDescription?: string;
  settings?: Record<string, unknown>;
  modelSource?: string | null;
  fullTable?: AnalysisTableExportInput;
  currentTable?: AnalysisTableExportInput;
  fullAdditionalArtifacts?: ResultExportArtifact[];
  currentAdditionalArtifacts?: ResultExportArtifact[];
  largeExportWarning?: string;
}

/**
 * Build the common export capabilities for completed numerical analyses whose
 * primary output is a structured object and, optionally, one or more tables.
 * Callers provide only scientific result objects and explicit tables; UI state
 * is never inferred or serialized by this helper.
 */
export function createStructuredAnalysisResultsExportDescriptor(
  input: StructuredAnalysisResultsExportInput,
): ResultsExportDescriptor {
  const resultFileName = sanitizeFilenamePart(input.resultFileName ?? 'result');
  const fullArtifacts: ResultExportArtifact[] = [
    createTextArtifact({
      id: 'analysis-result',
      label: input.resultLabel ?? 'Complete numerical result',
      kind: 'data',
      description: input.resultDescription ?? 'Structured numerical output retained by the completed analysis.',
      format: { value: 'json', label: 'JSON' },
      path: `data/${resultFileName}.json`,
      mimeType: MIME_TYPES.json,
      selectedByDefault: true,
      build: () => stringifyStructured(input.result),
    }),
  ];

  if (input.fullTable) {
    const table = input.fullTable;
    fullArtifacts.push(createTextArtifact({
      id: 'analysis-table',
      label: table.label,
      kind: 'data',
      description: table.description,
      format: { value: 'csv', label: 'CSV' },
      path: table.path,
      mimeType: MIME_TYPES.csv,
      selectedByDefault: table.selectedByDefault ?? true,
      estimatedBytes: table.rows.length * Math.max(1, table.headers.length) * 18,
      build: () => toCsvTable(table.rows, table.headers),
    }));
  }

  if (input.settings && Object.keys(input.settings).length > 0) {
    fullArtifacts.push(createTextArtifact({
      id: 'analysis-settings',
      label: 'Analysis settings',
      kind: 'analysis',
      description: 'User-controlled settings needed to interpret the numerical result.',
      format: { value: 'json', label: 'JSON' },
      path: 'analysis/settings.json',
      mimeType: MIME_TYPES.json,
      selectedByDefault: true,
      build: () => stringifyStructured(input.settings),
    }));
  }

  fullArtifacts.push(...(input.fullAdditionalArtifacts ?? []));

  const modelSource = input.modelSource;
  if (modelSource?.trim()) {
    fullArtifacts.push(createTextArtifact({
      id: 'model-snapshot',
      label: 'Model snapshot',
      kind: 'model',
      description: 'Exact BNGL text used when the analysis was executed.',
      format: { value: 'bngl', label: 'BNGL' },
      path: 'model.bngl',
      mimeType: MIME_TYPES.bngl,
      selectedByDefault: true,
      estimatedBytes: new TextEncoder().encode(modelSource).byteLength,
      build: () => modelSource,
    }));
  }

  const currentArtifacts: ResultExportArtifact[] = [];
  if (input.currentTable) {
    const table = input.currentTable;
    currentArtifacts.push(createTextArtifact({
      id: 'current-view-table',
      label: table.label,
      kind: 'data',
      description: table.description,
      format: { value: 'csv', label: 'CSV' },
      path: table.path,
      mimeType: MIME_TYPES.csv,
      selectedByDefault: true,
      estimatedBytes: table.rows.length * Math.max(1, table.headers.length) * 18,
      build: () => toCsvTable(table.rows, table.headers),
    }));
  }
  currentArtifacts.push(...(input.currentAdditionalArtifacts ?? []));

  return {
    analysisType: input.analysisType,
    filenamePrefix: input.filenamePrefix,
    currentView: {
      description: 'Export the currently selected or filtered analysis view.',
      artifacts: currentArtifacts,
    },
    fullResult: {
      description: 'Export all completed numerical output and meaningful derived analysis.',
      artifacts: fullArtifacts,
    },
    settings: input.settings ? { analysis: input.settings } : {},
    largeExportWarning: input.largeExportWarning,
  };
}

type SimulationSlice = {
  suffix: string;
  data: Record<string, number>[];
  speciesData?: Record<string, number>[];
};

function getSimulationSlices(results: SimulationResults): SimulationSlice[] {
  const suffixes = Object.keys(results.dataBySuffix ?? {});
  if (suffixes.length === 0) {
    return [{ suffix: '__default__', data: results.data, speciesData: results.speciesData }];
  }

  return suffixes.map((suffix) => ({
    suffix,
    data: results.dataBySuffix?.[suffix] ?? [],
    speciesData: results.speciesDataBySuffix?.[suffix],
  }));
}

function suffixFilename(suffix: string): string {
  return suffix === '__default__' ? '' : `_${sanitizeFilenamePart(suffix)}`;
}

function speciesRowsWithTime(
  rows: Record<string, number>[],
  timeRows: Record<string, number>[],
  headers: string[],
): Record<string, unknown>[] {
  return rows.map((row, index) => ({
    time: timeRows[index]?.time ?? index,
    ...Object.fromEntries(headers.filter((header) => header !== 'time').map((header) => [header, row[header]])),
  }));
}

export interface SimulationResultsExportInput {
  results: SimulationResults;
  modelSource?: string | null;
  simulationOptions?: SimulationOptions | null;
  currentRows?: Record<string, unknown>[];
  currentHeaders?: string[];
  currentFigureSvg?: () => string | null;
  analysisType?: string;
  filenamePrefix?: string;
}

/**
 * Build export capabilities for a standard simulation/time-course result.
 * Full data is generated lazily so large trajectories are not copied on every render.
 */
export function createSimulationResultsExportDescriptor(
  input: SimulationResultsExportInput,
): ResultsExportDescriptor {
  const { results } = input;
  const analysisType = input.analysisType ?? 'Time-course simulation';
  const currentRows = input.currentRows ?? results.data;
  const currentHeaders = input.currentHeaders ?? results.headers;
  const slices = getSimulationSlices(results);
  const fullRows = slices.reduce((sum, slice) => sum + slice.data.length, 0);
  const fullColumns = Math.max(1, results.headers.length);

  const fullDataArtifact: ResultExportArtifact = {
    id: 'simulation-data',
    label: 'Complete simulation data',
    kind: 'data',
    description: 'All observable trajectories, plus species-level tables when available.',
    formats: [{ value: 'native', label: 'GDAT + CSV tables' }],
    defaultFormat: 'native',
    selectedByDefault: true,
    estimatedBytes: fullRows * fullColumns * 18,
    build: async () => {
      const files: ResultExportFile[] = [];
      for (const slice of slices) {
        const suffix = suffixFilename(slice.suffix);
        files.push({
          path: `data/observables${suffix || ''}.gdat`,
          content: gdatFromResults({ headers: results.headers, data: slice.data }),
          mimeType: MIME_TYPES.gdat,
          description: `Observable trajectories for ${slice.suffix === '__default__' ? 'the default output' : `phase ${slice.suffix}`}.`,
        });

        if (slice.speciesData && results.speciesHeaders && results.speciesHeaders.length > 0) {
          const speciesRows = speciesRowsWithTime(slice.speciesData, slice.data, results.speciesHeaders);
          files.push({
            path: `data/species${suffix || ''}.csv`,
            content: toCsvTable(speciesRows, ['time', ...results.speciesHeaders.filter((header) => header !== 'time')]),
            mimeType: MIME_TYPES.csv,
            description: 'Species-level concentrations or counts linked to the observable time points.',
          });
        }
      }

      if (input.simulationOptions) {
        files.push({
          path: 'analysis/settings.json',
          content: JSON.stringify(sanitizeMetadata(input.simulationOptions), null, 2),
          mimeType: MIME_TYPES.json,
          description: 'User-controlled simulation settings; non-reproducibility metadata is intentionally omitted.',
        });
      }
      return files;
    },
  };

  const fullAnalysisFiles: ResultExportFile[] = [];
  if (results.firingLog && results.firingLog.length > 0) {
    fullAnalysisFiles.push({
      path: 'analysis/reaction-firing-log.csv',
      content: toCsvTable(results.firingLog as unknown as Record<string, unknown>[], ['time', 'reactionIndex', 'ruleName', 'propensity']),
      mimeType: MIME_TYPES.csv,
      description: 'Recorded reaction-firing events when the simulation produced them.',
    });
  }
  if (results.ssaInfluence) {
    fullAnalysisFiles.push({
      path: 'analysis/ssa-influence.json',
      content: JSON.stringify(sanitizeMetadata(results.ssaInfluence), null, 2),
      mimeType: MIME_TYPES.json,
      description: 'SSA influence summaries computed with the simulation.',
    });
  }
  if (results.expandedReactions || results.expandedSpecies) {
    fullAnalysisFiles.push({
      path: 'analysis/expanded-network.json',
      content: JSON.stringify(sanitizeMetadata({
        reactions: results.expandedReactions ?? [],
        species: results.expandedSpecies ?? [],
      }), null, 2),
      mimeType: MIME_TYPES.json,
      description: 'Concrete network objects retained by the completed simulation.',
    });
  }

  const artifacts: ResultExportArtifact[] = [fullDataArtifact];
  if (fullAnalysisFiles.length > 0) {
    artifacts.push({
      id: 'simulation-derived-analysis',
      label: 'Derived analysis and diagnostics',
      kind: 'analysis',
      description: 'Meaningful numerical diagnostics retained by the simulation.',
      formats: [{ value: 'native', label: 'CSV + JSON files' }],
      defaultFormat: 'native',
      selectedByDefault: true,
      estimatedBytes: fullAnalysisFiles.reduce((sum, file) => sum + estimateContentBytes(file.content), 0),
      build: () => fullAnalysisFiles,
    });
  }

  const modelSource = input.modelSource;
  if (modelSource?.trim()) {
    artifacts.push(createTextArtifact({
      id: 'model-snapshot',
      label: 'Model snapshot',
      kind: 'model',
      description: 'Exact BNGL text used when the simulation was executed.',
      format: { value: 'bngl', label: 'BNGL' },
      path: 'model.bngl',
      mimeType: MIME_TYPES.bngl,
      selectedByDefault: true,
      estimatedBytes: new TextEncoder().encode(modelSource).byteLength,
      build: () => modelSource,
    }));
  }

  const currentArtifacts: ResultExportArtifact[] = [];
  if (currentHeaders.length > 0 && currentRows.length > 0) {
    currentArtifacts.push({
      id: 'current-view-data',
      label: 'Data',
      kind: 'data',
      description: 'The currently selected output and visible series.',
      formats: [
        { value: 'csv', label: 'CSV' },
        { value: 'gdat', label: 'GDAT' },
      ],
      defaultFormat: 'csv',
      selectedByDefault: true,
      estimatedBytes: currentRows.length * Math.max(1, currentHeaders.length) * 18,
      build: (format) => {
        if (format === 'gdat') {
          return [{
            path: 'data/current-view.gdat',
            content: gdatFromResults({ headers: currentHeaders, data: currentRows as Record<string, number>[] }),
            mimeType: MIME_TYPES.gdat,
            description: 'Current-view observable trajectories in BioNetGen GDAT format.',
          }];
        }
        return [{
          path: 'data/current-view.csv',
          content: toCsvTable(currentRows, currentHeaders),
          mimeType: MIME_TYPES.csv,
          description: 'Current-view tabular data.',
        }];
      },
    });
  }

  if (input.currentFigureSvg) {
    currentArtifacts.push({
      id: 'current-view-figure',
      label: 'Figure',
      kind: 'figure',
      description: 'Rendered chart for the current view.',
      formats: [{ value: 'svg', label: 'SVG' }],
      defaultFormat: 'svg',
      selectedByDefault: true,
      available: () => Boolean(input.currentFigureSvg?.()),
      build: async () => {
        const svg = input.currentFigureSvg?.();
        if (!svg) throw new Error('The chart is not ready to export yet.');
        const figure = await exportFigure({ svg, format: 'svg', filename: 'current-view.svg' });
        return [{
          path: 'figures/current-view.svg',
          content: figure.blob,
          mimeType: figure.mimeType,
          description: 'Rendered current-view chart.',
        }];
      },
    });
  }

  return {
    analysisType,
    filenamePrefix: input.filenamePrefix ?? 'simulation-results',
    currentView: {
      description: 'Export only the output and figure currently selected in the chart.',
      artifacts: currentArtifacts,
    },
    fullResult: {
      description: 'Export every completed trajectory and retained scientific analysis, independent of chart filters.',
      artifacts,
    },
    settings: input.simulationOptions ? { simulation: input.simulationOptions as unknown as Record<string, unknown> } : {},
  };
}

export interface TrajectoryEmbeddingExport {
  coordinates: Array<[number, number] | undefined>;
  observableNames: string[];
  observableWeights?: Record<string, number>;
  normalization: string;
  selectionMode: string;
}

export interface TrajectoryResultsExportInput {
  runCount: number;
  getRun: (index: number) => SimulationResults;
  modelSource?: string | null;
  settings: Record<string, unknown>;
  selectedRunIndex?: number | null;
  embedding?: TrajectoryEmbeddingExport;
}

export function createTrajectoryResultsExportDescriptor(
  input: TrajectoryResultsExportInput,
): ResultsExportDescriptor {
  const runCount = Math.max(0, input.runCount);
  const fullData: ResultExportArtifact = {
    id: 'trajectory-runs',
    label: 'Complete trajectory ensemble',
    kind: 'data',
    description: `All ${runCount} completed runs as individual GDAT files.`,
    formats: [{ value: 'gdat', label: 'GDAT files' }],
    defaultFormat: 'gdat',
    selectedByDefault: true,
    estimatedBytes: runCount * 20_000,
    build: () => Array.from({ length: runCount }, (_, index) => ({
      path: `data/run_${String(index + 1).padStart(4, '0')}.gdat`,
      content: gdatFromResults(input.getRun(index)),
      mimeType: MIME_TYPES.gdat,
      description: `Observable trajectory for ensemble run ${index + 1}.`,
    })),
  };

  const embeddingIsAvailable = Boolean(
    input.embedding
    && input.embedding.coordinates.length === runCount
    && input.embedding.coordinates.every((coordinate) => coordinate !== undefined),
  );
  const fullArtifacts: ResultExportArtifact[] = [fullData];

  if (input.embedding) {
    fullArtifacts.push({
      id: 'trajectory-embedding',
      label: 'Derived trajectory embedding',
      kind: 'analysis',
      description: 'UMAP coordinates and the settings used to calculate them.',
      formats: [{ value: 'csv-json', label: 'CSV + JSON files' }],
      defaultFormat: 'csv-json',
      selectedByDefault: embeddingIsAvailable,
      available: () => embeddingIsAvailable,
      estimatedBytes: runCount * 48,
      build: () => {
        if (!embeddingIsAvailable || !input.embedding) throw new Error('The trajectory embedding is not available.');
        const coordinates = input.embedding.coordinates as Array<[number, number]>;
        return [
          {
            path: 'analysis/embedding.csv',
            content: toCsvTable(coordinates.map((coordinate, index) => ({ run: index + 1, x: coordinate[0], y: coordinate[1] })), ['run', 'x', 'y']),
            mimeType: MIME_TYPES.csv,
            description: 'Two-dimensional coordinate for each ensemble run.',
          },
          {
            path: 'analysis/embedding-settings.json',
            content: JSON.stringify(sanitizeMetadata({
              observableNames: input.embedding.observableNames,
              observableWeights: input.embedding.observableWeights,
              normalization: input.embedding.normalization,
              selectionMode: input.embedding.selectionMode,
            }), null, 2),
            mimeType: MIME_TYPES.json,
            description: 'Observable selection, weights, and normalization used for the embedding.',
          },
        ];
      },
    });
  }

  const modelSource = input.modelSource;
  if (modelSource?.trim()) {
    fullArtifacts.push(createTextArtifact({
      id: 'model-snapshot',
      label: 'Model snapshot',
      kind: 'model',
      description: 'Exact BNGL text used for the ensemble.',
      format: { value: 'bngl', label: 'BNGL' },
      path: 'model.bngl',
      mimeType: MIME_TYPES.bngl,
      selectedByDefault: true,
      estimatedBytes: new TextEncoder().encode(modelSource).byteLength,
      build: () => modelSource,
    }));
  }

  const selectedRun = input.selectedRunIndex;
  const currentArtifacts: ResultExportArtifact[] = [];
  if (selectedRun !== null && selectedRun !== undefined && selectedRun >= 0 && selectedRun < runCount) {
    currentArtifacts.push({
      id: 'selected-trajectory',
      label: 'Selected trajectory',
      kind: 'data',
      description: 'The trajectory selected in the cluster map.',
      formats: [{ value: 'gdat', label: 'GDAT' }, { value: 'csv', label: 'CSV' }],
      defaultFormat: 'gdat',
      selectedByDefault: true,
      build: (format) => {
        const run = input.getRun(selectedRun);
        if (format === 'csv') {
          return [{
            path: 'data/selected-trajectory.csv',
            content: toCsvTable(run.data, run.headers),
            mimeType: MIME_TYPES.csv,
            description: 'Selected observable trajectory as CSV.',
          }];
        }
        return [{
          path: 'data/selected-trajectory.gdat',
          content: gdatFromResults(run),
          mimeType: MIME_TYPES.gdat,
          description: 'Selected observable trajectory in BioNetGen GDAT format.',
        }];
      },
    });
  }
  if (embeddingIsAvailable) {
    currentArtifacts.push(fullArtifacts.find((artifact) => artifact.id === 'trajectory-embedding')!);
  }

  return {
    analysisType: 'Trajectory Explorer',
    filenamePrefix: 'trajectory-explorer',
    currentView: {
      description: 'Export the selected trajectory or the currently computed embedding.',
      artifacts: currentArtifacts,
    },
    fullResult: {
      description: 'Export every completed trajectory and the derived embedding settings.',
      artifacts: fullArtifacts,
    },
    settings: { ensemble: sanitizeMetadata(input.settings) as Record<string, unknown> },
    largeExportWarning: runCount >= 100
      ? `This export contains ${runCount} trajectories and may be large. The complete export keeps one GDAT file per run.`
      : undefined,
  };
}

export interface SpatialResultsExportInput {
  result: SpatialSimulationResult;
  speciesNames: Map<number, string>;
  modelSource?: string | null;
  config?: Partial<SpatialSimulationConfig>;
  currentSnapshot?: SpatialSnapshot | null;
}

const SPATIAL_POSITION_STRIDE = 5;

function particleRowsFromSnapshots(
  snapshots: SpatialSnapshot[],
  speciesNames: Map<number, string>,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const snapshot of snapshots) {
    const positions = snapshot.positions;
    if (!positions) continue;
    for (let offset = 0; offset + SPATIAL_POSITION_STRIDE - 1 < positions.length; offset += SPATIAL_POSITION_STRIDE) {
      const speciesId = Math.round(positions[offset + 3]);
      rows.push({
        time: snapshot.time,
        species: speciesNames.get(speciesId) ?? `Species_${speciesId}`,
        x: positions[offset],
        y: positions[offset + 1],
        z: positions[offset + 2],
        compartment: Math.round(positions[offset + 4]),
      });
    }
  }
  return rows;
}

function spatialObservableRows(result: SpatialSimulationResult): Record<string, unknown>[] {
  const names = Object.keys(result.observables);
  return result.time.map((time, index) => ({
    time,
    ...Object.fromEntries(names.map((name) => [name, result.observables[name]?.[index] ?? 0])),
  }));
}

export function createSpatialResultsExportDescriptor(
  input: SpatialResultsExportInput,
): ResultsExportDescriptor {
  const snapshots = input.result.snapshots ?? [];
  const fullParticleRows = particleRowsFromSnapshots(snapshots, input.speciesNames);
  const fullObservableRows = spatialObservableRows(input.result);
  const currentSnapshot = input.currentSnapshot ?? snapshots[snapshots.length - 1] ?? null;
  const currentParticleRows = currentSnapshot
    ? particleRowsFromSnapshots([currentSnapshot], input.speciesNames)
    : [];
  const currentObservableRows = currentSnapshot
    ? [{ time: currentSnapshot.time, ...currentSnapshot.observables }]
    : fullObservableRows.slice(-1);

  const fullData: ResultExportArtifact = {
    id: 'spatial-data',
    label: 'Coordinates and observables',
    kind: 'data',
    description: 'Linked particle-coordinate and observable tables using the same output times.',
    formats: [{ value: 'csv-bundle', label: 'Linked CSV tables' }],
    defaultFormat: 'csv-bundle',
    selectedByDefault: true,
    estimatedBytes: fullParticleRows.length * 72 + fullObservableRows.length * Math.max(1, Object.keys(input.result.observables).length) * 18,
    build: () => [
      {
        path: 'data/particles.csv',
        content: toCsvTable(fullParticleRows, ['time', 'species', 'x', 'y', 'z', 'compartment']),
        mimeType: MIME_TYPES.csv,
        description: 'Long-form particle coordinates. Rows are linked to observables by time.',
      },
      {
        path: 'data/observables.csv',
        content: toCsvTable(fullObservableRows, ['time', ...Object.keys(input.result.observables)]),
        mimeType: MIME_TYPES.csv,
        description: 'Observable values for each output time.',
      },
    ],
  };

  const fullArtifacts: ResultExportArtifact[] = [fullData];
  if (input.result.statistics) {
    fullArtifacts.push(createTextArtifact({
      id: 'spatial-statistics',
      label: 'Replicate statistics',
      kind: 'analysis',
      description: 'Mean, standard deviation, and confidence intervals across spatial replicates.',
      format: { value: 'json', label: 'JSON' },
      path: 'analysis/replicate-statistics.json',
      mimeType: MIME_TYPES.json,
      selectedByDefault: true,
      build: () => JSON.stringify(sanitizeMetadata(input.result.statistics), null, 2),
    }));
  }

  const modelSource = input.modelSource;
  if (modelSource?.trim()) {
    fullArtifacts.push(createTextArtifact({
      id: 'model-snapshot',
      label: 'Model snapshot',
      kind: 'model',
      description: 'Exact BNGL text used for the spatial simulation.',
      format: { value: 'bngl', label: 'BNGL' },
      path: 'model.bngl',
      mimeType: MIME_TYPES.bngl,
      selectedByDefault: true,
      estimatedBytes: new TextEncoder().encode(modelSource).byteLength,
      build: () => modelSource,
    }));
  }

  const currentData: ResultExportArtifact = {
    id: 'spatial-current-view',
    label: 'Coordinates and observables',
    kind: 'data',
    description: 'The current spatial snapshot with its matching observable values.',
    formats: [{ value: 'csv-bundle', label: 'Linked CSV tables' }],
    defaultFormat: 'csv-bundle',
    selectedByDefault: true,
    available: () => currentParticleRows.length > 0 || currentObservableRows.length > 0,
    estimatedBytes: currentParticleRows.length * 72 + currentObservableRows.length * 64,
    build: () => [
      {
        path: 'data/particles.csv',
        content: toCsvTable(currentParticleRows, ['time', 'species', 'x', 'y', 'z', 'compartment']),
        mimeType: MIME_TYPES.csv,
        description: 'Particle coordinates for the current output snapshot.',
      },
      {
        path: 'data/observables.csv',
        content: toCsvTable(currentObservableRows, ['time', ...Object.keys(input.result.observables)]),
        mimeType: MIME_TYPES.csv,
        description: 'Observable values for the current output snapshot.',
      },
    ],
  };

  const estimatedBytes = fullData.estimatedBytes ?? 0;
  return {
    analysisType: 'Spatial simulation',
    filenamePrefix: 'spatial',
    currentView: {
      description: 'Export the current spatial snapshot with coordinates and observables together.',
      artifacts: [currentData],
    },
    fullResult: {
      description: 'Export all spatial snapshots as linked particle and observable tables.',
      artifacts: fullArtifacts,
    },
    settings: { spatial: sanitizeMetadata(input.config ?? {}) as Record<string, unknown> },
    largeExportWarning: estimatedBytes >= 25 * 1024 * 1024
      ? `This spatial export contains approximately ${formatByteEstimate(estimatedBytes)} of linked particle and observable data. No records will be silently dropped.`
      : undefined,
  };
}
