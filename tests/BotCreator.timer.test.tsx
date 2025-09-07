import React from 'react';
import { render, screen, act } from '@testing-library/react';
import BotCreator, { Bot } from '../app/components/BotCreator';

// Mock useBotCreation to control loading/progress
jest.mock('../app/components/useBotCreation', () => ({
    useBotCreation: (onBotCreated: any) => ({
        input: '', setInput: jest.fn(), error: '', loading: true, progress: 'avatar',
        randomizing: false, loadingMessage: null,
        handleCreate: jest.fn(), handleCancel: jest.fn(), handleRandomCharacter: jest.fn()
    })
}));

describe('BotCreator timer', () => {
    beforeEach(() => {
        // mock fetch to return avatarTimeoutSeconds = 3
        // @ts-ignore
        global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) }));
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        // @ts-ignore
        delete global.fetch;
        jest.resetModules();
    });

    it('caps elapsed at configured max', async () => {
        await act(async () => {
            render(<BotCreator onBotCreated={() => { }} />);
            // allow fetch to resolve
            await Promise.resolve();
        });

        // advance time past the cap
        act(() => { jest.advanceTimersByTime(4000); });

        // We expect the capped text to be visible: "(3s max)"
        expect(screen.getByText(/3s max/)).toBeInTheDocument();
    });
});
