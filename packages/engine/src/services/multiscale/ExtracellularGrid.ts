// ---------------------------------------------------------------------------
// ExtracellularGrid.ts – Grid-based PDE solver for extracellular diffusion
// ---------------------------------------------------------------------------

export interface ExtracellularGridConfig {
  domainSize: [number, number, number];
  resolution: [number, number, number];
  species: Array<{
    name: string;
    diffusionConstant: number;
    degradationRate: number;
    initialConcentration: number;
  }>;
  boundaryCondition: 'neumann' | 'dirichlet' | 'periodic';
}

interface PointSource {
  ix: number;
  iy: number;
  iz: number;
  rate: number;
}

export class ExtracellularGrid {
  private grids: Map<string, Float64Array>;
  private gridTemp: Map<string, Float64Array>;
  private nx: number;
  private ny: number;
  private nz: number;
  private dx: number;
  private dy: number;
  private dz: number;
  private species: ExtracellularGridConfig['species'];
  private boundaryCondition: string;
  private sources: Map<string, Array<PointSource>>;
  private sinks: Map<string, Array<PointSource>>;

  constructor(config: ExtracellularGridConfig) {
    this.nx = config.resolution[0];
    this.ny = config.resolution[1];
    this.nz = config.resolution[2];
    this.dx = config.domainSize[0] / this.nx;
    this.dy = config.domainSize[1] / this.ny;
    this.dz = config.domainSize[2] / this.nz;
    this.species = config.species;
    this.boundaryCondition = config.boundaryCondition;

    this.grids = new Map();
    this.gridTemp = new Map();
    this.sources = new Map();
    this.sinks = new Map();

    const totalCells = this.nx * this.ny * this.nz;
    for (const sp of this.species) {
      const arr = new Float64Array(totalCells);
      arr.fill(sp.initialConcentration);
      this.grids.set(sp.name, arr);
      this.gridTemp.set(sp.name, new Float64Array(totalCells));
      this.sources.set(sp.name, []);
      this.sinks.set(sp.name, []);
    }
  }

  // -----------------------------------------------------------------------
  // Index helpers
  // -----------------------------------------------------------------------

  private idx(ix: number, iy: number, iz: number): number {
    return ix + this.nx * (iy + this.ny * iz);
  }

  /** Clamp or wrap an index according to the boundary condition. */
  private bc(i: number, n: number): number {
    if (this.boundaryCondition === 'periodic') {
      return ((i % n) + n) % n;
    }
    // Neumann (zero-flux) or Dirichlet: clamp
    if (i < 0) return 0;
    if (i >= n) return n - 1;
    return i;
  }

  /** Get value handling BCs. For Dirichlet, out-of-bounds returns 0. */
  private getVal(grid: Float64Array, ix: number, iy: number, iz: number): number {
    const oob =
      ix < 0 || ix >= this.nx || iy < 0 || iy >= this.ny || iz < 0 || iz >= this.nz;

    if (this.boundaryCondition === 'dirichlet' && oob) {
      return 0; // fixed zero boundary
    }

    const bx = this.bc(ix, this.nx);
    const by = this.bc(iy, this.ny);
    const bz = this.bc(iz, this.nz);
    return grid[this.idx(bx, by, bz)];
  }

  // -----------------------------------------------------------------------
  // step – explicit finite-difference diffusion with sub-stepping
  // -----------------------------------------------------------------------

  step(dt: number): void {
    for (const sp of this.species) {
      const D = sp.diffusionConstant;
      const decay = sp.degradationRate;

      // Stability criterion for explicit 3D diffusion: dt < dx² / (6 D)
      // Use the smallest spacing for safety
      const minDx = Math.min(this.dx, this.dy, this.dz);
      const dtMax = D > 0 ? (minDx * minDx) / (6 * D) * 0.9 : dt; // 0.9 safety factor
      const nSub = Math.max(1, Math.ceil(dt / dtMax));
      const subDt = dt / nSub;

      const grid = this.grids.get(sp.name)!;
      const temp = this.gridTemp.get(sp.name)!;

      const invDx2 = 1 / (this.dx * this.dx);
      const invDy2 = 1 / (this.dy * this.dy);
      const invDz2 = 1 / (this.dz * this.dz);

      const spSources = this.sources.get(sp.name)!;
      const spSinks = this.sinks.get(sp.name)!;

      for (let sub = 0; sub < nSub; sub++) {
        // Diffusion + degradation
        for (let iz = 0; iz < this.nz; iz++) {
          for (let iy = 0; iy < this.ny; iy++) {
            for (let ix = 0; ix < this.nx; ix++) {
              const c = grid[this.idx(ix, iy, iz)];

              const laplacian =
                (this.getVal(grid, ix + 1, iy, iz) + this.getVal(grid, ix - 1, iy, iz) - 2 * c) * invDx2 +
                (this.getVal(grid, ix, iy + 1, iz) + this.getVal(grid, ix, iy - 1, iz) - 2 * c) * invDy2 +
                (this.getVal(grid, ix, iy, iz + 1) + this.getVal(grid, ix, iy, iz - 1) - 2 * c) * invDz2;

              temp[this.idx(ix, iy, iz)] = c + subDt * (D * laplacian - decay * c);
            }
          }
        }

        // Apply sources
        for (const src of spSources) {
          const i = this.idx(src.ix, src.iy, src.iz);
          temp[i] += src.rate * subDt;
        }

        // Apply sinks
        for (const snk of spSinks) {
          const i = this.idx(snk.ix, snk.iy, snk.iz);
          temp[i] = Math.max(0, temp[i] - snk.rate * subDt);
        }

        // Swap grids
        grid.set(temp);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Source / sink management
  // -----------------------------------------------------------------------

  private positionToIndex(position: [number, number, number]): [number, number, number] {
    const ix = Math.min(this.nx - 1, Math.max(0, Math.floor(position[0] / this.dx)));
    const iy = Math.min(this.ny - 1, Math.max(0, Math.floor(position[1] / this.dy)));
    const iz = Math.min(this.nz - 1, Math.max(0, Math.floor(position[2] / this.dz)));
    return [ix, iy, iz];
  }

  addSource(position: [number, number, number], speciesName: string, rate: number): void {
    const [ix, iy, iz] = this.positionToIndex(position);
    const sources = this.sources.get(speciesName);
    if (sources) {
      sources.push({ ix, iy, iz, rate });
    }
  }

  addSink(position: [number, number, number], speciesName: string, rate: number): void {
    const [ix, iy, iz] = this.positionToIndex(position);
    const sinks = this.sinks.get(speciesName);
    if (sinks) {
      sinks.push({ ix, iy, iz, rate });
    }
  }

  clearSourcesSinks(): void {
    for (const sp of this.species) {
      this.sources.set(sp.name, []);
      this.sinks.set(sp.name, []);
    }
  }

  // -----------------------------------------------------------------------
  // Interpolation – trilinear for concentration at arbitrary positions
  // -----------------------------------------------------------------------

  getConcentration(position: [number, number, number], speciesName: string): number {
    const grid = this.grids.get(speciesName);
    if (!grid) return 0;

    // Continuous grid coordinates (cell-centred)
    const fx = position[0] / this.dx - 0.5;
    const fy = position[1] / this.dy - 0.5;
    const fz = position[2] / this.dz - 0.5;

    const ix0 = Math.floor(fx);
    const iy0 = Math.floor(fy);
    const iz0 = Math.floor(fz);

    const wx = fx - ix0;
    const wy = fy - iy0;
    const wz = fz - iz0;

    // Trilinear interpolation with BC-aware value fetching
    let result = 0;
    for (let dz = 0; dz <= 1; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const w =
            (dx === 0 ? 1 - wx : wx) *
            (dy === 0 ? 1 - wy : wy) *
            (dz === 0 ? 1 - wz : wz);
          result += w * this.getVal(grid, ix0 + dx, iy0 + dy, iz0 + dz);
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
    const eps_z = this.dz * 0.5;

    const cx = this.getConcentration(
      [position[0] + eps_x, position[1], position[2]],
      speciesName,
    );
    const cmx = this.getConcentration(
      [position[0] - eps_x, position[1], position[2]],
      speciesName,
    );
    const cy = this.getConcentration(
      [position[0], position[1] + eps_y, position[2]],
      speciesName,
    );
    const cmy = this.getConcentration(
      [position[0], position[1] - eps_y, position[2]],
      speciesName,
    );
    const cz = this.getConcentration(
      [position[0], position[1], position[2] + eps_z],
      speciesName,
    );
    const cmz = this.getConcentration(
      [position[0], position[1], position[2] - eps_z],
      speciesName,
    );

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
    sliceIndex: number,
  ): Float64Array {
    const grid = this.grids.get(speciesName);
    if (!grid) return new Float64Array(0);

    if (axis === 'xy') {
      const out = new Float64Array(this.nx * this.ny);
      const iz = Math.min(this.nz - 1, Math.max(0, sliceIndex));
      for (let iy = 0; iy < this.ny; iy++) {
        for (let ix = 0; ix < this.nx; ix++) {
          out[ix + this.nx * iy] = grid[this.idx(ix, iy, iz)];
        }
      }
      return out;
    } else if (axis === 'xz') {
      const out = new Float64Array(this.nx * this.nz);
      const iy = Math.min(this.ny - 1, Math.max(0, sliceIndex));
      for (let iz = 0; iz < this.nz; iz++) {
        for (let ix = 0; ix < this.nx; ix++) {
          out[ix + this.nx * iz] = grid[this.idx(ix, iy, iz)];
        }
      }
      return out;
    } else {
      // yz
      const out = new Float64Array(this.ny * this.nz);
      const ix = Math.min(this.nx - 1, Math.max(0, sliceIndex));
      for (let iz = 0; iz < this.nz; iz++) {
        for (let iy = 0; iy < this.ny; iy++) {
          out[iy + this.ny * iz] = grid[this.idx(ix, iy, iz)];
        }
      }
      return out;
    }
  }
}
