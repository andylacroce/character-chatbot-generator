import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ResumeBotDropdown from '@/app/components/ResumeBotDropdown';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock('@/src/utils/api', () => ({
    authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

describe('ResumeBotDropdown', () => {
    const mockOnSelect = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders nothing while the session is loading', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'loading' });
        const { container } = render(<ResumeBotDropdown onSelect={mockOnSelect} />);
        expect(container.firstChild).toBeNull();
        expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
    });

    it('renders nothing for a guest', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        const { container } = render(<ResumeBotDropdown onSelect={mockOnSelect} />);
        expect(container.firstChild).toBeNull();
        expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
    });

    it('fetches /api/bots when authenticated and renders nothing if the list is empty', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated' });
        mockAuthenticatedFetch.mockResolvedValue({ json: async () => ({ bots: [] }) });
        const { container } = render(<ResumeBotDropdown onSelect={mockOnSelect} />);
        await waitFor(() => expect(mockAuthenticatedFetch).toHaveBeenCalledWith('/api/bots'));
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when the fetch fails', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated' });
        mockAuthenticatedFetch.mockRejectedValue(new Error('network down'));
        const { container } = render(<ResumeBotDropdown onSelect={mockOnSelect} />);
        await waitFor(() => expect(mockAuthenticatedFetch).toHaveBeenCalled());
        await waitFor(() => expect(container.firstChild).toBeNull());
    });

    it('renders a dropdown of saved characters, each labeled with a relative last-updated time, and calls onSelect with the mapped Bot shape', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated' });
        const bots = [
            { id: 'b1', name: 'Dracula', personality: 'A vampire.', avatarUrl: 'https://blob.example.com/d.png', gender: 'male', voiceConfig: { languageCodes: ['en-US'], name: 'v1', ssmlGender: 1 }, updatedAt: new Date(Date.now() - 3 * 60000).toISOString() },
            { id: 'b2', name: 'Cleopatra', personality: 'A queen.', avatarUrl: null, gender: 'female', voiceConfig: null, updatedAt: new Date(Date.now() - 2 * 3600000).toISOString() },
        ];
        mockAuthenticatedFetch.mockResolvedValue({ json: async () => ({ bots }) });

        render(<ResumeBotDropdown onSelect={mockOnSelect} />);

        const select = await screen.findByLabelText('Continue a previous conversation');
        expect(screen.getByText('Dracula — a few minutes ago')).toBeInTheDocument();
        expect(screen.getByText('Cleopatra — 2 hours ago')).toBeInTheDocument();

        fireEvent.change(select, { target: { value: 'b1' } });
        expect(mockOnSelect).toHaveBeenCalledWith({
            name: 'Dracula',
            personality: 'A vampire.',
            avatarUrl: 'https://blob.example.com/d.png',
            voiceConfig: { languageCodes: ['en-US'], name: 'v1', ssmlGender: 1 },
            gender: 'male',
        });
    });

    it('labels a character updated about a day ago as "yesterday"', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated' });
        mockAuthenticatedFetch.mockResolvedValue({
            json: async () => ({
                bots: [{ id: 'b3', name: 'Robin Hood', personality: 'An outlaw.', avatarUrl: null, gender: 'male', voiceConfig: null, updatedAt: new Date(Date.now() - 25 * 3600000).toISOString() }],
            }),
        });

        render(<ResumeBotDropdown onSelect={mockOnSelect} />);

        expect(await screen.findByText('Robin Hood — yesterday')).toBeInTheDocument();
    });

    it('falls back to /silhouette.svg when the saved avatarUrl is null', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated' });
        mockAuthenticatedFetch.mockResolvedValue({
            json: async () => ({ bots: [{ id: 'b2', name: 'Cleopatra', personality: 'A queen.', avatarUrl: null, gender: 'female', voiceConfig: null, updatedAt: new Date().toISOString() }] }),
        });

        render(<ResumeBotDropdown onSelect={mockOnSelect} />);
        const select = await screen.findByLabelText('Continue a previous conversation');
        fireEvent.change(select, { target: { value: 'b2' } });

        expect(mockOnSelect).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: '/silhouette.svg' }));
    });

    it('ignores a change event for an unknown option value', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated' });
        mockAuthenticatedFetch.mockResolvedValue({
            json: async () => ({ bots: [{ id: 'b1', name: 'Dracula', personality: 'A vampire.', avatarUrl: null, gender: null, voiceConfig: null, updatedAt: new Date().toISOString() }] }),
        });

        render(<ResumeBotDropdown onSelect={mockOnSelect} />);
        const select = await screen.findByLabelText('Continue a previous conversation');
        fireEvent.change(select, { target: { value: 'nonexistent' } });

        expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('clears the list and re-fetches nothing further once the session drops to unauthenticated', async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated' });
        mockAuthenticatedFetch.mockResolvedValue({
            json: async () => ({ bots: [{ id: 'b1', name: 'Dracula', personality: 'A vampire.', avatarUrl: null, gender: null, voiceConfig: null, updatedAt: new Date().toISOString() }] }),
        });

        const { rerender, container } = render(<ResumeBotDropdown onSelect={mockOnSelect} />);
        await screen.findByLabelText('Continue a previous conversation');

        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        rerender(<ResumeBotDropdown onSelect={mockOnSelect} />);

        expect(container.firstChild).toBeNull();
    });
});
