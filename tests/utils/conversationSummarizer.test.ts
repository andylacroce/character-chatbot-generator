import { summarizeConversation, buildClaudeMessages } from '../../src/utils/conversationSummarizer';
import type { ClaudeMessage } from '../../src/utils/conversationSummarizer';

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// ---------------------------------------------------------------------------
// buildClaudeMessages
// ---------------------------------------------------------------------------

describe('buildClaudeMessages', () => {
  it('converts User: prefix to role "user"', () => {
    const result = buildClaudeMessages(['User: Hello'], 'Hi back');
    expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('converts Bot: prefix to role "assistant"', () => {
    const result = buildClaudeMessages(['Bot: I am fine'], 'next');
    expect(result[0]).toEqual({ role: 'assistant', content: 'I am fine' });
  });

  it('appends the new user message at the end', () => {
    const result = buildClaudeMessages([], 'New message');
    expect(result).toEqual([{ role: 'user', content: 'New message' }]);
  });

  it('ignores entries that do not start with User: or Bot:', () => {
    const result = buildClaudeMessages(['System: some log', 'User: hello'], 'world');
    expect(result).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'user', content: 'world' },
    ]);
  });

  it('builds a full alternating conversation correctly', () => {
    const history = ['User: Hi', 'Bot: Hey', 'User: How are you?', 'Bot: Great'];
    const result = buildClaudeMessages(history, 'Bye');
    expect(result).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hey' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'Great' },
      { role: 'user', content: 'Bye' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// summarizeConversation
// ---------------------------------------------------------------------------

describe('summarizeConversation', () => {
  const messages: ClaudeMessage[] = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
  ];

  function makeAnthropic(textResponse: string) {
    return {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: textResponse }],
        }),
      },
    };
  }

  it('returns the trimmed text from a successful Claude response', async () => {
    const anthropic = makeAnthropic('  This is a summary.  ');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await summarizeConversation(anthropic as any, messages, 'Bot');
    expect(result).toBe('This is a summary.');
  });

  it('uses the bot name in the conversation text passed to Claude', async () => {
    const anthropic = makeAnthropic('summary');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await summarizeConversation(anthropic as any, messages, 'Sherlock');
    const callArg = (anthropic.messages.create as jest.Mock).mock.calls[0][0];
    expect(callArg.messages[0].content).toContain('Sherlock:');
  });

  it('formats user messages with "User:" prefix', async () => {
    const anthropic = makeAnthropic('summary');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await summarizeConversation(anthropic as any, messages, 'Bot');
    const callArg = (anthropic.messages.create as jest.Mock).mock.calls[0][0];
    expect(callArg.messages[0].content).toContain('User:');
  });

  it('returns fallback text when the response has no text content', async () => {
    const anthropic = {
      messages: {
        create: jest.fn().mockResolvedValue({ content: [{ type: 'image' }] }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await summarizeConversation(anthropic as any, messages, 'Bot');
    expect(result).toBe('Previous conversation history.');
  });

  it('returns fallback text and does not throw when Claude rejects', async () => {
    const anthropic = {
      messages: { create: jest.fn().mockRejectedValue(new Error('API down')) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await summarizeConversation(anthropic as any, messages, 'Bot');
    expect(result).toBe('Previous conversation covered various topics.');
  });
});
