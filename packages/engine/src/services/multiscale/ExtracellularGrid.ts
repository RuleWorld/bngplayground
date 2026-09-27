// ---------------------------------------------------------------------------
// ExtracellularGrid.ts – Dimension-aware PDE solver for extracellular diffusion
// ---------------------------------------------------------------------------

export interface ExtracellularGridConfig {
  dimensions?: 2 | 3;
  domainSize: [number, number, number] | [number, number];
  resolution: [number, number, number] | [number, number];
  species: Array<{
    name: string;
    diffusionConstant: number;
    degradationRate: number;
    initialConcentration: number;
  }>;
  boundaryCondition: 'neumann' | 'dirichlet' | 'periodic';
}

export class ExtracellularGrid {
  readonly dimensions: 2 | 3;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly boundaryCondition: 'neumann' | 'dirichlet' | 'periodic';

  private grids: Map<string, Float64Array>;
  private gridTemp: Map<string, Float64Array>;
  private sourceFields: Map<string, Float64Array>;
  private sinkFields: Map<string, Float64Array>;
  private activeSourceIndices: Map<string, number[]>;
  private activeSinkIndices: Map<string, number[]>;
  private species: ExtracellularGridConfig['species'];
  private totalVoxels: number;

  constructor(config: ExtracellularGridConfig) {
    if (!config || typeof config !== 'object') {
      throw new Error('ExtracellularGridConfig must be a valid object');
    }

    const res = config.resolution;
    const size = config.domainSize;

    if (!Array.isArray(res) || res.length < 2 || !Array.isArray(size) || size.length < 2) {
      throw new Error('ExtracellularGrid domainSize and resolution must have at least 2 dimensions');
    }

    if (res[0] <= 0 || res[1] <= 0 || (res.length > 2 && (res[2] ?? 0) <= 0)) {
      throw new Error('ExtracellularGrid resolution must have positive integers');
    }
    if (size[0] <= 0 || size[1] <= 0 || (size.length > 2 && (size[2] ?? 0) <= 0)) {
      throw new Error('ExtracellularGrid domainSize must have positive dimensions');
    }

    // Determine dimensions: explicit, or inferred from resolution/domainSize
    const resZ = res[2] ?? 1;
    if (config.dimensions === 2 || config.dimensions === 3) {
      this.dimensions = config.dimensions;
    } else if (res.length === 2 || resZ === 1) {
      this.dimensions = 2;
    } else {
      this.dimensions = 3;
    }

    this.nx = Math.max(1, Math.floor(res[0]));
    this.ny = Math.max(1, Math.floor(res[1]));
    this.nz = this.dimensions === 2 ? 1 : Math.max(1, Math.floor(res[2] ?? 1));

    this.dx = size[0] / this.nx;
    this.dy = size[1] / this.ny;
    this.dz = this.dimensions === 2 ? 1.0 : (size[2] ?? 1.0) / this.nz;

    this.boundaryCondition = config.boundaryCondition ?? 'neumann';
    this.species = config.species ?? [];
    this.totalVoxels = this.nx * this.ny * this.nz;

    this.grids = new Map();
    this.gridTemp = new Map();
    this.sourceFields = new Map();
    this.sinkFields = new Map();
    this.activeSourceIndices = new Map();
    this.activeSinkIndices = new Map();

    for (const sp of this.species) {
      if (sp.diffusionConstant < 0) {
        throw new Error(`Species "${sp.name}" has negative diffusion constant: ${sp.diffusionConstant}`);
      }
      if (sp.degradationRate < 0) {
        throw new Error(`Species "${sp.name}" has negative degradation rate: ${sp.degradationRate}`);
      }
      const arr = new Float64Array(this.totalVoxels);
      arr.fill(sp.initialConcentration ?? 0);
      this.grids.set(sp.name, arr);
      this.gridTemp.set(sp.name, new Float64Array(this.totalVoxels));
      this.sourceFields.set(sp.name, new Float64Array(this.totalVoxels));
      this.sinkFields.set(sp.name, new Float64Array(this.totalVoxels));
      this.activeSourceIndices.set(sp.name, []);
      this.activeSinkIndices.set(sp.name, []);
    }
  }

  // -----------------------------------------------------------------------
  // Index helpers
  // -----------------------------------------------------------------------

  private idx2D(ix: number, iy: number): number {
    return ix + this.nx * iy;
  }

  private idx3D(ix: number, iy: number, iz: number): number {
    return ix + this.nx * (iy + this.ny * iz);
  }

  private bcWrap(i: number, n: number): number {
    return ((i % n) + n) % n;
  }

  private bcClamp(i: number, n: number): number {
    if (i < 0) return 0;
    if (i >= n) return n - 1;
    return i;
  }

  // -----------------------------------------------------------------------
  // step – dimension-aware finite-difference diffusion with sub-stepping
  // -----------------------------------------------------------------------

  step(dt: number): void {
    if (dt <= 0) return;

    if (this.dimensions === 2) {
      this.step2D(dt);
    } else {
      this.step3D(dt);
    }
  }

  private step2D(dt: number): void {
    const nx = this.nx;
    const ny = this.ny;
    const invDx2 = 1 / (this.dx * this.dx);
    const invDy2 = 1 / (this.dy * this.dy);
    const sumInvD2 = invDx2 + invDy2;
    const bc = this.boundaryCondition;

    for (const sp of this.species) {
      const D = sp.diffusionConstant;
      const decay = sp.degradationRate;

      // 2D explicit stability: dt < 1 / (2 * D * (1/dx^2 + 1/dy^2)).
      // Degradation is applied as an exact exponential factor per substep
      // (operator splitting), so it never destabilizes the explicit step.
      let dtMax: number;
      if (D > 0) {
        dtMax = 0.9 / (2 * D * sumInvD2);
      } else {
        dtMax = dt;
      }

      // Safe bounds on substeps
      const rawSub = Math.max(1, Math.ceil(dt / dtMax));
      const nSub = Math.min(10000, rawSub);
      if (rawSub > 10000) {
        console.warn(
          `[ExtracellularGrid] 2D explicit diffusion required ${rawSub} substeps; capped at ${nSub} to prevent stalling.`,
        );
      }
      const subDt = dt / nSub;

      let current = this.grids.get(sp.name)!;
      let next = this.gridTemp.get(sp.name)!;
      const sourceField = this.sourceFields.get(sp.name)!;
      const sinkField = this.sinkFields.get(sp.name)!;
      const activeSources = this.activeSourceIndices.get(sp.name)!;
      const activeSinks = this.activeSinkIndices.get(sp.name)!;
      const hasSourcesOrSinks = activeSources.length > 0 || activeSinks.length > 0;
      if (D === 0 && decay === 0 && !hasSourcesOrSinks) continue; // nothing changes

      if (D === 0) {
        // Pure reaction: exact exponential decay over the whole dt; sources
        // and sinks applied once with the full dt (no diffusion substepping).
        const reactionFactor = decay > 0 ? Math.exp(-decay * dt) : 1;
        if (reactionFactor !== 1) {
          for (let i = 0; i < current.length; i++) {
            current[i] *= reactionFactor;
          }
        }
        for (let k = 0; k < activeSources.length; k++) {
          const i = activeSources[k];
          current[i] += sourceField[i] * dt;
        }
        for (let k = 0; k < activeSinks.length; k++) {
          const i = activeSinks[k];
          const val = current[i] - sinkField[i] * dt;
          current[i] = val > 0 ? val : 0;
        }
        continue;
      }

      // Exact exponential decay per substep (operator splitting): keeps the
      // scheme positive and exact for pure decay, independent of step size.
      const decayFactor = decay > 0 ? Math.exp(-decay * subDt) : 1;

      for (let sub = 0; sub < nSub; sub++) {
        // Interior and boundary updates
        for (let iy = 0; iy < ny; iy++) {
          const row = iy * nx;
          let yDownIdx: number;
          let yUpIdx: number;

          if (bc === 'periodic') {
            yDownIdx = (iy > 0 ? iy - 1 : ny - 1) * nx;
            yUpIdx = (iy < ny - 1 ? iy + 1 : 0) * nx;
          } else {
            yDownIdx = (iy > 0 ? iy - 1 : iy) * nx;
            yUpIdx = (iy < ny - 1 ? iy + 1 : iy) * nx;
          }

          for (let ix = 0; ix < nx; ix++) {
            const idx = row + ix;
            const c = current[idx];

            let xLeft: number;
            let xRight: number;
            let cDown: number;
            let cUp: number;

            if (bc === 'periodic') {
              xLeft = ix > 0 ? current[row + ix - 1] : current[row + nx - 1];
              xRight = ix < nx - 1 ? current[row + ix + 1] : current[row];
              cDown = current[yDownIdx + ix];
              cUp = current[yUpIdx + ix];
            } else if (bc === 'dirichlet') {
              // Face-consistent Dirichlet (VCell VALUE convention): the fixed
              // boundary value sits on the cell face (dx/2 away), so the ghost
              // cell center must mirror-interpolate to it: ghost = 2*V - c.
              // With V = 0 this gives ghost = -c.
              xLeft = ix > 0 ? current[row + ix - 1] : -c;
              xRight = ix < nx - 1 ? current[row + ix + 1] : -c;
              cDown = iy > 0 ? current[yDownIdx + ix] : -c;
              cUp = iy < ny - 1 ? current[yUpIdx + ix] : -c;
            } else {
              // Neumann (zero-flux)
              xLeft = ix > 0 ? current[row + ix - 1] : c;
              xRight = ix < nx - 1 ? current[row + ix + 1] : c;
              cDown = current[yDownIdx + ix];
              cUp = current[yUpIdx + ix];
            }

            const laplacian =
              (xRight + xLeft - 2 * c) * invDx2 +
              (cUp + cDown - 2 * c) * invDy2;

            const nextVal = (c + subDt * (D * laplacian)) * decayFactor;
            next[idx] = nextVal > 0 ? nextVal : 0;
          }
        }

        // Apply sources and sinks
        if (hasSourcesOrSinks) {
          for (let k = 0; k < activeSources.length; k++) {
            const i = activeSources[k];
            next[i] += sourceField[i] * subDt;
          }
          for (let k = 0; k < activeSinks.length; k++) {
            const i = activeSinks[k];
            const val = next[i] - sinkField[i] * subDt;
            next[i] = val > 0 ? val : 0;
          }
        }

        // Pointer swap
        const tmp = current;
        current = next;
        next = tmp;
      }

      // Ensure the master map points to the latest array
      this.grids.set(sp.name, current);
      this.gridTemp.set(sp.name, next);
    }
  }

  private step3D(dt: number): void {
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;
    const invDx2 = 1 / (this.dx * this.dx);
    const invDy2 = 1 / (this.dy * this.dy);
    const invDz2 = 1 / (this.dz * this.dz);
    const sumInvD2 = invDx2 + invDy2 + invDz2;
    const strideY = nx;
    const strideZ = nx * ny;
    const bc = this.boundaryCondition;

    for (const sp of this.species) {
      const D = sp.diffusionConstant;
      const decay = sp.degradationRate;

      // 3D explicit stability: dt < 1 / (2 * D * (1/dx^2 + 1/dy^2 + 1/dz^2)).
      // Degradation is applied as an exact exponential factor per substep
      // (operator splitting), so it never destabilizes the explicit step.
      let dtMax: number;
      if (D > 0) {
        dtMax = 0.9 / (2 * D * sumInvD2);
      } else {
        dtMax = dt;
      }

      const rawSub = Math.max(1, Math.ceil(dt / dtMax));
      const nSub = Math.min(10000, rawSub);
      if (rawSub > 10000) {
        console.warn(
          `[ExtracellularGrid] 3D explicit diffusion required ${rawSub} substeps; capped at ${nSub}.`,
        );
      }
      const subDt = dt / nSub;

      let current = this.grids.get(sp.name)!;
      let next = this.gridTemp.get(sp.name)!;
      const sourceField = this.sourceFields.get(sp.name)!;
      const sinkField = this.sinkFields.get(sp.name)!;
      const activeSources = this.activeSourceIndices.get(sp.name)!;
      const activeSinks = this.activeSinkIndices.get(sp.name)!;
      const hasSourcesOrSinks = activeSources.length > 0 || activeSinks.length > 0;
      if (D === 0 && decay === 0 && !hasSourcesOrSinks) continue; // nothing changes
      if (D === 0) {
        // Pure reaction: exact exponential decay over the whole dt; sources
        // and sinks applied once with the full dt (no diffusion substepping).
        const reactionFactor = decay > 0 ? Math.exp(-decay * dt) : 1;
        if (reactionFactor !== 1) {
          for (let i = 0; i < current.length; i++) {
            current[i] *= reactionFactor;
          }
        }
        for (let k = 0; k < activeSources.length; k++) {
          const i = activeSources[k];
          current[i] += sourceField[i] * dt;
        }
        for (let k = 0; k < activeSinks.length; k++) {
          const i = activeSinks[k];
          const val = current[i] - sinkField[i] * dt;
          current[i] = val > 0 ? val : 0;
        }
        continue;
      }

      // Exact exponential decay per substep (operator splitting): keeps the
      // scheme positive and exact for pure decay, independent of step size.
      const decayFactor = decay > 0 ? Math.exp(-decay * subDt) : 1;
      for (let sub = 0; sub < nSub; sub++) {
        for (let iz = 0; iz < nz; iz++) {
          const zBase = iz * strideZ;
          let zBackBase: number;
          let zFrontBase: number;

          if (bc === 'periodic') {
            zBackBase = (iz > 0 ? iz - 1 : nz - 1) * strideZ;
            zFrontBase = (iz < nz - 1 ? iz + 1 : 0) * strideZ;
          } else {
            zBackBase = (iz > 0 ? iz - 1 : iz) * strideZ;
            zFrontBase = (iz < nz - 1 ? iz + 1 : iz) * strideZ;
          }

          for (let iy = 0; iy < ny; iy++) {
            const yOffset = iy * strideY;
            const idxBase = zBase + yOffset;
            let yDownBase: number;
            let yUpBase: number;

            if (bc === 'periodic') {
              yDownBase = zBase + (iy > 0 ? iy - 1 : ny - 1) * strideY;
              yUpBase = zBase + (iy < ny - 1 ? iy + 1 : 0) * strideY;
            } else {
              yDownBase = zBase + (iy > 0 ? iy - 1 : iy) * strideY;
              yUpBase = zBase + (iy < ny - 1 ? iy + 1 : iy) * strideY;
            }

            for (let ix = 0; ix < nx; ix++) {
              const idx = idxBase + ix;
              const c = current[idx];

              let xLeft: number;
              let xRight: number;
              let cDown: number;
              let cUp: number;
              let cBack: number;
              let cFront: number;

              if (bc === 'periodic') {
                xLeft = ix > 0 ? current[idxBase + ix - 1] : current[idxBase + nx - 1];
                xRight = ix < nx - 1 ? current[idxBase + ix + 1] : current[idxBase];
                cDown = current[yDownBase + ix];
                cUp = current[yUpBase + ix];
                cBack = current[zBackBase + yOffset + ix];
                cFront = current[zFrontBase + yOffset + ix];
              } else if (bc === 'dirichlet') {
                // Face-consistent Dirichlet (VCell VALUE convention): ghost
                // cell mirrors the fixed face value: ghost = 2*V - c = -c.
                xLeft = ix > 0 ? current[idxBase + ix - 1] : -c;
                xRight = ix < nx - 1 ? current[idxBase + ix + 1] : -c;
                cDown = iy > 0 ? current[yDownBase + ix] : -c;
                cUp = iy < ny - 1 ? current[yUpBase + ix] : -c;
                cBack = iz > 0 ? current[zBackBase + yOffset + ix] : -c;
                cFront = iz < nz - 1 ? current[zFrontBase + yOffset + ix] : -c;
              } else {
                // Neumann
                xLeft = ix > 0 ? current[idxBase + ix - 1] : c;
                xRight = ix < nx - 1 ? current[idxBase + ix + 1] : c;
                cDown = current[yDownBase + ix];
                cUp = current[yUpBase + ix];
                cBack = current[zBackBase + yOffset + ix];
                cFront = current[zFrontBase + yOffset + ix];
              }

              const laplacian =
                (xRight + xLeft - 2 * c) * invDx2 +
                (cUp + cDown - 2 * c) * invDy2 +
                (cFront + cBack - 2 * c) * invDz2;

              const nextVal = (c + subDt * (D * laplacian)) * decayFactor;
              next[idx] = nextVal > 0 ? nextVal : 0;
            }
          }
        }

        // Apply sources and sinks
        if (hasSourcesOrSinks) {
          for (let k = 0; k < activeSources.length; k++) {
            const i = activeSources[k];
            next[i] += sourceField[i] * subDt;
          }
          for (let k = 0; k < activeSinks.length; k++) {
            const i = activeSinks[k];
            const val = next[i] - sinkField[i] * subDt;
            next[i] = val > 0 ? val : 0;
          }
        }

        // Swap
        const tmp = current;
        current = next;
        next = tmp;
      }

      this.grids.set(sp.name, current);
      this.gridTemp.set(sp.name, next);
    }
  }

  // -----------------------------------------------------------------------
  // Source / sink management (O(1) accumulation, O(M active) updates)
  // -----------------------------------------------------------------------

  private positionToIndex(position: [number, number, number]): number {
    const ix = Math.min(this.nx - 1, Math.max(0, Math.floor(position[0] / this.dx)));
    const iy = Math.min(this.ny - 1, Math.max(0, Math.floor(position[1] / this.dy)));
    if (this.dimensions === 2) {
      return ix + this.nx * iy;
    }
    const iz = Math.min(this.nz - 1, Math.max(0, Math.floor(position[2] / this.dz)));
    return ix + this.nx * (iy + this.ny * iz);
  }

  addSource(position: [number, number, number], speciesName: string, rate: number): void {
    if (rate <= 0) return;
    const sourceField = this.sourceFields.get(speciesName);
    if (!sourceField) return;
    const idx = this.positionToIndex(position);
    if (sourceField[idx] === 0) {
      this.activeSourceIndices.get(speciesName)?.push(idx);
    }
    sourceField[idx] += rate;
  }

  addSink(position: [number, number, number], speciesName: string, rate: number): void {
    if (rate <= 0) return;
    const sinkField = this.sinkFields.get(speciesName);
    if (!sinkField) return;
    const idx = this.positionToIndex(position);
    if (sinkField[idx] === 0) {
      this.activeSinkIndices.get(speciesName)?.push(idx);
    }
    sinkField[idx] += rate;
  }

  clearSourcesSinks(): void {
    for (const sp of this.species) {
      const activeSources = this.activeSourceIndices.get(sp.name);
      if (activeSources && activeSources.length > 0) {
        const sourceField = this.sourceFields.get(sp.name);
        if (sourceField) {
          for (let k = 0; k < activeSources.length; k++) {
            sourceField[activeSources[k]] = 0;
          }
        }
        activeSources.length = 0;
      }

      const activeSinks = this.activeSinkIndices.get(sp.name);
      if (activeSinks && activeSinks.length > 0) {
        const sinkField = this.sinkFields.get(sp.name);
        if (sinkField) {
          for (let k = 0; k < activeSinks.length; k++) {
            sinkField[activeSinks[k]] = 0;
          }
        }
        activeSinks.length = 0;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Interpolation – bilinear for 2D, trilinear for 3D
  // -----------------------------------------------------------------------

  private getVal2D(grid: Float64Array, ix: number, iy: number): number {
    const oob = ix < 0 || ix >= this.nx || iy < 0 || iy >= this.ny;
    if (this.boundaryCondition === 'dirichlet' && oob) return 0;
    const bx = this.boundaryCondition === 'periodic' ? this.bcWrap(ix, this.nx) : this.bcClamp(ix, this.nx);
    const by = this.boundaryCondition === 'periodic' ? this.bcWrap(iy, this.ny) : this.bcClamp(iy, this.ny);
    return grid[bx + this.nx * by];
  }

  private getVal3D(grid: Float64Array, ix: number, iy: number, iz: number): number {
    const oob = ix < 0 || ix >= this.nx || iy < 0 || iy >= this.ny || iz < 0 || iz >= this.nz;
    if (this.boundaryCondition === 'dirichlet' && oob) return 0;
    const bx = this.boundaryCondition === 'periodic' ? this.bcWrap(ix, this.nx) : this.bcClamp(ix, this.nx);
    const by = this.boundaryCondition === 'periodic' ? this.bcWrap(iy, this.ny) : this.bcClamp(iy, this.ny);
    const bz = this.boundaryCondition === 'periodic' ? this.bcWrap(iz, this.nz) : this.bcClamp(iz, this.nz);
    return grid[bx + this.nx * (by + this.ny * bz)];
  }

  getConcentration(position: [number, number, number], speciesName: string): number {
    const grid = this.grids.get(speciesName);
    if (!grid) return 0;

    if (this.dimensions === 2) {
      const fx = position[0] / this.dx - 0.5;
      const fy = position[1] / this.dy - 0.5;

      const ix0 = Math.floor(fx);
      const iy0 = Math.floor(fy);

      const wx = fx - ix0;
      const wy = fy - iy0;

      const v00 = this.getVal2D(grid, ix0, iy0);
      const v10 = this.getVal2D(grid, ix0 + 1, iy0);
      const v01 = this.getVal2D(grid, ix0, iy0 + 1);
      const v11 = this.getVal2D(grid, ix0 + 1, iy0 + 1);

      const top = v00 * (1 - wx) + v10 * wx;
      const bottom = v01 * (1 - wx) + v11 * wx;
      return top * (1 - wy) + bottom * wy;
    }

    // 3D trilinear
    const fx = position[0] / this.dx - 0.5;
    const fy = position[1] / this.dy - 0.5;
    const fz = position[2] / this.dz - 0.5;

    const ix0 = Math.floor(fx);
    const iy0 = Math.floor(fy);
    const iz0 = Math.floor(fz);

    const wx = fx - ix0;
    const wy = fy - iy0;
    const wz = fz - iz0;

    let result = 0;
    for (let dz = 0; dz <= 1; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const w =
            (dx === 0 ? 1 - wx : wx) *
            (dy === 0 ? 1 - wy : wy) *
            (dz === 0 ? 1 - wz : wz);
          result += w * this.getVal3D(grid, ix0 + dx, iy0 + dy, iz0 + dz);
        }
      }
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // getGradient – central differences at an arbitrary position
  // -----------------------------------------------------------------------

  getGradient(position: [number, number, number], speciesName: string): [number, number, number] {
    const eps_x = this.dx * 0.5;
    const eps_y = this.dy * 0.5;

    if (this.dimensions === 2) {
      const cx = this.getConcentration([position[0] + eps_x, position[1], 0], speciesName);
      const cmx = this.getConcentration([position[0] - eps_x, position[1], 0], speciesName);
      const cy = this.getConcentration([position[0], position[1] + eps_y, 0], speciesName);
      const cmy = this.getConcentration([position[0], position[1] - eps_y, 0], speciesName);

      return [
        (cx - cmx) / (2 * eps_x),
        (cy - cmy) / (2 * eps_y),
        0,
      ];
    }

    const eps_z = this.dz * 0.5;
    const cx = this.getConcentration([position[0] + eps_x, position[1], position[2]], speciesName);
    const cmx = this.getConcentration([position[0] - eps_x, position[1], position[2]], speciesName);
    const cy = this.getConcentration([position[0], position[1] + eps_y, position[2]], speciesName);
    const cmy = this.getConcentration([position[0], position[1] - eps_y, position[2]], speciesName);
    const cz = this.getConcentration([position[0], position[1], position[2] + eps_z], speciesName);
    const cmz = this.getConcentration([position[0], position[1], position[2] - eps_z], speciesName);

    return [
      (cx - cmx) / (2 * eps_x),
      (cy - cmy) / (2 * eps_y),
      (cz - cmz) / (2 * eps_z),
    ];
  }

  // -----------------------------------------------------------------------
  // exportSlice – extract a 2D cross-section
  // -----------------------------------------------------------------------

  exportSlice(
    speciesName: string,
    axis: 'xy' | 'xz' | 'yz',
    sliceIndex: number = 0,
  ): Float64Array {
    const grid = this.grids.get(speciesName);
    if (!grid) return new Float64Array(0);

    if (this.dimensions === 2) {
      if (axis === 'xy') {
        return new Float64Array(grid);
      } else if (axis === 'xz') {
        const out = new Float64Array(this.nx);
        const row = Math.min(this.ny - 1, Math.max(0, sliceIndex)) * this.nx;
        for (let ix = 0; ix < this.nx; ix++) {
          out[ix] = grid[row + ix];
        }
        return out;
      } else {
        // yz
        const out = new Float64Array(this.ny);
        const col = Math.min(this.nx - 1, Math.max(0, sliceIndex));
        for (let iy = 0; iy < this.ny; iy++) {
          out[iy] = grid[col + iy * this.nx];
        }
        return out;
      }
    }

    if (axis === 'xy') {
      const out = new Float64Array(this.nx * this.ny);
      const iz = Math.min(this.nz - 1, Math.max(0, sliceIndex));
      for (let iy = 0; iy < this.ny; iy++) {
        for (let ix = 0; ix < this.nx; ix++) {
          out[ix + this.nx * iy] = grid[this.idx3D(ix, iy, iz)];
        }
      }
      return out;
    } else if (axis === 'xz') {
      const out = new Float64Array(this.nx * this.nz);
      const iy = Math.min(this.ny - 1, Math.max(0, sliceIndex));
      for (let iz = 0; iz < this.nz; iz++) {
        for (let ix = 0; ix < this.nx; ix++) {
          out[ix + this.nx * iz] = grid[this.idx3D(ix, iy, iz)];
        }
      }
      return out;
    } else {
      // yz
      const out = new Float64Array(this.ny * this.nz);
      const ix = Math.min(this.nx - 1, Math.max(0, sliceIndex));
      for (let iz = 0; iz < this.nz; iz++) {
        for (let iy = 0; iy < this.ny; iy++) {
          out[iy + this.ny * iz] = grid[this.idx3D(ix, iy, iz)];
        }
      }
      return out;
    }
  }

  /** Direct read of grid buffer by species name. */
  getGrid(speciesName: string): Float64Array | undefined {
    return this.grids.get(speciesName);
  }
}
