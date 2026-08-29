import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthControl from '@/app/components/AuthControl';

const mockUseSession = jest.fn();
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockGetProviders = jest.fn();

jest.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
    signIn: (...args: unknown[]) => mockSignIn(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
    getProviders: () => mockGetProviders(),
}));

describe('AuthControl', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetProviders.mockResolvedValue({ google: { id: 'google', name: 'Google' } });
    });

    it('renders nothing while the session is loading', async () => {
        mockUseSession.mockReturnValue({ data: null, status: 'loading' });
        const { container } = render(<AuthControl />);
        expect(container.firstChild).toBeNull();
        // The providers effect still fires regardless of session status — flush
        // it before the test ends so setProviderIds doesn't land after teardown.
        await waitFor(() => expect(mockGetProviders).toHaveBeenCalled());
    });

    it('renders a Sign in button when unauthenticated', async () => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        render(<AuthControl />);
        expect(screen.getByLabelText('Sign in')).toBeInTheDocument();
        expect(screen.getByText('Sign in')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByLabelText('Sign in')).not.toBeDisabled());
    });

    it('signs in directly against the single active provider (no picker page)', async () => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        render(<AuthControl />);
        await waitFor(() => expect(screen.getByLabelText('Sign in')).not.toBeDisabled());

        fireEvent.click(screen.getByLabelText('Sign in'));
        expect(mockSignIn).toHaveBeenCalledWith('google');
    });

    it('signs in as the fixed test identity on the preview stub, with no prompt', async () => {
        mockGetProviders.mockResolvedValue({ 'preview-stub': { id: 'preview-stub', name: 'Preview (no real login)' } });
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        render(<AuthControl />);
        await waitFor(() => expect(screen.getByLabelText('Sign in')).not.toBeDisabled());

        fireEvent.click(screen.getByLabelText('Sign in'));
        expect(mockSignIn).toHaveBeenCalledWith('preview-stub', { email: 'preview-test@example.com' });
    });

    it('falls back to the picker page when more than one provider is configured', async () => {
        mockGetProviders.mockResolvedValue({
            google: { id: 'google', name: 'Google' },
            facebook: { id: 'facebook', name: 'Facebook' },
        });
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        render(<AuthControl />);
        await waitFor(() => expect(screen.getByLabelText('Sign in')).not.toBeDisabled());

        fireEvent.click(screen.getByLabelText('Sign in'));
        expect(mockSignIn).toHaveBeenCalledWith();
    });

    it('disables the Sign in button until providers have loaded', () => {
        mockGetProviders.mockReturnValue(new Promise(() => {})); // never resolves
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        render(<AuthControl />);
        expect(screen.getByLabelText('Sign in')).toBeDisabled();
    });

    it('does not call signIn when clicked before providers have loaded', () => {
        mockGetProviders.mockReturnValue(new Promise(() => {}));
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        render(<AuthControl />);
        fireEvent.click(screen.getByLabelText('Sign in'));
        expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('renders "Sign out (name)" when authenticated with a name', async () => {
        mockUseSession.mockReturnValue({
            data: { user: { name: 'Gandalf', email: 'gandalf@example.com' } },
            status: 'authenticated',
        });
        render(<AuthControl />);
        expect(screen.getByLabelText('Sign out')).toBeInTheDocument();
        expect(screen.getByText('Sign out (Gandalf)')).toBeInTheDocument();
        await waitFor(() => expect(mockGetProviders).toHaveBeenCalled());
    });

    it('renders plain "Sign out" when authenticated without a name', async () => {
        mockUseSession.mockReturnValue({
            data: { user: { email: 'gandalf@example.com' } },
            status: 'authenticated',
        });
        render(<AuthControl />);
        expect(screen.getByText('Sign out')).toBeInTheDocument();
        await waitFor(() => expect(mockGetProviders).toHaveBeenCalled());
    });

    it('calls signOut() when the Sign out button is clicked', async () => {
        mockUseSession.mockReturnValue({
            data: { user: { name: 'Gandalf' } },
            status: 'authenticated',
        });
        render(<AuthControl />);
        fireEvent.click(screen.getByLabelText('Sign out'));
        expect(mockSignOut).toHaveBeenCalledWith();
        await waitFor(() => expect(mockGetProviders).toHaveBeenCalled());
    });
});
