/**
 * types.ts — MCell4 CELLBLENDER viz-output reader types.
 *
 * Each file on disk is one frame. Each frame contains a sequence of species
 * blocks. All positions in the public interface are in meters (converted
 * from MCell's native µm by BinaryFormatReader).
 */

export type McellVizVersion = 'v1' | 'v2';

export interface McellSpeciesBlock {
  /** Species name as written by MCell4 (may include compartment suffix, e.g. "va@CP"). */
  name: string;
  /** Volume = 3D molecules; surface = molecules on a mesh with orientation normals. */
  speciesType: 'volume' | 'surface';
  /** Molecule count in this block. */
  numMolecules: number;
  /** Per-molecule IDs. For V1 files (which lack explicit IDs), filled with 0..N-1. */
  ids: Uint32Array;
  /** Positions [x0,y0,z0, x1,y1,z1, ...] in **meters**. */
  positionsMeters: Float32Array;
  /** Orientation normals [nx,ny,nz, ...] or null for volume molecules. */
  normals: Float32Array | null;
}

export interface McellFrame {
  version: McellVizVersion;
  species: McellSpeciesBlock[];
  /** Simulation time (seconds). Null when not yet resolved from filename + dt. */
  time: number | null;
  /** Iteration index parsed from filename, or null if unparseable. */
  iteration: number | null;
}

export interface McellTrajectory {
  frames: McellFrame[];
  /** Union of species names across all frames, sorted. */
  speciesNames: string[];
  frameCount: number;
  /** Time step in seconds, if known (MCell writes iterations, not times, per frame). */
  timeStepSec?: number;
  /** Non-fatal warnings from unparseable files (when dropUnparseable is enabled). */
  warnings: string[];
}
