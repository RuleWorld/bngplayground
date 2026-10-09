/**
 * Arbitrates between the full "Run" simulation and the slider-driven parameter
 * re-solves so that exactly one of them owns the results on screen.
 *
 * Three interleavings have to hold:
 *
 *  - A slider edit arrives while a full run is in flight. The full run keeps
 *    ownership; the edit is held until it finishes instead of racing it.
 *  - A slider edit arrives while an aborted re-solve is still unwinding. The
 *    edit is held until the unwind finishes, so it is never dropped.
 *  - A run finishes after a newer run has taken over. It must not publish.
 *
 * Ownership is tracked with a monotonic generation counter. Every run captures
 * the generation it started in and may only publish while it is still current.
 */

export type SolveOwner = 'full' | 'parameter';

export interface SolveToken {
  readonly id: number;
  readonly owner: SolveOwner;
}

/** What the caller should do after a run's ownership window closes. */
export type SolveSettleAction = 'idle' | 'restart-parameter';

export class SolveCoordinator {
  private generation = 0;
  private fullRunning = false;
  private parameterRunning = false;
  private pending = false;

  /** A full run is taking over. Supersedes any in-flight re-solve. */
  beginFullRun(): SolveToken {
    this.generation += 1;
    this.fullRunning = true;
    // Every slider edit so far is already baked into the model the full run is
    // about to simulate, so nothing needs replaying. Edits arriving after this
    // point queue up again and are replayed once the run settles.
    this.pending = false;
    return { id: this.generation, owner: 'full' };
  }

  /**
   * The full run has settled. `token.id !== this.generation` means it was
   * itself superseded and it no longer owns the screen.
   */
  endFullRun(token: SolveToken): SolveSettleAction {
    if (token.id !== this.generation) return 'idle';
    this.fullRunning = false;
    return this.takePending();
  }

  /**
   * Request a parameter re-solve. Returns `null` when the edit was deferred
   * because a run already owns the screen; the owning run replays it on settle.
   */
  requestParameterSolve(): SolveToken | null {
    if (this.fullRunning || this.parameterRunning) {
      this.pending = true;
      return null;
    }
    this.generation += 1;
    this.parameterRunning = true;
    return { id: this.generation, owner: 'parameter' };
  }

  /**
   * Called by the re-solve's own loop between iterations, where continuing is
   * cheaper than unwinding and re-entering.
   */
  consumePending(): boolean {
    if (this.fullRunning || !this.pending) return false;
    this.pending = false;
    return true;
  }

  /** The re-solve has unwound. Replays an edit that arrived while it was dying. */
  finishParameterSolve(): SolveSettleAction {
    this.parameterRunning = false;
    return this.takePending();
  }

  /** Whether `token` still owns the results and may publish them. */
  owns(token: SolveToken): boolean {
    return token.id === this.generation;
  }

  /** User cancelled. Nothing may publish, and queued work is discarded. */
  cancel(): void {
    this.pending = false;
    this.generation += 1;
  }

  /**
   * Whether a slider edit is waiting behind a run. The full run must not clear
   * the accumulated parameter overrides in that case, since they describe a
   * model state the deferred edit has already moved past.
   */
  hasPendingParameterEdit(): boolean {
    return this.pending;
  }

  /** Whether a full run currently owns the screen. */
  isFullRunActive(): boolean {
    return this.fullRunning;
  }

  private takePending(): SolveSettleAction {
    if (this.fullRunning || this.parameterRunning || !this.pending) return 'idle';
    this.pending = false;
    return 'restart-parameter';
  }
}
