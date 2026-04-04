// @vitest-environment jsdom
// DOM-dependent tests run with jsdom via file-level vitest environment.
import React from 'react';
import { render, fireEvent, screen, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParameterScanTab } from '../../components/tabs/ParameterScanTab';
import { bnglService } from '../../services/bnglService';

// mock the bnglService methods used by the component
vi.mock('../../services/bnglService', () => ({
    bnglService: {
        prepareModel: vi.fn(),
        simulateCached: vi.fn(),
        releaseModel: vi.fn(),
    }
}));

describe('ParameterScanTab component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows species entries with "(initial amount)" and description, and overrides species when scanning', async () => {
        const model = {
            parameters: { k: 1 },
            species: [{ name: 'A', initialConcentration: 5, initialExpression: 'A0' }],
            observables: [{ name: 'obs', expression: 'A' }],
        } as any;

        // simple mocks
        vi.mocked(bnglService.prepareModel).mockResolvedValue(42);
        vi.mocked(bnglService.simulateCached).mockImplementation(async (_id, overrides) => {
            // return observable equal to the overridden species value so the
            // chart/table will actually change when we vary the parameter.
            const val = overrides && (overrides as any).A !== undefined ? (overrides as any).A : 0;
            return {
                data: [{ time: 0, obs: val }],
                headers: ['time', 'obs'],
            } as any;
        });
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        render(<ParameterScanTab model={model} />);

        // parameter1 section should be present
        const section = screen.getByText('Parameter 1').closest('div');
        expect(section).toBeTruthy();
        if (!section) return; // type guard for TS

        // the select element inside the section
        const select = within(section).getByRole('combobox');
        // it should contain both parameter and species options
        expect(within(select).getByText('k')).toBeTruthy();
        // species option should now show the parameter name and refer to the species
        expect(within(select).getByText('A0 (initial amount for A)')).toBeTruthy();

        // pick the species option
        fireEvent.change(select, { target: { value: 'A' } });

        // description text should update accordingly
        expect(
            within(section).getByText(/initial concentration\/amount of the selected species/i)
        ).toBeTruthy();
        // description should mention the actual parameter used
        // description should mention that the value is injected directly and not tied to the parameter
        expect(
            within(section).getByText(/injected directly into the simulator/i)
        ).toBeTruthy();

        // fill start/end/steps for the scan
        const inputs = within(section).getAllByRole('spinbutton') as HTMLInputElement[];
        // order: start, end, steps
        fireEvent.change(inputs[0], { target: { value: '1' } });
        fireEvent.change(inputs[1], { target: { value: '2' } });
        fireEvent.change(inputs[2], { target: { value: '2' } });

        // select observable (it defaults to first but we'll just leave it)

        // click run button
        const runButton = screen.getByRole('button', { name: /run scan/i });
        fireEvent.click(runButton);

        // wait for simulateCached to be called at least once
        await waitFor(() => expect(bnglService.simulateCached).toHaveBeenCalled());

        // verify that each call passed an override for species 'A'
        const calls = vi.mocked(bnglService.simulateCached).mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(1);
        calls.forEach(([, overrides]) => {
            expect(overrides).toBeDefined();
            expect((overrides as any).A).toBeGreaterThanOrEqual(1);
            expect((overrides as any).A).toBeLessThanOrEqual(2);
        });

        // results table should show formatted parameter values
        const ones = await screen.findAllByText('1.000');
        const twos = await screen.findAllByText('2.000');
        expect(ones.length).toBeGreaterThan(0);
        expect(twos.length).toBeGreaterThan(0);

    });

    it('scanning a parameter also updates species defined in terms of that parameter', async () => {
        const model = {
            parameters: { A0: 100, other: 2 },
            species: [{ name: 'A(b)', initialConcentration: 100, initialExpression: 'A0' }],
            observables: [{ name: 'obs', expression: 'A(b)' }],
        } as any;

        vi.mocked(bnglService.prepareModel).mockResolvedValue(99);
        vi.mocked(bnglService.simulateCached).mockImplementation(async (_id, overrides) => {
            const pa0 = overrides && (overrides as any).A0;
            const ps = overrides && (overrides as any)['A(b)'];
            // ensure species override equals parameter value, tests use this to
            // drive the observable output
            const obsval = ps !== undefined ? ps : 0;
            return {
                data: [{ time: 0, obs: obsval }],
                headers: ['time', 'obs'],
            } as any;
        });
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);

        render(<ParameterScanTab model={model} />);
        const section = screen.getByText('Parameter 1').closest('div');
        if (!section) return;
        const select = within(section).getByRole('combobox');
        // pick the parameter (A0) rather than the species
        fireEvent.change(select, { target: { value: 'A0' } });

        const inputs = within(section).getAllByRole('spinbutton') as HTMLInputElement[];
        fireEvent.change(inputs[0], { target: { value: '50' } });
        fireEvent.change(inputs[1], { target: { value: '150' } });
        fireEvent.change(inputs[2], { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /run scan/i }));
        await waitFor(() => expect(bnglService.simulateCached).toHaveBeenCalled());
        const calls = vi.mocked(bnglService.simulateCached).mock.calls;
        calls.forEach(([, overrides]) => {
            expect(overrides).toBeDefined();
            expect((overrides as any).A0).toEqual((overrides as any)['A(b)']);
        });
    });
});
