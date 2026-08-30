import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DisclaimerModal from '@/app/components/DisclaimerModal';

describe('DisclaimerModal', () => {
    it('renders nothing when show is false', () => {
        const { container } = render(<DisclaimerModal show={false} onClose={jest.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders the disclaimer text when show is true', () => {
        render(<DisclaimerModal show={true} onClose={jest.fn()} />);
        expect(screen.getByTestId('disclaimer-modal-backdrop')).toBeInTheDocument();
        expect(screen.getByText('Disclaimer')).toBeInTheDocument();
    });

    it('calls onClose when the backdrop is clicked', () => {
        const onClose = jest.fn();
        render(<DisclaimerModal show={true} onClose={onClose} />);
        fireEvent.click(screen.getByTestId('disclaimer-modal-backdrop'));
        expect(onClose).toHaveBeenCalled();
    });

    it('does not call onClose when the modal content itself is clicked', () => {
        const onClose = jest.fn();
        render(<DisclaimerModal show={true} onClose={onClose} />);
        fireEvent.click(screen.getByText('Disclaimer'));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when the close button is clicked', () => {
        const onClose = jest.fn();
        render(<DisclaimerModal show={true} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close disclaimer'));
        expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape is pressed while shown', () => {
        const onClose = jest.fn();
        render(<DisclaimerModal show={true} onClose={onClose} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('does not listen for Escape when not shown', () => {
        const onClose = jest.fn();
        render(<DisclaimerModal show={false} onClose={onClose} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });
});
