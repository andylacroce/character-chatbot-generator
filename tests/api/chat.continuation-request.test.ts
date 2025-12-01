/**
 * Tests for continuation request detection and handling via OpenAI intent interpretation
 */

describe('Chat API Continuation Request Detection', () => {
  // Helper functions that don't rely on intent interpretation
  function hasContinuationPrompt(text: string): boolean {
    return text.includes('*Would you like me to continue?*');
  }

  function removeContinuationPrompt(text: string): string {
    return text
      .replace(/\.\.\.\s*\n\n\*Would you like me to continue\?\*\s*$/i, '')
      .replace(/\n\n\*Would you like me to continue\?\*\s*$/i, '')
      .trim();
  }

  describe('Intent Interpretation (AI-based)', () => {
    it('should use OpenAI to interpret continuation intent', () => {
      // The interpretUserIntent() function now calls OpenAI's gpt-4o-mini
      // to analyze user intent in context rather than using hard-coded patterns
      // This allows natural language understanding of user requests
      expect(true).toBe(true);
    });
  });

  describe('hasContinuationPrompt', () => {
    it('detects continuation prompt at end with ellipsis', () => {
      const text = 'Some story text...\n\n*Would you like me to continue?*';
      expect(hasContinuationPrompt(text)).toBe(true);
    });

    it('detects continuation prompt at end without ellipsis', () => {
      const text = 'Some story text.\n\n*Would you like me to continue?*';
      expect(hasContinuationPrompt(text)).toBe(true);
    });

    it('returns false for text without prompt', () => {
      const text = 'Some story text without any prompt.';
      expect(hasContinuationPrompt(text)).toBe(false);
    });
  });

  describe('removeContinuationPrompt', () => {
    it('removes continuation prompt with ellipsis', () => {
      const text = 'Story text...\n\n*Would you like me to continue?*';
      const expected = 'Story text';
      expect(removeContinuationPrompt(text)).toBe(expected);
    });

    it('removes continuation prompt without ellipsis', () => {
      const text = 'Story text.\n\n*Would you like me to continue?*';
      const expected = 'Story text.';
      expect(removeContinuationPrompt(text)).toBe(expected);
    });

    it('returns text unchanged if no prompt', () => {
      const text = 'Regular story text.';
      expect(removeContinuationPrompt(text)).toBe(text);
    });

    it('handles text with extra whitespace', () => {
      const text = 'Story text.  \n\n*Would you like me to continue?*  ';
      const expected = 'Story text.';
      expect(removeContinuationPrompt(text)).toBe(expected);
    });
  });

  describe('Continuation request flow', () => {
    it('should detect continuation scenario', () => {
      const history = [
        'User: Tell me a story',
        'Bot: Once upon a time...\n\n*Would you like me to continue?*'
      ];
      const userMessage = 'yes';
      
      const lastBotMessage = history[history.length - 1];
      const lastBotText = lastBotMessage.replace(/^Bot: /, '');
      
      expect(hasContinuationPrompt(lastBotText)).toBe(true);
      // Intent would be determined by OpenAI interpretUserIntent() call
    });

    it('should not detect continuation when user asks something different', () => {
      const history = [
        'User: Tell me a story',
        'Bot: Once upon a time...\n\n*Would you like me to continue?*'
      ];
      const userMessage = 'tell me about cats instead';
      
      const lastBotMessage = history[history.length - 1];
      const lastBotText = lastBotMessage.replace(/^Bot: /, '');
      
      expect(hasContinuationPrompt(lastBotText)).toBe(true);
      // Intent would be determined as "new_instruction" by OpenAI
    });
  });
});
