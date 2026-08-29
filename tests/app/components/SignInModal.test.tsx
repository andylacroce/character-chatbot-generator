import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SignInModal from '@/app/components/SignInModal';

const mockSignIn = jest.fn();

jest.mock('next-auth/react', () => ({
    signIn: (...args: unknown[]) => mockSignIn(...args),
}));

describe('SignInModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders nothing when show is false', () => {
        const { container } = render(<SignInModal show={false} onClose={jest.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders the lightbox with a Continue with Google button when show is true', () => {
        render(<SignInModal show={true} onClose={jest.fn()} />);
        expect(screen.getByTestId('sign-in-modal-backdrop')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    });

    it('calls signIn("google") when the Google button is clicked', () => {
        render(<SignInModal show={true} onClose={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
        expect(mockSignIn).toHaveBeenCalledWith('google');
    });

    it('calls onClose when the backdrop is clicked', () => {
        const onClose = jest.fn();
        render(<SignInModal show={true} onClose={onClose} />);
        fireEvent.click(screen.getByTestId('sign-in-modal-backdrop'));
        expect(onClose).toHaveBeenCalled();
    });

    it('does not call onClose when the modal content itself is clicked', () => {
        const onClose = jest.fn();
        render(<SignInModal show={true} onClose={onClose} />);
        fireEvent.click(screen.getByText('Sign in'));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when the close button is clicked', () => {
        const onClose = jest.fn();
        render(<SignInModal show={true} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close sign in'));
        expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape is pressed while shown', () => {
        const onClose = jest.fn();
        render(<SignInModal show={true} onClose={onClose} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('does not listen for Escape when not shown', () => {
        const onClose = jest.fn();
        render(<SignInModal show={false} onClose={onClose} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });
});
