import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import BotCreator from '../app/components/BotCreator';

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

describe('BotCreator URL parameter functionality', () => {
    beforeEach(() => {
        // Reset search params
        mockSearchParams.delete('name');
        // mock fetch to return avatarTimeoutSeconds = 3
        // @ts-ignore
        global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) }));
    });

    afterEach(() => {
        // @ts-ignore
        delete global.fetch;
        jest.resetModules();
    });

    it('prepopulates input field when name parameter is provided', async () => {
        mockSearchParams.set('name', 'Sherlock Holmes');

        render(<BotCreator onBotCreated={() => { }} />);

        const input = screen.getByLabelText('Character name') as HTMLInputElement;
        await waitFor(() => {
            expect(input.value).toBe('Sherlock Holmes');
        });
    });
});