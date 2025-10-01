import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Bot } from '../app/components/BotCreator';

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => mockRouter,
}));

// Mock dynamic imports
jest.mock('next/dynamic', () => (importFunc: any) => {
  const MockComponent = () => <div data-testid="mock-component">Mock Component</div>;
  return MockComponent;
});

// Mock getValidBotFromStorage
jest.mock('../src/utils/getValidBotFromStorage', () => ({
  getValidBotFromStorage: jest.fn(),
}));

import Home from '../app/index';

describe('Home component URL parameter functionality', () => {
  const mockGetValidBotFromStorage = require('../src/utils/getValidBotFromStorage').getValidBotFromStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset search params
    mockSearchParams.delete('name');
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true,
    });
  });

  it('shows BotCreator when no bot exists and no name parameter', async () => {
    mockGetValidBotFromStorage.mockReturnValue(null);

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-component')).toBeInTheDocument();
    });
  });

  it('shows BotCreator when name parameter is present, even if bot exists', async () => {
    const existingBot: Bot = {
      name: 'ExistingBot',
      personality: 'friendly',
      avatarUrl: '/avatar.jpg',
      voiceConfig: null,
    };
    mockGetValidBotFromStorage.mockReturnValue(existingBot);
    mockSearchParams.set('name', 'Sherlock Holmes');

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-component')).toBeInTheDocument();
    });

    // Verify that getValidBotFromStorage was not called since name param exists
    expect(mockGetValidBotFromStorage).not.toHaveBeenCalled();
  });

  it('loads existing bot when no name parameter is present', async () => {
    const existingBot: Bot = {
      name: 'ExistingBot',
      personality: 'friendly',
      avatarUrl: '/avatar.jpg',
      voiceConfig: null,
    };
    mockGetValidBotFromStorage.mockReturnValue(existingBot);

    render(<Home />);

    await waitFor(() => {
      expect(mockGetValidBotFromStorage).toHaveBeenCalled();
    });
  });
});