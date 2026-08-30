import React from 'react';
import { render, screen } from '@testing-library/react';
import PrivacyPage, { metadata } from '../../../app/privacy/page';

describe('PrivacyPage', () => {
    it('renders the title and a link back to the app', () => {
        render(<PrivacyPage />);
        expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
        expect(screen.getByText(/Back to Character Chatbot Generator/)).toHaveAttribute('href', '/');
    });

    it('explains guest (no-account) data stays local', () => {
        render(<PrivacyPage />);
        expect(screen.getByText(/stored only in your own browser/)).toBeInTheDocument();
    });

    it('lists the third-party services that process data', () => {
        render(<PrivacyPage />);
        expect(screen.getAllByText(/Anthropic/).length).toBeGreaterThan(0);
        expect(screen.getByText(/Neon/)).toBeInTheDocument();
        expect(screen.getByText(/Vercel/)).toBeInTheDocument();
    });

    it('links to the data deletion page', () => {
        render(<PrivacyPage />);
        expect(screen.getByText('data deletion instructions')).toHaveAttribute('href', '/data-deletion');
    });

    it('provides a contact email', () => {
        render(<PrivacyPage />);
        expect(screen.getByText('ccg@andrewlacroce.com')).toHaveAttribute('href', 'mailto:ccg@andrewlacroce.com');
    });

    it('exports page metadata', () => {
        expect(metadata.title).toContain('Privacy Policy');
    });
});
