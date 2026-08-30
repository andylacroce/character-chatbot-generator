import React from 'react';
import { render, screen } from '@testing-library/react';
import DataDeletionPage, { metadata } from '../../../app/data-deletion/page';

describe('DataDeletionPage', () => {
    it('renders the title and a link back to the app', () => {
        render(<DataDeletionPage />);
        expect(screen.getByRole('heading', { name: 'Data Deletion Instructions' })).toBeInTheDocument();
        expect(screen.getByText(/Back to Character Chatbot Generator/)).toHaveAttribute('href', '/');
    });

    it('explains guest data needs no request', () => {
        render(<DataDeletionPage />);
        expect(screen.getByText(/nothing to/)).toBeInTheDocument();
    });

    it('gives a mailto link with a prefilled subject for deletion requests', () => {
        render(<DataDeletionPage />);
        const link = screen.getByText('ccg@andrewlacroce.com');
        expect(link).toHaveAttribute('href', 'mailto:ccg@andrewlacroce.com?subject=Data%20deletion%20request');
    });

    it('notes the shared avatar cache is not personal data and is not deleted', () => {
        render(<DataDeletionPage />);
        expect(screen.getByText(/shared across all users/)).toBeInTheDocument();
    });

    it('links to the full privacy policy', () => {
        render(<DataDeletionPage />);
        expect(screen.getByText('Privacy Policy')).toHaveAttribute('href', '/privacy');
    });

    it('exports page metadata', () => {
        expect(metadata.title).toContain('Data Deletion');
    });
});
