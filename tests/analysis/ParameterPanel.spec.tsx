// @vitest-environment jsdom
// DOM-dependent tests run with jsdom via file-level vitest environment.
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi, type Mock } from 'vitest';
import { ParameterPanel } from '../../components/ParameterPanel';

type CodeChangeSpy = Mock<(code: string, options?: { immediate?: boolean }) => void>;

const CODE = `begin parameters
  k1 0.2
  k2 0.05
end parameters

begin species
  A() 100
end species`;

function createSpy(): CodeChangeSpy {
  return vi.fn<(code: string, options?: { immediate?: boolean }) => void>();
}

function renderPanel(onCodeChange: CodeChangeSpy = createSpy()) {
  const view = render(<ParameterPanel code={CODE} onCodeChange={onCodeChange} />);
  return { onCodeChange, view, slider: screen.getByLabelText('k1') as HTMLInputElement };
}

/** Pull the k1 value out of emitted BNGL text. */
function emittedK1(onCodeChange: CodeChangeSpy, call = 0): string {
  const code: string = onCodeChange.mock.calls[call][0];
  const match = code.match(/k1\s+(\S+)/);
  expect(match).not.toBeNull();
  return match![1];
}

describe('ParameterPanel', () => {
  it('emits a code change on the first slider move without waiting for a timer', () => {
    const { onCodeChange, slider } = renderPanel();

    fireEvent.change(slider, { target: { value: '0.30103' } });

    // 0.2 * 10^0.30103 === 0.4
    expect(onCodeChange).toHaveBeenCalledTimes(1);
    expect(emittedK1(onCodeChange)).toBe('0.4');
  });
  it('flags slider-driven changes as immediate so the app skips the typing debounce', () => {
    const { onCodeChange, slider } = renderPanel();

    fireEvent.change(slider, { target: { value: '0.5' } });

    expect(onCodeChange.mock.calls[0][1]).toEqual({ immediate: true });
  });

  it('emits one code change per slider move, tracking the newest value', () => {
    const { onCodeChange, slider } = renderPanel();

    fireEvent.change(slider, { target: { value: '0.3' } });
    fireEvent.change(slider, { target: { value: '0.6' } });

    expect(onCodeChange).toHaveBeenCalledTimes(2);
    expect(emittedK1(onCodeChange, 0)).toBe('0.3991');
    expect(emittedK1(onCodeChange, 1)).toBe('0.7962');
  });
  it('leaves other parameters and blocks untouched', () => {
    const { onCodeChange, slider } = renderPanel();

    fireEvent.change(slider, { target: { value: '0.30103' } });

    const code: string = onCodeChange.mock.calls[0][0];
    expect(code).toContain('k2 0.05');
    expect(code).toContain('A() 100');
  });

  it('keeps emitting on top of an upstream code echo mid-drag', () => {
    const onCodeChange = createSpy();
    const { view, slider } = renderPanel(onCodeChange);

    fireEvent.change(slider, { target: { value: '0.30103' } });
    const firstCode: string = onCodeChange.mock.calls[0][0];

    // The app stores the emitted code and feeds it back down as `code`.
    view.rerender(<ParameterPanel code={firstCode} onCodeChange={onCodeChange} />);
    fireEvent.change(slider, { target: { value: '0.60206' } });

    // 0.2 * 10^0.60206 === 0.8
    expect(onCodeChange).toHaveBeenCalledTimes(2);
    expect(emittedK1(onCodeChange, 1)).toBe('0.8');
  });
});
