// @vitest-environment jsdom
// DOM-dependent tests run with jsdom via file-level vitest environment.
import React from 'react';
import { render, fireEvent, screen, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParameterScanTab } from '../../components/tabs/ParameterScanTab';
import { bnglService } from '../../services/bnglService';
import type { BNGLModel, SimulationResults } from '../../types';

// mock the bnglService methods used by the component
vi.mock('../../services/bnglService', () => ({
    bnglService: {
        prepareModel: vi.fn(),
        simulateCached: vi.fn(),
        releaseModel: vi.fn(),
    }
}));

/**
 * Seeds driven by a parameter (L, R), by a derived parameter (X), and two
 * constant seeds whose amount no parameter controls (C, Z).
 */
function seedLinkedModel(): BNGLModel {
    return {
        parameters: { L0: 10, R0: 1, dose: 5, multiplier: 2, kon: 1 },
        paramExpressions: { seed: 'dose * multiplier' },
        moleculeTypes: [],
        reactions: [],
        reactionRules: [],
        species: [
            { name: 'L', initialConcentration: 10, initialExpression: 'L0' },
            { name: 'R', initialConcentration: 1, initialExpression: 'R0' },
            { name: 'X', initialConcentration: 20, initialExpression: '2 * seed' },
            { name: 'C', initialConcentration: 3, initialExpression: '3' },
            { name: 'Z', initialConcentration: 0, initialExpression: '0' },
        ],
        observables: [{ type: 'molecules', name: 'Lfree', pattern: 'L()' }],
    };
}

function axisSelect(axis: 1 | 2): HTMLSelectElement {
    return within(screen.getByText(`Parameter ${axis}`).closest('div')!).getByRole('combobox') as HTMLSelectElement;
}

function optionLabels(select: HTMLSelectElement): (string | null)[] {
    return Array.from(select.querySelectorAll('option')).map(option => option.textContent);
}

describe('ParameterScanTab component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('scans a species initial amount directly and overrides that species', async () => {
        const model: BNGLModel = {
            parameters: { k: 1 },
            moleculeTypes: [],
            reactions: [],
            reactionRules: [],
            species: [{ name: 'A', initialConcentration: 5, initialExpression: 'A0' }],
            observables: [{ type: 'molecules', name: 'obs', pattern: 'A()' }],
        };

        vi.mocked(bnglService.prepareModel).mockResolvedValue(42);
        // return observable equal to the overridden species value so the
        // chart/table will actually change when we vary the parameter.
        vi.mocked(bnglService.simulateCached).mockImplementation(async (_id, overrides) => ({
            data: [{ time: 0, obs: overrides?.A ?? 0 }],
            headers: ['time', 'obs'],
        }));
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        render(<ParameterScanTab model={model} />);

        const section = screen.getByText('Parameter 1').closest('div');
        expect(section).toBeTruthy();
        if (!section) return; // type guard for TS

        // 'A0' is not a parameter of this model, so nothing drives A and its
        // direct initial-amount scan stays in the default list.
        const select = axisSelect(1);
        expect(optionLabels(select)).toEqual(['A — direct initial amount', 'k — parameter']);

        fireEvent.change(select, { target: { value: 'A' } });

        const inputs = within(section).getAllByRole('spinbutton') as HTMLInputElement[];
        // order: start, end, steps
        fireEvent.change(inputs[0], { target: { value: '1' } });
        fireEvent.change(inputs[1], { target: { value: '2' } });
        fireEvent.change(inputs[2], { target: { value: '2' } });

        fireEvent.click(screen.getByRole('button', { name: /run scan/i }));
        await waitFor(() => expect(bnglService.simulateCached).toHaveBeenCalled());

        // the scan overrides the species itself, never a parameter of that name
        const calls = vi.mocked(bnglService.simulateCached).mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(1);
        calls.forEach(([, overrides]) => {
            expect(overrides).toBeDefined();
            expect(overrides?.A).toBeGreaterThanOrEqual(1);
            expect(overrides?.A).toBeLessThanOrEqual(2);
            expect(overrides).not.toHaveProperty('A0');
        });

        // results table should show formatted parameter values
        expect((await screen.findAllByText('1.000')).length).toBeGreaterThan(0);
        expect((await screen.findAllByText('2.000')).length).toBeGreaterThan(0);
    });

    it('scanning a parameter leaves dependent seed evaluation to the engine', async () => {
        const model: BNGLModel = {
            parameters: { A0: 100, other: 2 },
            moleculeTypes: [],
            reactions: [],
            reactionRules: [],
            species: [{ name: 'A(b)', initialConcentration: 100, initialExpression: 'A0' }],
            observables: [{ type: 'molecules', name: 'obs', pattern: 'A(b)' }],
        };

        vi.mocked(bnglService.prepareModel).mockResolvedValue(99);
        vi.mocked(bnglService.simulateCached).mockImplementation(async (_id, overrides) => ({
            data: [{ time: 0, obs: overrides?.A0 ?? 0 }],
            headers: ['time', 'obs'],
        }));
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        render(<ParameterScanTab model={model} />);
        const select = axisSelect(1);
        // pick the parameter (A0) rather than the species
        fireEvent.change(select, { target: { value: 'A0' } });

        const section = screen.getByText('Parameter 1').closest('div')!;
        const inputs = within(section).getAllByRole('spinbutton') as HTMLInputElement[];
        fireEvent.change(inputs[0], { target: { value: '50' } });
        fireEvent.change(inputs[1], { target: { value: '150' } });
        fireEvent.change(inputs[2], { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /run scan/i }));
        await waitFor(() => expect(bnglService.simulateCached).toHaveBeenCalledTimes(2));
        expect(vi.mocked(bnglService.simulateCached).mock.calls.map(([, overrides]) => overrides))
            .toEqual([{ A0: 50 }, { A0: 150 }]);
    });

    it('lists seed-linked parameters first and only direct scans of constant seeds by default', () => {
        vi.mocked(bnglService.prepareModel).mockResolvedValue(100);
        vi.mocked(bnglService.simulateCached).mockResolvedValue({ data: [], headers: [] } satisfies SimulationResults);
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        render(<ParameterScanTab model={seedLinkedModel()} />);
        const select = axisSelect(1);

        expect(optionLabels(select)).toEqual([
            'L0 — parameter (initializes L)',
            'R0 — parameter (initializes R)',
            'dose — parameter (initializes X)',
            'multiplier — parameter (initializes X)',
            'C — direct initial amount',
            'Z — direct initial amount',
            'kon — parameter',
        ]);
        expect(select.value).toBe('L0');
    });

    it('lists direct scans of parameter-driven species only when the advanced option is enabled', () => {
        vi.mocked(bnglService.prepareModel).mockResolvedValue(100);
        vi.mocked(bnglService.simulateCached).mockResolvedValue({ data: [], headers: [] } satisfies SimulationResults);
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        render(<ParameterScanTab model={seedLinkedModel()} />);
        const advanced = screen.getByRole('checkbox', { name: /direct amounts for all species/i });

        fireEvent.click(advanced);
        const labels = optionLabels(axisSelect(1));
        expect(labels).toContain('L — direct initial amount (ignores L0)');
        expect(labels).toContain('X — direct initial amount (ignores dose, multiplier)');
        expect(labels).toContain('C — direct initial amount');

        // a direct scan of a parameter-driven species stays available, and still
        // overrides the species rather than the parameter feeding it
        fireEvent.change(axisSelect(1), { target: { value: 'X' } });
        expect(axisSelect(1).value).toBe('X');

        // hiding those entries again must not leave a selection without an option
        fireEvent.click(advanced);
        expect(axisSelect(1).value).toBe('L0');
    });

    it('warns in 2D scans when one axis overrides a species the other axis initializes', () => {
        vi.mocked(bnglService.prepareModel).mockResolvedValue(100);
        vi.mocked(bnglService.simulateCached).mockResolvedValue({ data: [], headers: [] } satisfies SimulationResults);
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        render(<ParameterScanTab model={seedLinkedModel()} />);
        fireEvent.click(screen.getByRole('checkbox', { name: /direct amounts for all species/i }));
        fireEvent.click(screen.getByRole('radio', { name: /2D scan/i }));
        expect(screen.queryByRole('note')).toBeNull();

        fireEvent.change(axisSelect(1), { target: { value: 'dose' } });
        fireEvent.change(axisSelect(2), { target: { value: 'X' } });
        const warning = screen.getByRole('note').textContent ?? '';
        expect(warning).toContain('dose');
        expect(warning).toContain('X');

        // a constant seed is not initialized by any parameter, so no warning
        fireEvent.change(axisSelect(2), { target: { value: 'Z' } });
        expect(screen.queryByRole('note')).toBeNull();
    });

    it('runs the scan shown in the dropdown without the user re-picking it', async () => {
        const model: BNGLModel = {
            parameters: { A0: 100, kon: 0.5 },
            moleculeTypes: [],
            reactions: [],
            reactionRules: [],
            species: [{ name: 'A(b)', initialConcentration: 100, initialExpression: 'A0' }],
            observables: [{ type: 'molecules', name: 'obs', pattern: 'A(b)' }],
        };
        vi.mocked(bnglService.prepareModel).mockResolvedValue(7);
        vi.mocked(bnglService.simulateCached).mockImplementation(async (_id, overrides) => ({
            data: [{ time: 0, obs: overrides?.A0 ?? 0 }],
            headers: ['time', 'obs'],
        }));
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        render(<ParameterScanTab model={model} />);

        // The dropdown shows a valid default without the user touching it.
        expect(axisSelect(1).value).toBe('A0');

        const section = screen.getByText('Parameter 1').closest('div')!;
        const inputs = within(section).getAllByRole('spinbutton') as HTMLInputElement[];
        fireEvent.change(inputs[0], { target: { value: '50' } });
        fireEvent.change(inputs[1], { target: { value: '150' } });
        fireEvent.change(inputs[2], { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /run scan/i }));

        await waitFor(() => expect(bnglService.simulateCached).toHaveBeenCalledTimes(2));
        expect(vi.mocked(bnglService.simulateCached).mock.calls.map(([, overrides]) => overrides))
            .toEqual([{ A0: 50 }, { A0: 150 }]);
    });

    it('selects an observable by default and renders its results', async () => {
        const model: BNGLModel = {
            parameters: { A0: 100 },
            moleculeTypes: [],
            reactions: [],
            reactionRules: [],
            species: [{ name: 'A(b)', initialConcentration: 100, initialExpression: 'A0' }],
            observables: [{ type: 'molecules', name: 'obs', pattern: 'A(b)' }],
        };
        vi.mocked(bnglService.prepareModel).mockResolvedValue(7);
        vi.mocked(bnglService.simulateCached).mockResolvedValue({
            data: [{ time: 0, obs: 1 }],
            headers: ['time', 'obs'],
        } satisfies SimulationResults);
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        render(<ParameterScanTab model={model} />);

        // A usable observable is selected without the user choosing one.
        expect((screen.getByLabelText(/select an observable/i) as HTMLSelectElement).value).toBe('obs');

        const section = screen.getByText('Parameter 1').closest('div')!;
        const inputs = within(section).getAllByRole('spinbutton') as HTMLInputElement[];
        fireEvent.change(inputs[2], { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /run scan/i }));

        await waitFor(() => expect(screen.getByText(/1D Scan Results/i)).toBeTruthy());
        expect(screen.queryByText(/select an observable to visualize/i)).toBeNull();
    });

    it('keeps the scan configuration when a slider edit produces a new model object', async () => {
        const model: BNGLModel = {
            parameters: { A0: 100, kon: 0.5 },
            moleculeTypes: [],
            reactions: [],
            reactionRules: [],
            species: [{ name: 'A(b)', initialConcentration: 100, initialExpression: 'A0' }],
            observables: [{ type: 'molecules', name: 'obs', pattern: 'A(b)' }],
        };
        vi.mocked(bnglService.prepareModel).mockResolvedValue(7);
        vi.mocked(bnglService.simulateCached).mockResolvedValue({
            data: [{ time: 0, obs: 1 }],
            headers: ['time', 'obs'],
        } satisfies SimulationResults);
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        const { rerender } = render(<ParameterScanTab model={model} />);
        fireEvent.change(axisSelect(1), { target: { value: 'kon' } });
        const section = screen.getByText('Parameter 1').closest('div')!;
        const inputs = within(section).getAllByRole('spinbutton') as HTMLInputElement[];
        fireEvent.change(inputs[0], { target: { value: '2' } });

        // A parameter-slider drag re-solves and hands down a fresh model object.
        rerender(<ParameterScanTab model={{ ...model, parameters: { ...model.parameters, kon: 0.75 } }} />);

        expect(axisSelect(1).value).toBe('kon');
        expect((inputs[0] as HTMLInputElement).value).toBe('2');
    });

    it('drops stale results when switching between 1D and 2D', async () => {
        const model: BNGLModel = {
            parameters: { A0: 100, kon: 0.5 },
            moleculeTypes: [],
            reactions: [],
            reactionRules: [],
            species: [{ name: 'A(b)', initialConcentration: 100, initialExpression: 'A0' }],
            observables: [{ type: 'molecules', name: 'obs', pattern: 'A(b)' }],
        };
        vi.mocked(bnglService.prepareModel).mockResolvedValue(7);
        vi.mocked(bnglService.simulateCached).mockResolvedValue({
            data: [{ time: 0, obs: 1 }],
            headers: ['time', 'obs'],
        } satisfies SimulationResults);
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        render(<ParameterScanTab model={model} />);
        const section = screen.getByText('Parameter 1').closest('div')!;
        const inputs = within(section).getAllByRole('spinbutton') as HTMLInputElement[];
        fireEvent.change(inputs[2], { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /run scan/i }));
        await waitFor(() => expect(screen.getByText(/1D Scan Results/i)).toBeTruthy());

        // 1D -> 2D -> 1D must not resurrect the original 1D results.
        fireEvent.click(screen.getByRole('radio', { name: /2D scan/i }));
        expect(screen.queryByText(/1D Scan Results/i)).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: /1D scan/i }));
        expect(screen.queryByText(/1D Scan Results/i)).toBeNull();
    });
});