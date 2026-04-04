// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';

describe('ErrorBoundary', () => {
  // A component that throws an error to test the boundary
  const ProblematicComponent = ({ shouldThrow }: { shouldThrow?: boolean }) => {
    if (shouldThrow) {
      throw new Error('Test error');
    }
    return <div>Normal Content</div>;
  };

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Normal Content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });

  it('catches an error and shows the default fallback message', () => {
    // Suppress console.error for this test to avoid noisy test output
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary label="test">
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong in this panel.')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('calls the onError callback when an error occurs', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onErrorSpy = vi.fn();

    render(
      <ErrorBoundary label="test" onError={onErrorSpy}>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onErrorSpy.mock.calls[0][0].message).toBe('Test error');

    consoleErrorSpy.mockRestore();
  });

  it('resets the error boundary when "Try again" is clicked', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const TestComponent = () => {
      const [shouldThrow, setShouldThrow] = React.useState(true);
      return (
        <div>
          <button onClick={() => setShouldThrow(false)}>Fix Error</button>
          <ErrorBoundary>
            <ProblematicComponent shouldThrow={shouldThrow} />
          </ErrorBoundary>
        </div>
      );
    };

    render(<TestComponent />);

    // Initially shows error
    expect(screen.getByText('Something went wrong in this panel.')).toBeInTheDocument();

    // Click our test button to change state so the next render won't throw
    fireEvent.click(screen.getByRole('button', { name: 'Fix Error' }));

    // Click "Try again" on the error boundary
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Now it should show normal content
    expect(screen.getByText('Normal Content')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('accepts a custom fallback ReactNode', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom Error View</div>}>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Error View')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong in this panel.')).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('accepts a custom fallback function', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const customFallback = (error: Error, reset: () => void) => (
      <div>
        <p>Custom Function Error: {error.message}</p>
        <button onClick={reset}>Custom Reset</button>
      </div>
    );

    render(
      <ErrorBoundary fallback={customFallback}>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Function Error: Test error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom Reset' })).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
