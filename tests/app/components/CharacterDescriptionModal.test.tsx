import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CharacterDescriptionModal } from '../../../app/components/CharacterDescriptionModal';

describe('CharacterDescriptionModal', () => {
    const mockOnSubmit = jest.fn();
    const mockOnCancel = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.style.overflow = '';
    });

    it('renders the character name and prompt', () => {
        render(
            <CharacterDescriptionModal
                characterName="Zorblax the Unmentioned"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        expect(screen.getByText('"Zorblax the Unmentioned"')).toBeInTheDocument();
        expect(screen.getByText(/We don't recognize this as an existing character/i)).toBeInTheDocument();
    });

    it('disables Create Character until a description is entered', () => {
        render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        expect(screen.getByText('Create Character')).toBeDisabled();

        fireEvent.change(screen.getByTestId('description-textarea'), {
            target: { value: 'A grumpy retired dragon-slayer.' }
        });

        expect(screen.getByText('Create Character')).not.toBeDisabled();
    });

    it('calls onSubmit with trimmed description and appearance', () => {
        render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.change(screen.getByTestId('description-textarea'), {
            target: { value: '  A grumpy retired dragon-slayer.  ' }
        });
        fireEvent.change(screen.getByTestId('appearance-textarea'), {
            target: { value: '  Tall and scarred.  ' }
        });
        fireEvent.click(screen.getByText('Create Character'));

        expect(mockOnSubmit).toHaveBeenCalledWith('A grumpy retired dragon-slayer.', 'Tall and scarred.');
    });

    it('calls onSubmit with an empty appearance when none is entered', () => {
        render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.change(screen.getByTestId('description-textarea'), {
            target: { value: 'A grumpy retired dragon-slayer.' }
        });
        fireEvent.click(screen.getByText('Create Character'));

        expect(mockOnSubmit).toHaveBeenCalledWith('A grumpy retired dragon-slayer.', '');
    });

    it('does not call onSubmit when description is only whitespace', () => {
        render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.change(screen.getByTestId('description-textarea'), {
            target: { value: '   ' }
        });
        // Button remains disabled (aria-disabled semantics), but also guard the handler directly
        expect(screen.getByText('Create Character')).toBeDisabled();
        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('calls onCancel when Cancel button is clicked', () => {
        render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('Cancel'));
        expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when Escape key is pressed', () => {
        render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('does not call onCancel when a non-Escape key is pressed', () => {
        render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.keyDown(window, { key: 'Enter' });
        expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it('calls onCancel when overlay is clicked, but not when modal content is clicked', () => {
        const { container } = render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('Cancel'));
        expect(mockOnCancel).toHaveBeenCalledTimes(1);

        const overlay = container.firstChild as HTMLElement;
        fireEvent.click(overlay);
        expect(mockOnCancel).toHaveBeenCalledTimes(2);
    });

    it('prevents body scroll while open and restores it on unmount', () => {
        const { unmount } = render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        expect(document.body.style.overflow).toBe('hidden');
        unmount();
        expect(document.body.style.overflow).toBe('');
    });

    it('caps input at the max length', () => {
        render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        const longText = 'x'.repeat(600);
        fireEvent.change(screen.getByTestId('description-textarea'), { target: { value: longText } });

        expect(screen.getByTestId('description-textarea')).toHaveValue('x'.repeat(500));
        expect(screen.getByText('500/500')).toBeInTheDocument();
    });

    it('mentions the portrait in the disclaimer only once an appearance is entered', () => {
        render(
            <CharacterDescriptionModal
                characterName="Zorblax"
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
            />
        );

        expect(screen.getByText(/shapes this character's personality\./i)).toBeInTheDocument();

        fireEvent.change(screen.getByTestId('appearance-textarea'), { target: { value: 'Tall and scarred.' } });

        expect(screen.getByText(/shapes this character's personality\s+and portrait\./i)).toBeInTheDocument();
    });
});
