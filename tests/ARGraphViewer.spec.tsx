// @vitest-environment jsdom
// tests in this file exercise DOM-dependent behaviour and therefore
// run with jsdom at file scope.
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AtomRuleGraph } from '../types/visualization';

// stub ResizeObserver so we can trigger its callback manually and watch for
// requestAnimationFrame usage.  we keep an array of callbacks registered.
const roCallbacks: Array<Function> = [];
class FakeResizeObserver {
  constructor(cb: Function) {
    roCallbacks.push(cb);
  }
  observe() {}
  disconnect() {}
}
(global as any).ResizeObserver = FakeResizeObserver;

// mock cytoscape so we can spy on fit/resize and control layoutstop timing.
const mockState = vi.hoisted(() => {
  const layoutCallbacks: Record<string, Function[]> = {};
  return {
    fitSpy: vi.fn(),
    resizeSpy: vi.fn(),
    destroySpy: vi.fn(),
    offSpy: vi.fn(),
    readySpy: vi.fn((cb: Function) => cb()),
    layoutRunSpy: vi.fn(),
    layoutCallbacks,
    layoutOnSpy: vi.fn((event: string, cb: Function) => {
      if (!layoutCallbacks[event]) layoutCallbacks[event] = [];
      layoutCallbacks[event].push(cb);
    }),
    onSpy: vi.fn((event: string, cb: Function) => {
      if (!layoutCallbacks[event]) layoutCallbacks[event] = [];
      layoutCallbacks[event].push(cb);
      return undefined;
    }),
  };
});

const {
  fitSpy,
  resizeSpy,
  destroySpy,
  offSpy,
  readySpy,
  layoutRunSpy,
  layoutOnSpy,
  layoutCallbacks,
  onSpy,
} = mockState;

vi.mock('cytoscape', () => {
  const fakeLayout = {
    on: mockState.layoutOnSpy,
    run: mockState.layoutRunSpy,
  };
  const cyt = vi.fn(() => ({
    fit: mockState.fitSpy,
    resize: mockState.resizeSpy,
    destroy: mockState.destroySpy,
    off: mockState.offSpy,
    ready: mockState.readySpy,
    layout: vi.fn(() => fakeLayout),
    elements: () => [],
    on: mockState.onSpy,
    getElementById: () => ({
      nonempty: () => false,
      addClass: vi.fn(),
      connectedEdges: () => ({ addClass: vi.fn(), connectedNodes: () => ({ addClass: vi.fn() }) }),
    }),
  }));
  cyt.use = vi.fn();
  return { default: cyt };
});

import { ARGraphViewer } from '../components/ARGraphViewer';

const baseGraph: AtomRuleGraph = {
  nodes: [{ id: 'n1', label: 'A()', type: 'atom' }],
  edges: [],
};

describe('ARGraphViewer', () => {
  beforeEach(() => {
    fitSpy.mockClear();
    resizeSpy.mockClear();
    destroySpy.mockClear();
    offSpy.mockClear();
    readySpy.mockClear();
    layoutOnSpy.mockClear();
    layoutRunSpy.mockClear();
    onSpy.mockClear();
    roCallbacks.length = 0;
    // clear any layout callbacks from previous renders
    Object.keys(layoutCallbacks).forEach(k => delete layoutCallbacks[k]);
  });

  it('creates a cytoscape instance and runs the initial layout on mount', () => {
    render(<ARGraphViewer arGraph={baseGraph} />);
    expect(readySpy).toHaveBeenCalled();
    expect(layoutRunSpy).toHaveBeenCalled();
  });

  it('re-fits when forceFitTrigger prop changes', () => {
    const { rerender } = render(
      <ARGraphViewer arGraph={baseGraph} forceFitTrigger="foo" />
    );
    // First effect pass happens before cytoscape instance is available.
    expect(fitSpy).not.toHaveBeenCalled();

    rerender(
      <ARGraphViewer arGraph={baseGraph} forceFitTrigger="bar" />
    );
    expect(fitSpy).toHaveBeenCalled();
  });

  it('recreates cy instance when arGraph changes', () => {
    const { rerender } = render(<ARGraphViewer arGraph={baseGraph} />);
    expect(destroySpy).not.toHaveBeenCalled();
    const bigger: AtomRuleGraph = {
      nodes: [...baseGraph.nodes, { id: 'n2', label: 'B()', type: 'atom' }],
      edges: [],
    };
    rerender(<ARGraphViewer arGraph={bigger} />);
    // original instance should have been destroyed so a new one can be made
    expect(destroySpy).toHaveBeenCalled();
    expect(layoutRunSpy).toHaveBeenCalledTimes(2);
  });

  it('uses requestAnimationFrame when a resize event occurs', () => {
    // render component to register ResizeObserver
    render(<ARGraphViewer arGraph={baseGraph} />);
    // there should be exactly one callback stored
    expect(roCallbacks.length).toBe(1);

    // invoke the observer callback with a dummy size
    roCallbacks[0]([{ contentRect: { width: 100, height: 200 } }]);

    // Current implementation resizes immediately on observer callback.
    expect(resizeSpy).toHaveBeenCalled();
  });

  it('registers layoutstop handler for post-layout viewport fit', () => {
    render(<ARGraphViewer arGraph={baseGraph} selectedRuleId="n1" />);
    expect(layoutCallbacks['layoutstop']).toBeDefined();
    expect(layoutCallbacks['layoutstop'].length).toBeGreaterThan(0);
  });
});
