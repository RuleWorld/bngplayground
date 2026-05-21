// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AboutModal } from '../../components/AboutModal';

describe('AboutModal', () => {
    it('does not render when isOpen is false', () => {
        render(<AboutModal isOpen={false} onClose={() => {}} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders "About BioNetGen Playground" title when focus is undefined', () => {
        render(<AboutModal isOpen={true} onClose={() => {}} />);
        expect(screen.getByText('About BioNetGen Playground')).toBeInTheDocument();
    });

    it('renders "What is BNGL?" title when focus is "bngl"', () => {
        render(<AboutModal isOpen={true} onClose={() => {}} focus="bngl" />);
        expect(screen.getByText('What is BNGL?')).toBeInTheDocument();
    });

    it('renders "Visualization Conventions" title when focus is "viz"', () => {
        render(<AboutModal isOpen={true} onClose={() => {}} focus="viz" />);
        expect(screen.getByText('Visualization Conventions')).toBeInTheDocument();
    });

    it('calls onClose when the close button is clicked', () => {
        const onCloseSpy = vi.fn();
        render(<AboutModal isOpen={true} onClose={onCloseSpy} />);

        const closeButton = screen.getByLabelText('Close modal');
        fireEvent.click(closeButton);

        expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });
});
