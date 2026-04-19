/**
 * BinaryFormatReader.ts — parser for the MCell4 CELLBLENDER viz-output binary.
 *
 * Authoritative reference: https://mcell.org/mcell4_documentation/file_formats.html
 * (retrieved 2026, MCell4 docs v4.0.5)
 *
 * Format recap (V2):
 *
 *   Each file represents ONE simulation frame. Multiple frames live in
 *   separate files in a directory structure like:
 *
 *     ./viz_data/seed_00001/Scene.ascii.000.dat  (text mode)
 *     ./viz_data/seed_00001/Scene.cellbin.001.bin (binary)
 *
 *   V2 layout (all little-endian IEEE-754 single-precision floats; uint sizes
 *   as noted):
 *
 *   0x00  uint32   magic = 2 (V2) or 1 (V1)
 *   [ repeating species blocks until EOF ]:
 *     0x00  uint32 (V2) or uint8 (V1)  name_len
 *     next  bytes[name_len]             species name (no null terminator)
 *     next  uint8                        species_type: 0 = volume, 1 = surface
 *     next  uint32                        num_mols (V2) | num_float_positions (V1 = 3 * num_mols)
 *     next  uint32[num_mols]              molecule IDs (V2 ONLY)
 *     next  float32[3 * num_mols]         x, y, z triples (µm)
 *     next  float32[3 * num_mols] IF surface  nx, ny, nz triples
 *
 *   V1 differs in three places:
 *     - magic = 1
 *     - name_len is 1 byte
 *     - has no explicit ID block; "num_float_positions" = 3 * num_mols
 *
 *   Positions are in µm. Our internal SpatialSnapshot uses meters; we convert
 *   on the boundary (multiply by 1e-6).
 *
 * Reader contract:
 *   - Accepts ArrayBuffer OR a File/Blob (async arrayBuffer() lift).
 *   - Auto-detects V1 vs V2 from the magic byte.
 *   - Throws on malformed input with a message pointing to byte offset.
 *   - Ignores any trailing bytes after the last well-formed species block.
 *   - Returns meter-unit positions (converted from µm on read).
 */

import type { McellFrame, McellSpeciesBlock, McellTrajectory, McellVizVersion } from './types';

export class McellBinaryError extends Error {
  constructor(message: string, public readonly offset: number) {
    super(`McellBinaryError at byte ${offset}: ${message}`);
    this.name = 'McellBinaryError';
  }
}

export class McellBinaryReader {
  private view: DataView;
  private offset = 0;
  private readonly byteLength: number;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.byteLength = buffer.byteLength;
    if (this.byteLength < 4) {
      throw new McellBinaryError('file too short (< 4 bytes) to contain magic', 0);
    }
  }

  /** Parse the whole file as a single viz frame. */
  read(): McellFrame {
    const magic = this.u32();
    let version: McellVizVersion;
    if (magic === 2) version = 'v2';
    else if (magic === 1) version = 'v1';
    else throw new McellBinaryError(`invalid magic ${magic} (expected 1 or 2)`, 0);

    const species: McellSpeciesBlock[] = [];
    while (this.offset < this.byteLength) {
      const block = this.readSpeciesBlock(version);
      species.push(block);
    }

    return { version, species, time: null, iteration: null };
  }

  private readSpeciesBlock(version: McellVizVersion): McellSpeciesBlock {
    // name length
    const nameLen = version === 'v2' ? this.u32() : this.u8();
    if (nameLen === 0 || nameLen > 1024) {
      throw new McellBinaryError(
        `suspicious species name length: ${nameLen} (expected 1..1024)`,
        this.offset,
      );
    }

    const name = this.utf8(nameLen);
    if (this.offset >= this.byteLength) {
      throw new McellBinaryError('unexpected EOF after species name', this.offset);
    }

    const speciesType = this.u8();
    if (speciesType !== 0 && speciesType !== 1) {
      throw new McellBinaryError(
        `invalid species_type ${speciesType} (expected 0=volume or 1=surface)`,
        this.offset - 1,
      );
    }

    const rawCount = this.u32();
    const numMols = version === 'v2' ? rawCount : Math.floor(rawCount / 3);
    if (numMols < 0 || numMols > 100_000_000) {
      throw new McellBinaryError(`implausible num_mols ${numMols}`, this.offset - 4);
    }

    // IDs are only present in V2.
    const ids = new Uint32Array(numMols);
    if (version === 'v2') {
      this.requireBytes(numMols * 4, 'IDs block');
      for (let i = 0; i < numMols; i++) ids[i] = this.u32();
    } else {
      for (let i = 0; i < numMols; i++) ids[i] = i;  // synthetic IDs for V1
    }

    // Position block (3 * num_mols floats)
    const positions = new Float32Array(numMols * 3);
    this.requireBytes(numMols * 12, `positions block for ${name}`);
    for (let i = 0; i < numMols * 3; i++) positions[i] = this.f32();

    // Normals block (only for surface molecules)
    let normals: Float32Array | null = null;
    if (speciesType === 1) {
      normals = new Float32Array(numMols * 3);
      this.requireBytes(numMols * 12, `normals block for ${name}`);
      for (let i = 0; i < numMols * 3; i++) normals[i] = this.f32();
    }

    return {
      name,
      speciesType: speciesType === 0 ? 'volume' : 'surface',
      numMolecules: numMols,
      ids,
      positionsMeters: convertPositionsToMeters(positions),
      normals,
    };
  }

  // ── Primitive readers ──────────────────────────────────────────────────

  private u8(): number {
    this.requireBytes(1, 'u8');
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  private u32(): number {
    this.requireBytes(4, 'u32');
    const v = this.view.getUint32(this.offset, /* littleEndian */ true);
    this.offset += 4;
    return v;
  }

  private f32(): number {
    this.requireBytes(4, 'f32');
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  private utf8(len: number): string {
    this.requireBytes(len, `utf8 string of length ${len}`);
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len);
    this.offset += len;
    return new TextDecoder('utf-8').decode(bytes);
  }

  private requireBytes(n: number, what: string): void {
    if (this.offset + n > this.byteLength) {
      throw new McellBinaryError(
        `unexpected EOF reading ${what} (need ${n} bytes, have ${this.byteLength - this.offset})`,
        this.offset,
      );
    }
  }
}

// ── Public helpers ─────────────────────────────────────────────────────────

/** Read a single viz-frame file. */
export async function readMcellBinaryFrame(file: File | Blob | ArrayBuffer): Promise<McellFrame> {
  const buffer =
    file instanceof ArrayBuffer
      ? file
      : await (file as File | Blob).arrayBuffer();
  const frame = new McellBinaryReader(buffer).read();
  if (file instanceof File) {
    const { iteration, time } = inferIterationFromFilename(file.name);
    frame.iteration = iteration;
    frame.time = time;
  }
  return frame;
}

/**
 * Read a full trajectory from a list of files (one file per iteration).
 * Sorted by the iteration number parsed from the filename.
 */
export async function readMcellBinaryTrajectory(
  files: Array<File | Blob>,
  options?: { timeStepSec?: number; dropUnparseable?: boolean },
): Promise<McellTrajectory> {
  const frames: McellFrame[] = [];
  const warnings: string[] = [];
  const dt = options?.timeStepSec;

  for (const file of files) {
    try {
      const frame = await readMcellBinaryFrame(file);
      if (dt && frame.iteration !== null && frame.time === null) {
        frame.time = frame.iteration * dt;
      }
      frames.push(frame);
    } catch (e) {
      const msg = `${file instanceof File ? file.name : 'blob'}: ${String(e).split('\n')[0].slice(0, 200)}`;
      if (options?.dropUnparseable) {
        warnings.push(msg);
      } else {
        throw e;
      }
    }
  }

  frames.sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0));

  const speciesNames = new Set<string>();
  for (const f of frames) for (const s of f.species) speciesNames.add(s.name);

  return {
    frames,
    speciesNames: [...speciesNames].sort(),
    frameCount: frames.length,
    timeStepSec: dt,
    warnings,
  };
}

// ── Filename parsing ───────────────────────────────────────────────────────

/**
 * MCell4 writes iteration-indexed viz files, e.g.:
 *   Scene.cellbin.0000001.bin
 *   Scene.cellbin.100.bin
 *
 * We extract the iteration number by scanning for the LAST run of digits
 * before the extension. If no digits are found, returns null.
 */
function inferIterationFromFilename(name: string): { iteration: number | null; time: number | null } {
  const stem = name.replace(/\.(bin|dat|vizdat)$/i, '');
  const match = /(\d+)(?!.*\d)/.exec(stem);
  return {
    iteration: match ? Number(match[1]) : null,
    time: null,  // time is populated externally from the iteration + dt
  };
}

// ── Unit conversion ────────────────────────────────────────────────────────

const UM_TO_M = 1e-6;

function convertPositionsToMeters(umPositions: Float32Array): Float32Array {
  const out = new Float32Array(umPositions.length);
  for (let i = 0; i < umPositions.length; i++) out[i] = umPositions[i] * UM_TO_M;
  return out;
}
