import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { Bot } from '../../app/components/BotCreator';

// Mock storage - must be defined before jest.mock call
jest.mock('../../src/utils/storage', () => ({
  setJSON: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  setVersionedJSON: jest.fn(),
}));

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => mockRouter,
}));

// Mock dynamic imports - need to capture callbacks for testing
let mockBotCreatorOnBotCreated: ((bot: Bot) => void) | null = null;
let mockChatPageOnBackToCreation: (() => void) | null = null;

jest.mock('next/dynamic', () => (importFunc: () => Promise<{ default: React.ComponentType<unknown> }>) => {
  // Return different mocks based on the import path
  const MockBotCreator = ({ onBotCreated }: { onBotCreated: (bot: Bot) => void }) => {
    mockBotCreatorOnBotCreated = onBotCreated;
    return <div data-testid="bot-creator">Bot Creator</div>;
  };
  const MockChatPage = ({ onBackToCharacterCreation }: { onBackToCharacterCreation: () => void }) => {
    mockChatPageOnBackToCreation = onBackToCharacterCreation;
    return <div data-testid="chat-page">Chat Page</div>;
  };
  
  // Check if this is for BotCreator or ChatPage by calling importFunc
  const mockImport = importFunc as unknown as { (): { then: (cb: (m: { default: React.ComponentType<unknown> }) => void) => void } };
  try {
    const result = mockImport();
    if (result && typeof result.then === 'function') {
      // Determine which component based on some heuristic
      // Since we can't easily inspect the promise, return a component that handles both
      const UniversalMock = (props: { onBotCreated?: (bot: Bot) => void; onBackToCharacterCreation?: () => void }) => {
        if (props.onBotCreated) {
          return MockBotCreator(props as { onBotCreated: (bot: Bot) => void });
        } else if (props.onBackToCharacterCreation) {
          return MockChatPage(props as { onBackToCharacterCreation: () => void });
        }
        return <div data-testid="mock-component">Mock Component</div>;
      };
      return UniversalMock;
    }
  } catch {
    // Fallback
  }
  
  return () => <div data-testid="mock-component">Mock Component</div>;
});

// Mock getValidBotFromStorage
jest.mock('../../src/utils/getValidBotFromStorage', () => ({
  getValidBotFromStorage: jest.fn(),
}));

import Home from '../../app/index';

describe('Home component URL parameter functionality', () => {
  // Use jest.requireMock so we don't rely on CommonJS require()
  // and to ensure we get the mocked module created by jest.mock above.
  // typed as jest.Mock for convenience in tests
  type GetValidBotModule = { getValidBotFromStorage: jest.Mock };
  const mockGetValidBotFromStorage = (jest.requireMock('../../src/utils/getValidBotFromStorage') as unknown as GetValidBotModule).getValidBotFromStorage;
  
  type StorageModule = { setJSON: jest.Mock; setItem: jest.Mock; removeItem: jest.Mock; setVersionedJSON: jest.Mock };
  const mockStorage = jest.requireMock('../../src/utils/storage') as unknown as StorageModule;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBotCreatorOnBotCreated = null;
    mockChatPageOnBackToCreation = null;
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
      expect(screen.getByTestId('bot-creator')).toBeInTheDocument();
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
      expect(screen.getByTestId('bot-creator')).toBeInTheDocument();
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
      expect(screen.getByTestId('chat-page')).toBeInTheDocument();
    });
  });

  it('saves bot to storage when bot is created', async () => {
    mockGetValidBotFromStorage.mockReturnValue(null);

    render(<Home />);

    await waitFor(() => {
      expect(mockBotCreatorOnBotCreated).not.toBeNull();
    });

    const newBot: Bot = {
      name: 'NewBot',
      personality: 'cheerful',
      avatarUrl: '/new-avatar.jpg',
      voiceConfig: { name: 'en-US-Wavenet-D', languageCodes: ['en-US'], ssmlGender: 1, pitch: 0, rate: 1.0, type: 'Wavenet' },
    };

    await act(async () => {
      mockBotCreatorOnBotCreated!(newBot);
    });

    await waitFor(() => {
      expect(mockStorage.setJSON).toHaveBeenCalledWith('chatbot-bot', newBot);
      expect(mockStorage.setItem).toHaveBeenCalledWith('chatbot-bot-timestamp', expect.any(String));
      expect(mockStorage.setVersionedJSON).toHaveBeenCalledWith(`voiceConfig-${newBot.name}`, newBot.voiceConfig, 1);
      expect(screen.getByTestId('chat-page')).toBeInTheDocument();
    });
  });

  it('saves bot to storage with voiceConfig when loaded from storage', async () => {
    const existingBot: Bot = {
      name: 'ExistingBot',
      personality: 'friendly',
      avatarUrl: '/avatar.jpg',
      voiceConfig: { name: 'en-US-Standard-A', languageCodes: ['en-US'], ssmlGender: 0, pitch: 0, rate: 1.0, type: 'Standard' },
    };
    mockGetValidBotFromStorage.mockReturnValue(existingBot);

    render(<Home />);

    await waitFor(() => {
      expect(mockStorage.setVersionedJSON).toHaveBeenCalledWith(`voiceConfig-${existingBot.name}`, existingBot.voiceConfig, 1);
    });
  });

  it('clears bot and returns to creator when back button is clicked', async () => {
    const existingBot: Bot = {
      name: 'ExistingBot',
      personality: 'friendly',
      avatarUrl: '/avatar.jpg',
      voiceConfig: null,
    };
    mockGetValidBotFromStorage.mockReturnValue(existingBot);

    render(<Home />);

    await waitFor(() => {
      expect(mockChatPageOnBackToCreation).not.toBeNull();
    });

    await act(async () => {
      mockChatPageOnBackToCreation!();
    });

    await waitFor(() => {
      expect(mockStorage.removeItem).toHaveBeenCalledWith('chatbot-bot');
      expect(mockStorage.removeItem).toHaveBeenCalledWith('chatbot-bot-timestamp');
      expect(mockRouter.push).toHaveBeenCalledWith('/');
      expect(screen.getByTestId('bot-creator')).toBeInTheDocument();
    });
  });
});