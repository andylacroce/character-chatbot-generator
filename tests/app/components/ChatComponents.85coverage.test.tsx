/**
 * Additional branch coverage tests for various chat components
 * Targeting 85% overall branch coverage
 */

import { render, screen } from '@testing-library/react';
import ChatMessage from '../../../app/components/ChatMessage';
import type { Message } from '../../../app/components/ChatMessage';
import ChatStatus from '../../../app/components/ChatStatus';
import type { Bot } from '../../../app/components/BotCreator';

const mockBot: Bot = {
    name: 'TestBot',
    personality: 'friendly',
    avatarUrl: '/avatar.png',
    voiceConfig: {
        name: 'en-US-Wavenet-A',
        languageCodes: ['en-US'],
        ssmlGender: 1, // MALE
        pitch: 0,
        rate: 1,
    },
};

describe('ChatMessage additional branch coverage', () => {
    it('renders user message', () => {
        const message: Message = {
            sender: 'User',
            text: 'Hello',
        };
        
        render(<ChatMessage message={message} bot={mockBot} />);
        expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    it('renders bot message with audio', () => {
        const message: Message = {
            sender: 'Bot',
            text: 'Response',
            audioFileUrl: 'http://audio.mp3',
        };
        
        render(<ChatMessage message={message} bot={mockBot} />);
        expect(screen.getByText('Response')).toBeInTheDocument();
    });
});

describe('ChatStatus additional branch coverage', () => {
    it('shows nothing when no error and not retrying', () => {
        const { container } = render(
            <ChatStatus error="" retrying={false} />
        );
        // Should render null and have minimal content
        expect(container.querySelector('div')).toBeInTheDocument();
    });

    it('shows error message when error provided', () => {
        render(<ChatStatus error="Something went wrong" retrying={false} />);
        expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });

    it('shows retrying message', () => {
        render(<ChatStatus error="" retrying={true} />);
        expect(screen.getByText(/Retrying/i)).toBeInTheDocument();
    });

    it('shows both error and retrying status', () => {
        render(<ChatStatus error="Failed" retrying={true} />);
        expect(screen.getByText(/Failed/i)).toBeInTheDocument();
        expect(screen.getByText(/Retrying/i)).toBeInTheDocument();
    });
});
