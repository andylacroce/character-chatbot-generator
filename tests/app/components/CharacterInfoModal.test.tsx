import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CharacterInfoModal from '@/app/components/CharacterInfoModal';

describe('CharacterInfoModal', () => {
    it('renders nothing when show is false', () => {
        const { container } = render(<CharacterInfoModal show={false} onClose={jest.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders the character info text when show is true', () => {
        render(<CharacterInfoModal show={true} onClose={jest.fn()} />);
        expect(screen.getByTestId('character-info-modal-backdrop')).toBeInTheDocument();
        expect(screen.getByText('Which characters can I create?')).toBeInTheDocument();
    });

    it('calls onClose when the backdrop is clicked', () => {
        const onClose = jest.fn();
        render(<CharacterInfoModal show={true} onClose={onClose} />);
        fireEvent.click(screen.getByTestId('character-info-modal-backdrop'));
        expect(onClose).toHaveBeenCalled();
    });

    it('does not call onClose when the modal content itself is clicked', () => {
        const onClose = jest.fn();
        render(<CharacterInfoModal show={true} onClose={onClose} />);
        fireEvent.click(screen.getByText('Which characters can I create?'));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when the close button is clicked', () => {
        const onClose = jest.fn();
        render(<CharacterInfoModal show={true} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close character info'));
        expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape is pressed while shown', () => {
        const onClose = jest.fn();
        render(<CharacterInfoModal show={true} onClose={onClose} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('does not listen for Escape when not shown', () => {
        const onClose = jest.fn();
        render(<CharacterInfoModal show={false} onClose={onClose} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });
});
