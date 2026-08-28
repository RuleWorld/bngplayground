/**
 * SpatialConfig.ts — Configuration types for spatial simulation.
 *
 * All spatial parameters are embedded in the BNGL file as parameters
 * with the MCELL_ prefix (same convention as MCell4).
 */

/** Full configuration for a spatial simulation run */
export interface SpatialSimulationConfig {
  /** Time step in seconds (default: 1e-6 = 1 µs) */
  dt: number;

  /** End time in seconds */
  tEnd: number;

  /** Number of output snapshots to collect */
  nOutput: number;

  /** Random seed for reproducibility */
  seed: number;

  /** Geometry source: auto-generate from compartments or use custom meshes */
  geometry: 'auto' | CustomGeometry;

  /** Number of replicate simulations (for ensemble statistics) */
  nReplicates: number;

  /** Smoluchowski (exact) or Doi (approximate) reaction model */
  reactionModel: 'smoluchowski' | 'doi';

  /** Spatial partition grid cell size in µm (0 = auto-compute) */
  partitionCellSize: number;

  /** Enable periodic boundary conditions */
  periodic: boolean;

  /** Rendering frame interval: emit snapshot every N simulation steps */
  snapshotInterval: number;
}

/** Custom geometry specification */
export interface CustomGeometry {
  meshes: MeshDefinition[];
}

/** A triangulated mesh for a compartment boundary */
export interface MeshDefinition {
  /** Vertex coordinates: [[x,y,z], ...] in µm */
  vertices: number[][];
  /** Triangle face indices: [[v0,v1,v2], ...] */
  faces: number[][];
  /** Compartment name this mesh belongs to */
  compartment: string;
  /** Whether molecules can bind to this surface (2D compartment) */
  isSurface: boolean;
}

/** Molecule type with spatial properties */
export interface SpatialMoleculeType {
  /** libBNG species index */
  speciesIndex: number;
  /** Canonical BNGL name */
  name: string;
  /** Diffusion constant (cm²/s) */
  diffusionConstant: number;
  /** 2 = surface molecule, 3 = volume molecule */
  dimension: 2 | 3;
  /** Compartment ID (-1 if none) */
  compartmentId: number;
}

/** Compartment geometry (auto-generated or custom) */
export interface CompartmentGeometry {
  compartmentId: number;
  name: string;
  dimension: 2 | 3;
  /** µm³ for 3D, µm² for 2D */
  volume: number;
  parentId: number | null;
  shape: 'sphere' | 'box' | 'custom';
  /** Center of the compartment in µm */
  center: [number, number, number];
  /** Radius for sphere geometry, in µm */
  radius?: number;
  /** Half extents for box geometry [hx, hy, hz] in µm */
  halfExtents?: [number, number, number];
  /** Custom mesh vertices (Float32Array of [x,y,z,...]) */
  vertices?: Float32Array;
  /** Custom mesh faces (Uint32Array of [v0,v1,v2,...]) */
  faces?: Uint32Array;
}

/** A single molecule in the spatial simulation */
export interface SpatialMolecule {
  /** Unique molecule instance ID */
  id: number;
  /** libBNG species index */
  speciesId: number;
  /** Position in µm */
  x: number;
  y: number;
  z: number;
  /** Compartment ID */
  compartmentId: number;
}

/** Snapshot of simulation state at a point in time */
export interface SpatialSnapshot {
  /** Simulation time in seconds */
  time: number;
  /** Total number of active molecules */
  moleculeCount: number;
  /** Packed positions: Float32Array of [x,y,z,speciesId,compartmentId, ...] */
  positions?: Float32Array;
  /** Molecule instances (for MVP/debugging) */
  molecules?: SpatialMolecule[];
  /** Observable counts at this time */
  observables: Record<string, number>;
}

/** Result from a completed spatial simulation */
export interface SpatialSimulationResult {
  /** Time points in seconds */
  time: number[];
  /** Observable time series */
  observables: Record<string, number[]>;
  /** Final species counts */
  finalSpeciesCounts: Record<string, number>;
  /** Per-compartment observable counts (time series) */
  perCompartmentCounts: Record<string, Record<string, number[]>>;
  /** Statistics across replicates (if nReplicates > 1) */
  statistics?: {
    mean: Record<string, number[]>;
    std: Record<string, number[]>;
    ci95: Record<string, [number, number][]>;
  };
  /**
   * Completed spatial snapshots, including packed coordinates and species /
   * compartment identifiers. Coordinates are retained for scientific export;
   * the worker may still transfer live rendering snapshots independently.
   */
  snapshots?: SpatialSnapshot[];
}

/** Default spatial simulation configuration */
export const DEFAULT_SPATIAL_CONFIG: SpatialSimulationConfig = {
  dt: 1e-6,          // 1 µs
  tEnd: 1e-3,        // 1 ms
  nOutput: 100,
  seed: 1,
  geometry: 'auto',
  nReplicates: 1,
  reactionModel: 'smoluchowski',
  partitionCellSize: 0, // auto
  periodic: false,
  snapshotInterval: 10,
};

/**
 * Extract spatial parameters from BNGL parameters.
 * MCell4 convention: MCELL_DIFFUSION_CONSTANT_3D_<mol> or _2D_<mol>
 */
export function extractDiffusionConstants(
  parameters: Map<string, number>
): Map<string, { constant: number; dimension: 2 | 3 }> {
  const result = new Map<string, { constant: number; dimension: 2 | 3 }>();

  for (const [key, value] of parameters) {
    const match3d = key.match(/^MCELL_DIFFUSION_CONSTANT_3D_(.+)$/);
    if (match3d) {
      result.set(match3d[1], { constant: value, dimension: 3 });
      continue;
    }
    const match2d = key.match(/^MCELL_DIFFUSION_CONSTANT_2D_(.+)$/);
    if (match2d) {
      result.set(match2d[1], { constant: value, dimension: 2 });
    }
  }

  return result;
}
