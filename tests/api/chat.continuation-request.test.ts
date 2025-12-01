/**
 * Tests for continuation request detection and handling
 */

describe('Chat API Continuation Request Detection', () => {
  // Mirror the helper functions from pages/api/chat.ts
  function isAffirmativeResponse(message: string): boolean {
    // Remove punctuation and normalize
    const trimmed = message.trim().toLowerCase().replace(/[!.?,;]+$/g, '');
    const affirmatives = [
      'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'continue', 
      'go on', 'go ahead', 'please', 'please continue', 'yes please',
      'yeah please', 'keep going', 'more', 'tell me more'
    ];
    
    return affirmatives.some(aff => trimmed === aff || trimmed.startsWith(aff + ' ') || trimmed.endsWith(' ' + aff));
  }

  function hasContinuationPrompt(text: string): boolean {
    return text.includes('*Would you like me to continue?*');
  }

  function removeContinuationPrompt(text: string): string {
    return text
      .replace(/\.\.\.\s*\n\n\*Would you like me to continue\?\*\s*$/i, '')
      .replace(/\n\n\*Would you like me to continue\?\*\s*$/i, '')
      .trim();
  }

  describe('isAffirmativeResponse', () => {
    it('detects "yes"', () => {
      expect(isAffirmativeResponse('yes')).toBe(true);
      expect(isAffirmativeResponse('Yes')).toBe(true);
      expect(isAffirmativeResponse('YES')).toBe(true);
    });

    it('detects "yeah"', () => {
      expect(isAffirmativeResponse('yeah')).toBe(true);
      expect(isAffirmativeResponse('Yeah!')).toBe(true);
    });

    it('detects "sure"', () => {
      expect(isAffirmativeResponse('sure')).toBe(true);
      expect(isAffirmativeResponse('Sure thing')).toBe(true);
    });

    it('detects "continue"', () => {
      expect(isAffirmativeResponse('continue')).toBe(true);
      expect(isAffirmativeResponse('Continue please')).toBe(true);
    });

    it('detects "please continue"', () => {
      expect(isAffirmativeResponse('please continue')).toBe(true);
      expect(isAffirmativeResponse('Please continue')).toBe(true);
    });

    it('detects "yes please"', () => {
      expect(isAffirmativeResponse('yes please')).toBe(true);
      expect(isAffirmativeResponse('Yes please')).toBe(true);
    });

    it('detects "go on"', () => {
      expect(isAffirmativeResponse('go on')).toBe(true);
      expect(isAffirmativeResponse('Go on')).toBe(true);
    });

    it('detects "more"', () => {
      expect(isAffirmativeResponse('more')).toBe(true);
      expect(isAffirmativeResponse('More please')).toBe(true);
    });

    it('rejects non-affirmative responses', () => {
      expect(isAffirmativeResponse('no')).toBe(false);
      expect(isAffirmativeResponse('not now')).toBe(false);
      expect(isAffirmativeResponse('what do you mean?')).toBe(false);
      expect(isAffirmativeResponse('tell me about something else')).toBe(false);
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
      const text = 'Some complete story text.';
      expect(hasContinuationPrompt(text)).toBe(false);
    });
  });

  describe('removeContinuationPrompt', () => {
    it('removes continuation prompt with ellipsis', () => {
      const text = 'Some story text...\n\n*Would you like me to continue?*';
      const result = removeContinuationPrompt(text);
      expect(result).toBe('Some story text');
    });

    it('removes continuation prompt without ellipsis', () => {
      const text = 'Some story text.\n\n*Would you like me to continue?*';
      const result = removeContinuationPrompt(text);
      expect(result).toBe('Some story text.');
    });

    it('returns text unchanged if no prompt', () => {
      const text = 'Some complete story text.';
      const result = removeContinuationPrompt(text);
      expect(result).toBe(text);
    });

    it('handles text with extra whitespace', () => {
      const text = 'Some story text...  \n\n*Would you like me to continue?*  ';
      const result = removeContinuationPrompt(text);
      expect(result).toBe('Some story text');
    });
  });

  describe('Continuation request flow', () => {
    it('should detect continuation scenario', () => {
      const conversationHistory = [
        'User: Tell me a story',
        'Bot: Once upon a time in a faraway land...\n\n*Would you like me to continue?*'
      ];
      
      const lastBotMessage = conversationHistory[conversationHistory.length - 1];
      const lastBotText = lastBotMessage.replace(/^Bot: /, '');
      
      expect(hasContinuationPrompt(lastBotText)).toBe(true);
      expect(isAffirmativeResponse('yes')).toBe(true);
      
      const cleanedText = removeContinuationPrompt(lastBotText);
      expect(cleanedText).not.toContain('*Would you like me to continue?*');
    });

    it('should not detect continuation when user asks something different', () => {
      const conversationHistory = [
        'User: Tell me a story',
        'Bot: Once upon a time in a faraway land...\n\n*Would you like me to continue?*'
      ];
      
      const lastBotMessage = conversationHistory[conversationHistory.length - 1];
      const lastBotText = lastBotMessage.replace(/^Bot: /, '');
      
      expect(hasContinuationPrompt(lastBotText)).toBe(true);
      expect(isAffirmativeResponse('Tell me about something else')).toBe(false);
    });
  });
});
