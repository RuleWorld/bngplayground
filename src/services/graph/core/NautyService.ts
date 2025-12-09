
/**
 * Service to interface with the Nauty WebAssembly module.
 * Provides fast orbit computation for symmetry reduction.
 */
export class NautyService {
  private static instance: NautyService;
  private nautyModule: any = null;
  private isReady = false;

  private constructor() { }

  static getInstance(): NautyService {
    if (!NautyService.instance) {
      NautyService.instance = new NautyService();
    }
    return NautyService.instance;
  }

  /**
   * Initialize the WASM module.
   * This must be called before using getCanonicalOrbits.
   */
  async init(): Promise<void> {
    if (this.isReady) return;

    try {
      // Dynamic import to avoid build errors if file is missing
      // @ts-ignore
      const module = await import('../../../wasm/nauty/nauty.js');
      const createNautyModule = module.default;

      this.nautyModule = await createNautyModule();
      this.isReady = true;
      console.log('Nauty WASM module initialized successfully.');
    } catch (error) {
      console.warn('Failed to initialize Nauty WASM module (using JS fallback):', error);
    }
  }

  get isInitialized(): boolean {
    return this.isReady;
  }

  /**
   * Compute automorphism orbits for a graph using Nauty.
   * 
   * @param n Number of vertices
   * @param flatAdj Flattened adjacency matrix (n*n), 1=edge, 0=no edge
   * @returns Array of orbit indices (size n)
   */
  getCanonicalOrbits(n: number, flatAdj: Int32Array | number[]): Int32Array {
    if (!this.isReady) {
      throw new Error('NautyService not initialized. Call init() first.');
    }

    const byteCount = n * n * 4; // 4 bytes per int
    // Debug logging
    // console.log('NautyModule keys:', Object.keys(this.nautyModule));

    // Allocate memory in WASM heap
    const adjPtr = this.nautyModule._malloc(byteCount);
    const orbitsPtr = this.nautyModule._malloc(n * 4);

    try {
      // Copy adjacency matrix to heap using setValue
      for (let i = 0; i < flatAdj.length; i++) {
        this.nautyModule.setValue(adjPtr + i * 4, flatAdj[i], 'i32');
      }

      // Call C function: void getCanonicalOrbits(int n, int* flat_adj, int* orbits_out)
      this.nautyModule._getCanonicalOrbits(n, adjPtr, orbitsPtr);

      // Copy results back using getValue
      const result = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        result[i] = this.nautyModule.getValue(orbitsPtr + i * 4, 'i32');
      }

      return result;

    } finally {
      // Free memory
      this.nautyModule._free(adjPtr);
      this.nautyModule._free(orbitsPtr);
    }
  }
  /**
   * Compute canonical labeling and orbits for a graph using Nauty.
   * 
   * @param n Number of vertices
   * @param flatAdj Flattened adjacency matrix (n*n), 1=edge, 0=no edge
   * @param colors Optional vertex coloring array (size n). Vertices with same value are in same partition.
   * @returns Object containing canonical labeling (permutation) and orbit indices
   */
  getCanonicalLabeling(n: number, flatAdj: Int32Array | number[], colors: Int32Array | number[] | null = null): { labeling: Int32Array, orbits: Int32Array } {
    if (!this.isReady) {
      throw new Error('NautyService not initialized. Call init() first.');
    }

    const byteCount = n * n * 4; // 4 bytes per int
    
    // Allocate memory in WASM heap
    const adjPtr = this.nautyModule._malloc(byteCount);
    const labPtr = this.nautyModule._malloc(n * 4);
    const orbitsPtr = this.nautyModule._malloc(n * 4);
    let colorsPtr = 0;

    if (colors) {
        colorsPtr = this.nautyModule._malloc(n * 4);
    }

    try {
      // Copy adjacency matrix
      for (let i = 0; i < flatAdj.length; i++) {
        this.nautyModule.setValue(adjPtr + i * 4, flatAdj[i], 'i32');
      }

      // Copy colors if provided
      if (colors) {
          for (let i = 0; i < n; i++) {
              this.nautyModule.setValue(colorsPtr + i * 4, colors[i], 'i32');
          }
      }

      // Call C function: void getCanonicalLabeling(int n, int* flat_adj, int* colors, int* lab_out, int* orbits_out)
      this.nautyModule._getCanonicalLabeling(n, adjPtr, colorsPtr, labPtr, orbitsPtr);

      // Copy results back
      const labeling = new Int32Array(n);
      const orbits = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        labeling[i] = this.nautyModule.getValue(labPtr + i * 4, 'i32');
        orbits[i] = this.nautyModule.getValue(orbitsPtr + i * 4, 'i32');
      }

      return { labeling, orbits };

    } finally {
      // Free memory
      this.nautyModule._free(adjPtr);
      this.nautyModule._free(labPtr);
      this.nautyModule._free(orbitsPtr);
      if (colorsPtr) {
          this.nautyModule._free(colorsPtr);
      }
    }
  }
}
