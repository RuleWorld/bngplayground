/**
 * WorkerPool.ts - Web Worker pool for parallel computation
 * 
 * Provides infrastructure for distributing computational work across
 * multiple Web Workers for parallel execution. Useful for:
 * - Parallel Jacobian column computation
 * - Parameter sweeps
 * - Ensemble simulations
 * 
 * Features:
 * - Auto-sizing based on navigator.hardwareConcurrency
 * - Task queue with load balancing
 * - SharedArrayBuffer support for zero-copy communication
 */

/**
 * Message types for worker communication
 */
export type WorkerMessageType =
  | 'COMPUTE_JACOBIAN_COLUMNS'
  | 'RUN_SIMULATION'
  | 'COMPUTE_RHS'
  | 'READY'
  | 'ERROR'
  | 'RESULT';

/**
 * Worker task definition
 */
export interface WorkerTask<T = unknown> {
  id: string;
  type: WorkerMessageType;
  data: T;
}

/**
 * Worker result
 */
export interface WorkerResult<T = unknown> {
  id: string;
  type: 'RESULT' | 'ERROR';
  data?: T;
  error?: string;
}

/**
 * Task callback
 */


/**
 * Pending task entry
 */
interface PendingTask<R = unknown> {
  task: WorkerTask;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  submittedAt: number;
}

/**
 * Worker wrapper with state
 */
interface WorkerInstance {
  worker: Worker;
  busy: boolean;
  taskCount: number;
  currentTask: string | null;
}

/**
 * Generic Worker Pool for parallel computation
 */
export class WorkerPool {
  private workers: WorkerInstance[] = [];
  private pendingTasks: PendingTask[] = [];
  private isInitialized: boolean = false;
  private workerUrl: string;
  private poolSize: number;

  constructor(workerUrl: string, poolSize?: number) {
    this.workerUrl = workerUrl;
    this.poolSize = poolSize ?? Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log(`[WorkerPool] Initializing with ${this.poolSize} workers`);

    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(this.workerUrl, { type: 'module' });
      const instance: WorkerInstance = {
        worker,
        busy: false,
        taskCount: 0,
        currentTask: null
      };

      // Set up message handler
      worker.onmessage = (event: MessageEvent<WorkerResult>) => {
        this.handleWorkerMessage(instance, event.data);
      };

      worker.onerror = (error) => {
        console.error(`[WorkerPool] Worker ${i} error:`, error);
        this.handleWorkerError(instance, error);
      };

      this.workers.push(instance);

      // Wait for worker to signal ready
      initPromises.push(new Promise((resolve) => {
        const checkReady = (event: MessageEvent) => {
          if (event.data?.type === 'READY') {
            worker.removeEventListener('message', checkReady);
            resolve();
          }
        };
        worker.addEventListener('message', checkReady);

        // Timeout fallback
        setTimeout(() => resolve(), 2000);
      }));
    }

    await Promise.all(initPromises);
    this.isInitialized = true;
    console.log(`[WorkerPool] Initialized ${this.workers.length} workers`);
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(instance: WorkerInstance, result: WorkerResult): void {
    if (!instance.currentTask) return;

    const taskId = instance.currentTask;
    const pendingIndex = this.pendingTasks.findIndex(p => p.task.id === taskId);

    if (pendingIndex >= 0) {
      const pending = this.pendingTasks[pendingIndex];
      this.pendingTasks.splice(pendingIndex, 1);

      if (result.type === 'ERROR') {
        pending.reject(new Error(result.error || 'Unknown worker error'));
      } else {
        pending.resolve(result.data);
      }
    }

    instance.busy = false;
    instance.currentTask = null;

    // Process next task in queue
    this.processQueue();
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(instance: WorkerInstance, error: ErrorEvent): void {
    if (instance.currentTask) {
      const taskId = instance.currentTask;
      const pendingIndex = this.pendingTasks.findIndex(p => p.task.id === taskId);

      if (pendingIndex >= 0) {
        const pending = this.pendingTasks[pendingIndex];
        this.pendingTasks.splice(pendingIndex, 1);
        pending.reject(new Error(`Worker error: ${error.message}`));
      }
    }

    instance.busy = false;
    instance.currentTask = null;
  }

  /**
   * Submit a task to the pool
   */
  async submit<T, R>(type: WorkerMessageType, data: T): Promise<R> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const task: WorkerTask<T> = { id: taskId, type, data };

    return new Promise((resolve, reject) => {
      this.pendingTasks.push({
        task,
        resolve: resolve as (result: unknown) => void,
        reject,
        submittedAt: Date.now()
      });
      this.processQueue();
    });
  }

  /**
   * Process the task queue
   */
  private processQueue(): void {
    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker) return;

    const pending = this.pendingTasks.find(p => !this.workers.some(w => w.currentTask === p.task.id));
    if (!pending) return;

    availableWorker.busy = true;
    availableWorker.currentTask = pending.task.id;
    availableWorker.taskCount++;
    availableWorker.worker.postMessage(pending.task);
  }

  /**
   * Execute a batch of tasks in parallel
   */
  async batch<T, R>(type: WorkerMessageType, dataArray: T[]): Promise<R[]> {
    const promises = dataArray.map(data => this.submit<T, R>(type, data));
    return Promise.all(promises);
  }

  /**
   * Execute tasks in chunks for large datasets
   */
  async executeChunked<T, R>(
    type: WorkerMessageType,
    dataArray: T[],
    chunkSize?: number
  ): Promise<R[]> {
    const size = chunkSize ?? this.poolSize * 2;
    const results: R[] = [];

    for (let i = 0; i < dataArray.length; i += size) {
      const chunk = dataArray.slice(i, i + size);
      const chunkResults = await this.batch<T, R>(type, chunk);
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    poolSize: number;
    busyWorkers: number;
    pendingTasks: number;
    totalTasks: number;
  } {
    return {
      poolSize: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      pendingTasks: this.pendingTasks.length,
      totalTasks: this.workers.reduce((sum, w) => sum + w.taskCount, 0)
    };
  }

  /**
   * Terminate all workers
   */
  terminate(): void {
    for (const instance of this.workers) {
      instance.worker.terminate();
    }
    this.workers = [];
    this.pendingTasks = [];
    this.isInitialized = false;
    console.log('[WorkerPool] Terminated all workers');
  }
}

/**
 * Simulation-specific worker pool with convenience methods
 */
export class SimulationWorkerPool extends WorkerPool {
  constructor(poolSize?: number) {
    // Use a generic simulation worker URL
    super('/workers/simulation-worker.js', poolSize);
  }

  /**
   * Compute Jacobian columns in parallel
   * Each task computes one column of the Jacobian matrix
   */
  async computeJacobianParallel(
    y: Float64Array,
    nSpecies: number,
    epsilon: number = 1e-8
  ): Promise<Float64Array[]> {
    // Create tasks for each column
    const taskData = Array.from({ length: nSpecies }, (_, col) => ({
      y: Array.from(y),
      column: col,
      epsilon,
      nSpecies
    }));

    const results = await this.batch<typeof taskData[0], number[]>(
      'COMPUTE_JACOBIAN_COLUMNS',
      taskData
    );

    return results.map(col => new Float64Array(col));
  }

  /**
   * Run parameter sweep in parallel
   * Each task runs a simulation with different parameters
   */
  async parameterSweep<T extends Record<string, number>>(
    baseParams: T,
    parameterSets: Partial<T>[],
    simulationOptions: {
      tEnd: number;
      nSteps: number;
      method?: 'ode' | 'ssa';
    }
  ): Promise<Array<{ params: Partial<T>; result: number[][] }>> {
    const taskData = parameterSets.map(paramOverrides => ({
      params: { ...baseParams, ...paramOverrides },
      options: simulationOptions
    }));

    const results = await this.batch<typeof taskData[0], number[][]>(
      'RUN_SIMULATION',
      taskData
    );

    return results.map((result, i) => ({
      params: parameterSets[i],
      result
    }));
  }
}

/**
 * Check if SharedArrayBuffer is available
 */
export function isSharedArrayBufferAvailable(): boolean {
  try {
    new SharedArrayBuffer(1);
    return true;
  } catch {
    return false;
  }
}

// Singleton simulation worker pool
let simulationPoolInstance: SimulationWorkerPool | null = null;

/**
 * Get or create the simulation worker pool singleton
 */
export function getSimulationWorkerPool(): SimulationWorkerPool {
  if (!simulationPoolInstance) {
    simulationPoolInstance = new SimulationWorkerPool();
  }
  return simulationPoolInstance;
}
