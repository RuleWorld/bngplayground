import { describe, expect, it, vi } from 'vitest';
import { SolveCoordinator, type SolveToken } from '../../src/lib/solveCoordinator';

/**
 * Drives the coordinator through the run/publish sequence App.tsx uses, so the
 * concurrency contract is exercised rather than just the state transitions.
 *
 * `run` stands in for `bnglService.simulate*`: it resolves when told to and
 * records the result it published, which is what the charts end up rendering.
 */
function createHarness() {
  const coordinator = new SolveCoordinator();
  const published: Array<{ run: string; results: string }> = [];
  const overridesAtPublish: Array<Record<string, number>> = [];

  let overrides: Record<string, number> = {};

  const api = {
    coordinator,
    published,
    overridesAtPublish,
    /** Values the full run would drop if nothing is waiting behind it. */
    setOverrides(next: Record<string, number>) {
      overrides = next;
    },
    getOverrides: () => overrides,

    /** Mirrors App.handleSimulate. Returns the token it must settle with. */
    beginFullRun(): SolveToken {
      const token = coordinator.beginFullRun();
      return token;
    },

    /** Mirrors the full run resolving: publish only if still the owner. */
    settleFullRun(token: SolveToken, results: string) {
      if (coordinator.owns(token)) {
        if (!coordinator.hasPendingParameterEdit()) overrides = {};
        published.push({ run: 'full', results });
      }
      const action = coordinator.endFullRun(token);
      if (action === 'restart-parameter') api.runParameterSolve('replayed');
      return action;
    },

    /**
     * Mirrors App.runSimulationForParameterUpdate. Returns the token when the
     * solve actually started, or null when it was deferred behind another run.
     */
    requestParameterSolve(): SolveToken | null {
      return coordinator.requestParameterSolve();
    },
    /** Mirrors the parameter solve resolving. */
    settleParameterSolve(token: SolveToken, results: string) {
      if (coordinator.owns(token)) {
        published.push({ run: 'parameter', results });
        overridesAtPublish.push({ ...overrides });
      }
      const action = coordinator.finishParameterSolve();
      if (action === 'restart-parameter') api.runParameterSolve('replayed');
      return action;
    },

    /** Full slider path: request, and if it started, resolve immediately. */
    runParameterSolve(results: string): SolveToken | null {
      const token = coordinator.requestParameterSolve();
      if (!token) return null;
      api.settleParameterSolve(token, results);
      return token;
    },
  };

  return api;
}

describe('SolveCoordinator: slider edits during a full simulation', () => {
  it('defers a slider edit that lands mid-run instead of racing it', () => {
    const h = createHarness();

    const fullToken = h.beginFullRun();
    // The user keeps dragging while the full run is in flight.
    expect(h.requestParameterSolve()).toBeNull();

    h.settleFullRun(fullToken, 'full-result');

    // The full run published, and the deferred edit ran afterwards.
    expect(h.published).toEqual([
      { run: 'full', results: 'full-result' },
      { run: 'parameter', results: 'replayed' },
    ]);
  });

  it('does not start a second full run concurrently with a slider solve', () => {
    const h = createHarness();

    const sliderToken = h.requestParameterSolve();
    expect(sliderToken).not.toBeNull();

    // A full run preempts the in-flight slider solve.
    const fullToken = h.beginFullRun();
    h.settleParameterSolve(sliderToken!, 'stale-slider');
    h.settleFullRun(fullToken, 'full-result');

    // The preempted solve published nothing; only the full run's result stands.
    expect(h.published).toEqual([{ run: 'full', results: 'full-result' }]);
  });

  it('discards a full run that was itself superseded before it resolved', () => {
    const h = createHarness();

    const stale = h.beginFullRun();
    const winner = h.beginFullRun();

    h.settleFullRun(stale, 'superseded');
    h.settleFullRun(winner, 'winner');

    expect(h.published).toEqual([{ run: 'full', results: 'winner' }]);
  });

  it('does not replay a slider edit after the user cancels', () => {
    const h = createHarness();

    const fullToken = h.beginFullRun();
    h.requestParameterSolve();
    h.coordinator.cancel();

    // The cancelled run unwinds afterwards, as an aborted await always does.
    h.settleFullRun(fullToken, 'full-result');

    expect(h.published).toEqual([]);
  });

  it('keeps parameter overrides when an edit is waiting behind the run', () => {
    const h = createHarness();
    h.setOverrides({ k1: 0.2 });

    const fullToken = h.beginFullRun();
    // Slider moves k1 to 0.4 while the run is in flight.
    h.setOverrides({ k1: 0.4 });
    h.requestParameterSolve();

    h.settleFullRun(fullToken, 'full-result');

    // The replay must apply 0.4, not the 0.2 the full run started from.
    expect(h.overridesAtPublish).toEqual([{ k1: 0.4 }]);
  });

  it('clears overrides when no edit is waiting', () => {
    const h = createHarness();
    h.setOverrides({ k1: 0.2 });

    const fullToken = h.beginFullRun();
    h.settleFullRun(fullToken, 'full-result');

    expect(h.getOverrides()).toEqual({});
  });
});

describe('SolveCoordinator: slider edits against an unwinding re-solve', () => {
  it('replays an edit that arrives while an aborted re-solve is unwinding', () => {
    const h = createHarness();

    // A re-solve is in flight and about to be aborted.
    const dying = h.requestParameterSolve();
    expect(dying).not.toBeNull();

    // The user drags again before the dying solve has unwound.
    expect(h.requestParameterSolve()).toBeNull();

    h.settleParameterSolve(dying!, 'first');

    // The dying solve had already published, and the newer edit still ran.
    expect(h.published).toEqual([
      { run: 'parameter', results: 'first' },
      { run: 'parameter', results: 'replayed' },
    ]);
  });

  it('runs a drag at most once per settled solve, latest value winning', () => {
    const h = createHarness();

    const token = h.requestParameterSolve();
    // Several more moves arrive during the single in-flight solve.
    h.requestParameterSolve();
    h.requestParameterSolve();
    h.requestParameterSolve();
    h.settleParameterSolve(token!, 'solve-1');

    expect(h.published).toEqual([
      { run: 'parameter', results: 'solve-1' },
      { run: 'parameter', results: 'replayed' },
    ]);
  });

  it('loops in place instead of unwinding when the next edit can be folded in', () => {
    const h = createHarness();
    const token = h.requestParameterSolve();
    h.coordinator.requestParameterSolve();

    // consumePending is what the solve's own do/while loop uses.
    expect(h.coordinator.consumePending()).toBe(true);
    expect(h.coordinator.consumePending()).toBe(false);

    h.settleParameterSolve(token!, 'solve-1');

    // The edit was folded into the running solve, so nothing had to restart.
    expect(h.published).toEqual([{ run: 'parameter', results: 'solve-1' }]);
  });

  it('does not consume a pending edit while a full run owns the screen', () => {
    const h = createHarness();
    h.requestParameterSolve();
    h.beginFullRun();
    h.requestParameterSolve();

    expect(h.coordinator.consumePending()).toBe(false);
  });
});
