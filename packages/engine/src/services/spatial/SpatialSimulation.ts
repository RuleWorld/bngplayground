/**
 * SpatialSimulation.ts — Main orchestrator for spatial Monte Carlo simulation.
 *
 * Runs in a Web Worker. Pure TypeScript implementation:
 * 1. ANTLR4 BNGL parser (BNG Playground's own parser)
 * 2. Brownian dynamics diffusion (TS)
 * 3. Spatial grid collision detection (TS)
 * 4. Rule-based reaction resolution (TS via species string matching)
 *
 * Algorithm: MCell4-compatible time-step-driven Brownian dynamics.
 * Each iteration: diffuse → rebuild grid → detect collisions → resolve reactions
 */

import { parseBNGLWithANTLR } from '../../parser/BNGLParserWrapper';
import type { BNGLModel, BNGLCompartment } from '../../types';
import type {
  SpatialSimulationConfig,
  SpatialSimulationResult,
  SpatialSnapshot,
  SpatialMoleculeType,
  CompartmentGeometry,
} from './SpatialConfig';
import { DEFAULT_SPATIAL_CONFIG } from './SpatialConfig';
import { autoGenerateGeometry } from './SpatialGeometry';
import type { ParsedCompartment } from './SpatialGeometry';

interface SpatialReaction {
  reactants: string[];
  products: string[];
  rate: number;
  degeneracy: number;
  isBidirectional: boolean;
}

export class SpatialSimulation {
  private config: SpatialSimulationConfig;
  private rng: Xoshiro256StarStar;
  private model: BNGLModel | null = null;

  private molecules: ActiveMolecule[] = [];
  private nextMoleculeId = 0;
  private currentTime = 0;
  private stepCount = 0;

  private geometries: CompartmentGeometry[] = [];
  private geometryMap: Map<number, CompartmentGeometry> = new Map();
  private moleculeTypes: Map<number, SpatialMoleculeType> = new Map();
  private speciesNames: Map<number, string> = new Map();
  private compartmentMap: Map<string, number> = new Map();

  private bimolReactions: Map<string, SpatialReaction[]> = new Map();
  private unimolReactions: Map<number, SpatialReaction[]> = new Map();

  private timePoints: number[] = [];
  private observableTimeSeries: Map<string, number[]> = new Map();
  private perCompartmentTimeSeries: Record<string, Record<string, number>>[] = [];

  private gridCellSize = 0;
  private grid: Map<string, number[]> = new Map();

  constructor(config?: Partial<SpatialSimulationConfig>) {
    this.config = { ...DEFAULT_SPATIAL_CONFIG, ...config };
    this.rng = new Xoshiro256StarStar(this.config.seed);
  }

  async initialize(bnglText: string): Promise<void> {
    console.log('[SpatialSimulation] Starting initialization...');

    const parseResult = parseBNGLWithANTLR(bnglText);
    if (!parseResult.success || !parseResult.model) {
      throw new Error(`BNGL parse failed: ${parseResult.errors.map(e => e.message).join(', ')}`);
    }
    this.model = parseResult.model;
    console.log('[SpatialSimulation] Parsed model:', this.model.name);

    const compartments: ParsedCompartment[] = (this.model.compartments ?? []).map((c: BNGLCompartment, idx: number) => {
      this.compartmentMap.set(c.name, idx);
      return {
        name: c.name,
        dimension: c.dimension === 3 ? 3 as const : 2 as const,
        size: c.size,
        parent: c.parent,
      };
    });

    if (this.config.geometry === 'auto') {
      this.geometries = autoGenerateGeometry(compartments);
    }

    this.geometryMap.clear();
    for (const geom of this.geometries) {
      this.geometryMap.set(geom.compartmentId, geom);
    }

    this.buildSpeciesIndex();
    this.buildMoleculeTypes();
    this.buildReactionTable();

    this.setupGrid();
    this.releaseSeedSpecies();

    console.log('[SpatialSimulation] Initialization complete. Molecules:', this.molecules.length);
  }

  private buildSpeciesIndex(): void {
    if (!this.model) return;
    let idx = 0;
    for (const sp of this.model.species) {
      this.speciesNames.set(idx, sp.name);
      idx++;
    }
    console.log('[SpatialSimulation] Species index built:', this.speciesNames.size, 'species');
  }

  private buildMoleculeTypes(): void {
    if (!this.model) return;

    for (const [idx, name] of this.speciesNames) {
      const molTypeName = name.replace(/\(.*\)/, '').trim();

      const dcParam3D = `MCELL_DIFFUSION_CONSTANT_3D_${molTypeName}`;
      const dcParam2D = `MCELL_DIFFUSION_CONSTANT_2D_${molTypeName}`;
      const dc3d = this.model.parameters[dcParam3D];
      const dc2d = this.model.parameters[dcParam2D];
      const dc = dc3d ?? dc2d ?? 1e-6;
      const dim = dc2d != null ? 2 as const : 3 as const;

      let compartmentId = 0;
      const match = name.match(/@(\w+)$/);
      if (match) {
        compartmentId = this.compartmentMap.get(match[1]) ?? 0;
      }

      this.moleculeTypes.set(idx, {
        speciesIndex: idx,
        name,
        diffusionConstant: dc,
        dimension: dim,
        compartmentId,
      });
      console.log(`[SpatialSimulation] MolType[${idx}] ${name}: D=${dc} cm²/s, dim=${dim}`);
    }
  }

  private buildReactionTable(): void {
    if (!this.model) return;

    for (const rule of this.model.reactionRules ?? []) {
      if (rule.reactants.length === 1 && rule.products.length === 1) {
        const sid = this.findSpeciesIndex(rule.reactants[0]);
        if (sid === null) continue;
        if (!this.unimolReactions.has(sid)) {
          this.unimolReactions.set(sid, []);
        }
        this.unimolReactions.get(sid)!.push({
          reactants: rule.reactants,
          products: rule.products,
          rate: this.evaluateRate(rule.rate),
          degeneracy: 1,
          isBidirectional: rule.isBidirectional,
        });
      } else if (rule.reactants.length === 2) {
        const sidA = this.findSpeciesIndex(rule.reactants[0]);
        const sidB = this.findSpeciesIndex(rule.reactants[1]);
        if (sidA === null || sidB === null) continue;
        const key = sidA <= sidB ? `${sidA}:${sidB}` : `${sidB}:${sidA}`;
        if (!this.bimolReactions.has(key)) {
          this.bimolReactions.set(key, []);
        }
        this.bimolReactions.get(key)!.push({
          reactants: rule.reactants,
          products: rule.products,
          rate: this.evaluateRate(rule.rate),
          degeneracy: 1,
          isBidirectional: rule.isBidirectional,
        });
        if (rule.isBidirectional) {
          const revKey = `${sidA}:${sidB}`;
          if (!this.bimolReactions.has(revKey)) {
            this.bimolReactions.set(revKey, []);
          }
          this.bimolReactions.get(revKey)!.push({
            reactants: rule.reactants,
            products: rule.products,
            rate: this.evaluateRate(rule.reverseRate ?? '0'),
            degeneracy: 1,
            isBidirectional: false,
          });
        }
      }
    }

    const bimolCount = Array.from(this.bimolReactions.values()).reduce((s, v) => s + v.length, 0);
    const unimolCount = Array.from(this.unimolReactions.values()).reduce((s, v) => s + v.length, 0);
    console.log(`[SpatialSimulation] Reactions: ${bimolCount} bimolecular (${this.bimolReactions.size} pairs), ${unimolCount} unimolecular`);
  }

  private findSpeciesIndex(pattern: string): number | null {
    if (!this.model) return null;
    const baseName = pattern.replace(/@.*$/, '').replace(/[~*?].*/g, '');
    for (const [idx, name] of this.speciesNames) {
      const specBase = name.replace(/@.*$/, '').replace(/[~*?].*/g, '');
      if (specBase === baseName) return idx;
    }
    return null;
  }

  private evaluateRate(rateStr: string): number {
    if (!this.model) return 0;
    if (!rateStr || rateStr === '0') return 0;
    const val = parseFloat(rateStr);
    if (!isNaN(val)) return val;
    return this.model.parameters[rateStr] ?? 0;
  }

  private setupGrid(): void {
    this.gridCellSize = this.config.partitionCellSize > 0
      ? this.config.partitionCellSize
      : 1.0;
  }

  private releaseSeedSpecies(): void {
    if (!this.model) return;

    for (const [idx, name] of this.speciesNames) {
      const spec = this.model.species[idx];
      if (!spec) continue;
      const amount = Math.round(spec.initialConcentration);
      if (amount <= 0) continue;

      let compartmentId = 0;
      const match = name.match(/@(\w+)$/);
      if (match) {
        compartmentId = this.compartmentMap.get(match[1]) ?? 0;
      }

      const geom = this.geometryMap.get(compartmentId) ?? this.geometries[0];

      for (let j = 0; j < amount; j++) {
        const pos = this.randomPositionInGeometry(geom);
        this.molecules.push({
          id: this.nextMoleculeId++,
          speciesId: idx,
          x: pos[0],
          y: pos[1],
          z: pos[2],
          compartmentId,
        });
      }
      console.log(`[SpatialSimulation] Released ${amount} molecules of ${name}`);
    }
  }

  private randomPositionInGeometry(geom: CompartmentGeometry): [number, number, number] {
    if (geom.shape === 'box' && geom.halfExtents) {
      const [hx, hy, hz] = geom.halfExtents;
      const [cx, cy, cz] = geom.center;
      return [
        cx + (this.rng.random() * 2 - 1) * hx,
        cy + (this.rng.random() * 2 - 1) * hy,
        cz + (this.rng.random() * 2 - 1) * hz,
      ];
    } else if (geom.shape === 'sphere' && geom.radius) {
      const [cx, cy, cz] = geom.center;
      const r = geom.radius;
      while (true) {
        const x = (this.rng.random() * 2 - 1) * r;
        const y = (this.rng.random() * 2 - 1) * r;
        const z = (this.rng.random() * 2 - 1) * r;
        if (x * x + y * y + z * z <= r * r) {
          return [cx + x, cy + y, cz + z];
        }
      }
    }
    return [...geom.center];
  }

  async run(
    onSnapshot?: (snapshot: SpatialSnapshot) => void,
    onProgress?: (step: number, totalSteps: number, time: number) => void
  ): Promise<SpatialSimulationResult> {
    const totalSteps = Math.ceil(this.config.tEnd / this.config.dt);
    const outputInterval = Math.max(1, Math.floor(totalSteps / this.config.nOutput));

    for (let step = 0; step < totalSteps; step++) {
      this.advanceStep();

      if (step % outputInterval === 0) {
        const snap = this.getSnapshot();
        this.recordObservables(snap);
        if (onSnapshot) onSnapshot(snap);
        if (onProgress) {
          onProgress(step + 1, totalSteps, this.currentTime);
        }
      }
    }

    const finalSnap = this.getSnapshot();
    this.recordObservables(finalSnap);
    if (onProgress) {
      onProgress(totalSteps, totalSteps, this.currentTime);
    }
    return this.buildResult();
  }

  private advanceStep(): void {
    this.diffuseAll(this.config.dt);
    this.rebuildGrid();
    this.resolveCollisions(this.config.dt);
    this.resolveUnimolecular(this.config.dt);
    this.currentTime += this.config.dt;
    this.stepCount++;
  }

  private diffuseAll(dt: number): void {
    for (const mol of this.molecules) {
      const molType = this.moleculeTypes.get(mol.speciesId);
      if (!molType || molType.diffusionConstant === 0) continue;

      const D = molType.diffusionConstant;
      const D_um = D * 1e8;
      const sigma = Math.sqrt(2 * D_um * dt);

      mol.x += this.rng.gaussian() * sigma;
      mol.y += this.rng.gaussian() * sigma;
      mol.z += this.rng.gaussian() * sigma;

      this.reflectBoundary(mol);
    }
  }

  private reflectBoundary(mol: ActiveMolecule): void {
    const geom = this.geometryMap.get(mol.compartmentId === -1 ? 0 : mol.compartmentId) ?? this.geometries[0];
    if (!geom) return;

    if (geom.shape === 'box' && geom.halfExtents) {
      const [hx, hy, hz] = geom.halfExtents;
      const [cx, cy, cz] = geom.center;
      mol.x = reflectCoord(mol.x, cx - hx, cx + hx);
      mol.y = reflectCoord(mol.y, cy - hy, cy + hy);
      mol.z = reflectCoord(mol.z, cz - hz, cz + hz);
    } else if (geom.shape === 'sphere' && geom.radius) {
      const [cx, cy, cz] = geom.center;
      const dx = mol.x - cx;
      const dy = mol.y - cy;
      const dz = mol.z - cz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > geom.radius) {
        const scale = (2 * geom.radius - dist) / dist;
        mol.x = cx + dx * scale;
        mol.y = cy + dy * scale;
        mol.z = cz + dz * scale;
      }
    }
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.molecules.length; i++) {
      const mol = this.molecules[i];
      const key = `${Math.floor(mol.x / this.gridCellSize)},${Math.floor(mol.y / this.gridCellSize)},${Math.floor(mol.z / this.gridCellSize)}`;
      let cell = this.grid.get(key);
      if (!cell) {
        cell = [];
        this.grid.set(key, cell);
      }
      cell.push(i);
    }
  }

  private resolveCollisions(dt: number): void {
    const rxnRadius = 0.01;
    const rxnRadiusSq = rxnRadius * rxnRadius;
    const toRemove = new Set<number>();
    const toAdd: ActiveMolecule[] = [];

    for (const [_key, indices] of this.grid) {
      for (let i = 0; i < indices.length; i++) {
        if (toRemove.has(indices[i])) continue;
        const molA = this.molecules[indices[i]];

        for (let j = i + 1; j < indices.length; j++) {
          if (toRemove.has(indices[j])) continue;
          const molB = this.molecules[indices[j]];

          const dx = molA.x - molB.x;
          const dy = molA.y - molB.y;
          const dz = molA.z - molB.z;
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq > rxnRadiusSq) continue;

          const key = molA.speciesId <= molB.speciesId
            ? `${molA.speciesId}:${molB.speciesId}`
            : `${molB.speciesId}:${molA.speciesId}`;
          const reactions = this.bimolReactions.get(key);
          if (!reactions) continue;

          for (const rxn of reactions) {
            const k = rxn.rate;
            const p = 1 - Math.exp(-k * dt);
            if (this.rng.random() < p) {
              toRemove.add(indices[i]);
              toRemove.add(indices[j]);

              const mx = (molA.x + molB.x) / 2;
              const my = (molA.y + molB.y) / 2;
              const mz = (molA.z + molB.z) / 2;

              for (const prodPat of rxn.products) {
                const pid = this.findSpeciesIndex(prodPat);
                if (pid !== null) {
                  toAdd.push({
                    id: this.nextMoleculeId++,
                    speciesId: pid,
                    x: mx + this.rng.gaussian() * 0.01,
                    y: my + this.rng.gaussian() * 0.01,
                    z: mz + this.rng.gaussian() * 0.01,
                    compartmentId: molA.compartmentId,
                  });
                }
              }
              break;
            }
          }
        }
      }
    }

    if (toRemove.size > 0) {
      this.molecules = this.molecules.filter((_, i) => !toRemove.has(i));
    }
    this.molecules.push(...toAdd);
  }

  private resolveUnimolecular(dt: number): void {
    const toRemove: number[] = [];
    const toAdd: ActiveMolecule[] = [];

    for (let i = 0; i < this.molecules.length; i++) {
      const mol = this.molecules[i];
      const reactions = this.unimolReactions.get(mol.speciesId);
      if (!reactions) continue;

      for (const rxn of reactions) {
        const k = rxn.rate;
        const p = 1 - Math.exp(-k * dt);
        if (this.rng.random() < p) {
          toRemove.push(i);
          for (const prodPat of rxn.products) {
            const pid = this.findSpeciesIndex(prodPat);
            if (pid !== null) {
              toAdd.push({
                id: this.nextMoleculeId++,
                speciesId: pid,
                x: mol.x + this.rng.gaussian() * 0.01,
                y: mol.y + this.rng.gaussian() * 0.01,
                z: mol.z + this.rng.gaussian() * 0.01,
                compartmentId: mol.compartmentId,
              });
            }
          }
          break;
        }
      }
    }

    if (toRemove.length > 0) {
      const removeSet = new Set(toRemove.sort((a, b) => b - a));
      this.molecules = this.molecules.filter((_, i) => !removeSet.has(i));
    }
    this.molecules.push(...toAdd);
  }

  public getSnapshot(): SpatialSnapshot {
    const count = this.molecules.length;
    const floatsPerMolecule = 5;
    const positions = new Float32Array(count * floatsPerMolecule);

    for (let i = 0; i < count; i++) {
      const mol = this.molecules[i];
      positions[i * floatsPerMolecule] = mol.x;
      positions[i * floatsPerMolecule + 1] = mol.y;
      positions[i * floatsPerMolecule + 2] = mol.z;
      positions[i * floatsPerMolecule + 3] = mol.speciesId;
      positions[i * floatsPerMolecule + 4] = mol.compartmentId;
    }

    const { global, perCompartment } = this.calculateObservables(positions);
    this.perCompartmentTimeSeries.push(perCompartment);

    return {
      time: this.currentTime,
      moleculeCount: count,
      positions,
      observables: global,
    };
  }

  private calculateObservables(positions: Float32Array): {
    global: Record<string, number>;
    perCompartment: Record<string, Record<string, number>>;
  } {
    const global: Record<string, number> = {};
    const perCompartment: Record<string, Record<string, number>> = {};
    const floatsPerMolecule = 5;
    const speciesCounts = new Map<number, number>();
    const compSpeciesCounts = new Map<number, Map<number, number>>();

    for (let i = 0; i < positions.length / floatsPerMolecule; i++) {
      const speciesId = positions[i * floatsPerMolecule + 3];
      const compartmentId = positions[i * floatsPerMolecule + 4];
      speciesCounts.set(speciesId, (speciesCounts.get(speciesId) ?? 0) + 1);
      if (!compSpeciesCounts.has(compartmentId)) {
        compSpeciesCounts.set(compartmentId, new Map());
      }
      compSpeciesCounts.get(compartmentId)!.set(speciesId, (compSpeciesCounts.get(compartmentId)!.get(speciesId) ?? 0) + 1);
    }

    for (const [sid, count] of speciesCounts) {
      const name = this.speciesNames.get(sid) ?? `Species_${sid}`;
      global[name] = count;
    }

    for (const [compId, sMap] of compSpeciesCounts) {
      const compName = this.geometries[compId]?.name ?? `Compartment_${compId}`;
      perCompartment[compName] = {};
      for (const [sid, count] of sMap) {
        const name = this.speciesNames.get(sid) ?? `Species_${sid}`;
        perCompartment[compName][name] = count;
      }
    }

    return { global, perCompartment };
  }

  private recordObservables(snapshot: SpatialSnapshot): void {
    this.timePoints.push(snapshot.time);
    for (const [name, count] of Object.entries(snapshot.observables)) {
      if (!this.observableTimeSeries.has(name)) {
        this.observableTimeSeries.set(name, []);
      }
      this.observableTimeSeries.get(name)!.push(count);
    }
  }

  private buildResult(): SpatialSimulationResult {
    const observables: Record<string, number[]> = {};
    for (const [name, series] of this.observableTimeSeries) {
      observables[name] = series;
    }

    const finalSpeciesCounts: Record<string, number> = {};
    for (const [name, series] of this.observableTimeSeries) {
      finalSpeciesCounts[name] = series[series.length - 1] ?? 0;
    }

    const perCompartmentResults: Record<string, Record<string, number[]>> = {};
    if (this.perCompartmentTimeSeries.length > 0) {
      const compartmentNames = Object.keys(this.perCompartmentTimeSeries[0]);
      for (const cName of compartmentNames) {
        perCompartmentResults[cName] = {};
        const firstEntry = this.perCompartmentTimeSeries[0][cName];
        for (const obsName of Object.keys(firstEntry)) {
          perCompartmentResults[cName][obsName] = this.perCompartmentTimeSeries.map(t => t[cName]?.[obsName] ?? 0);
        }
      }
    }

    return {
      time: this.timePoints,
      observables,
      finalSpeciesCounts,
      perCompartmentCounts: perCompartmentResults,
    };
  }

  getGeometries(): CompartmentGeometry[] {
    return this.geometries;
  }

  getSpeciesNames(): Map<number, string> {
    return this.speciesNames;
  }

  destroy(): void {
    this.model = null;
    this.molecules = [];
  }
}

function reflectCoord(x: number, min: number, max: number): number {
  let val = x;
  while (val < min || val > max) {
    if (val < min) val = 2 * min - val;
    if (val > max) val = 2 * max - val;
  }
  return val;
}

class Xoshiro256StarStar {
  private s: BigUint64Array;

  constructor(seed: number) {
    this.s = new BigUint64Array(4);
    let s = BigInt(seed);
    for (let i = 0; i < 4; i++) {
      s += 0x9e3779b97f4a7c15n;
      let z = s;
      z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n;
      z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn;
      z = z ^ (z >> 31n);
      this.s[i] = z & 0xFFFFFFFFFFFFFFFFn;
    }
  }

  random(): number {
    const result = this.rotl(this.s[1] * 5n, 7n) * 9n;
    const t = this.s[1] << 17n;
    this.s[2] ^= this.s[0];
    this.s[3] ^= this.s[1];
    this.s[1] ^= this.s[2];
    this.s[0] ^= this.s[3];
    this.s[2] ^= t;
    this.s[3] = this.rotl(this.s[3], 45n);
    return Number((result >> 11n) & 0x1FFFFFFFFFFFFFn) / Number(0x20000000000000n);
  }

  gaussian(): number {
    const u1 = this.random();
    const u2 = this.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  private rotl(x: bigint, k: bigint): bigint {
    return ((x << k) | (x >> (64n - k))) & 0xFFFFFFFFFFFFFFFFn;
  }
}

interface ActiveMolecule {
  id: number;
  speciesId: number;
  x: number;
  y: number;
  z: number;
  compartmentId: number;
}
