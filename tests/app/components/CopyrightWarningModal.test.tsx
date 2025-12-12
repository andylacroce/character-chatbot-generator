import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CopyrightWarningModal } from '../../../app/components/CopyrightWarningModal';
import type { CharacterValidationResult } from '../../../pages/api/validate-character';

describe('CopyrightWarningModal', () => {
    const mockOnContinue = jest.fn();
    const mockOnCancel = jest.fn();
    const mockOnSelectSuggestion = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.style.overflow = '';
    });

    const warningValidation: CharacterValidationResult = {
        characterName: "Spider-Man",
        isPublicDomain: false,
        isSafe: false,
        warningLevel: "warning",
        reason: "Spider-Man is a trademarked character owned by Marvel/Disney.",
        suggestions: ["Hercules", "Beowulf", "Robin Hood"]
    };

    const cautionValidation: CharacterValidationResult = {
        characterName: "Unknown Character",
        isPublicDomain: true,
        isSafe: true,
        warningLevel: "caution",
        reason: "Status uncertain, proceed with caution.",
        suggestions: ["Zeus", "Athena", "Apollo"]
    };

    it('renders with warning level correctly', () => {
        render(
            <CopyrightWarningModal
                validation={warningValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
            />
        );

        expect(screen.getByText('Copyright/Trademark Warning')).toBeInTheDocument();
        expect(screen.getByText('"Spider-Man"')).toBeInTheDocument();
        expect(screen.getByText('Spider-Man is a trademarked character owned by Marvel/Disney.')).toBeInTheDocument();
    });

    it('renders with caution level correctly', () => {
        render(
            <CopyrightWarningModal
                validation={cautionValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
            />
        );

        expect(screen.getByText('Character Notice')).toBeInTheDocument();
        expect(screen.getByText('"Unknown Character"')).toBeInTheDocument();
    });

    it('displays suggestions when provided', () => {
        render(
            <CopyrightWarningModal
                validation={warningValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
                onSelectSuggestion={mockOnSelectSuggestion}
            />
        );

        expect(screen.getByText('Hercules')).toBeInTheDocument();
        expect(screen.getByText('Beowulf')).toBeInTheDocument();
        expect(screen.getByText('Robin Hood')).toBeInTheDocument();
    });

    it('calls onContinue when Continue Anyway button is clicked', () => {
        render(
            <CopyrightWarningModal
                validation={warningValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('Continue Anyway'));
        expect(mockOnContinue).toHaveBeenCalledTimes(1);
        expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it('calls onCancel when Cancel button is clicked', () => {
        render(
            <CopyrightWarningModal
                validation={warningValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('Cancel'));
        expect(mockOnCancel).toHaveBeenCalledTimes(1);
        expect(mockOnContinue).not.toHaveBeenCalled();
    });

    it('calls onSelectSuggestion and onCancel when a suggestion is clicked', () => {
        render(
            <CopyrightWarningModal
                validation={warningValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
                onSelectSuggestion={mockOnSelectSuggestion}
            />
        );

        fireEvent.click(screen.getByText('Hercules'));
        expect(mockOnSelectSuggestion).toHaveBeenCalledWith('Hercules');
        expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when overlay is clicked', () => {
        const { container } = render(
            <CopyrightWarningModal
                validation={warningValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
            />
        );

        const overlay = container.firstChild as HTMLElement;
        fireEvent.click(overlay);
        expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('does not call onCancel when modal content is clicked', () => {
        render(
            <CopyrightWarningModal
                validation={warningValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
            />
        );

        // Click on the title inside the modal (not the overlay)
        const title = screen.getByText('Copyright/Trademark Warning');
        fireEvent.click(title);
        expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it('calls onCancel when Escape key is pressed', () => {
        render(
            <CopyrightWarningModal
                validation={warningValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('prevents body scroll when modal is open', () => {
        const { unmount } = render(
            <CopyrightWarningModal
                validation={warningValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
            />
        );

        expect(document.body.style.overflow).toBe('hidden');
        
        unmount();
        expect(document.body.style.overflow).toBe('');
    });

    it('displays disclaimer text', () => {
        render(
            <CopyrightWarningModal
                validation={warningValidation}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
            />
        );

        expect(screen.getByText(/By continuing, you acknowledge potential copyright or trademark concerns/i)).toBeInTheDocument();
    });

    it('does not render suggestions section when suggestions array is empty', () => {
        const validationNoSuggestions: CharacterValidationResult = {
            ...warningValidation,
            suggestions: []
        };

        render(
            <CopyrightWarningModal
                validation={validationNoSuggestions}
                onContinue={mockOnContinue}
                onCancel={mockOnCancel}
            />
        );

        expect(screen.queryByText('Suggested alternatives (click to use):')).not.toBeInTheDocument();
    });
});
