/**
 * Tests for graceful text wrapping in chat responses
 */

describe('Chat API Text Wrapping', () => {
  // Mirror the function from pages/api/chat.ts for testing
  function wrapTextGracefully(text: string, lookbackChars: number = 200): string {
    const trimmed = text.trim();
    if (!trimmed) return text;
    
    // If text already ends well, no need to wrap
    if (/[.!?。！？][\s"'»]*$/.test(trimmed)) {
      return text;
    }
    
    // Look for the last sentence-ending punctuation within lookback range
    const lookbackStart = Math.max(0, trimmed.length - lookbackChars);
    const searchSection = trimmed.substring(lookbackStart);
    
    // Find all sentence endings in the search section
    const sentenceEndMatches = [...searchSection.matchAll(/[.!?。！？][\s"'»]*/g)];
    
    if (sentenceEndMatches.length > 0) {
      // Get the last match
      const lastMatch = sentenceEndMatches[sentenceEndMatches.length - 1];
      if (lastMatch.index !== undefined) {
        const cutPoint = lookbackStart + lastMatch.index + lastMatch[0].length;
        const wrappedText = trimmed.substring(0, cutPoint).trim();
        
        // Only use this if we're not cutting off too much (more than 30% of lookback)
        const cutAmount = trimmed.length - cutPoint;
        if (cutAmount < lookbackChars * 0.3) {
          return wrappedText + "\n\n*Would you like me to continue?*";
        }
      }
    }
    
    // If no good stopping point found, add continuation prompt to existing text
    return text.trim() + "...\n\n*Would you like me to continue?*";
  }

  describe('wrapTextGracefully', () => {
    it('returns text unchanged if it already ends with proper punctuation', () => {
      const text = 'This is a complete sentence.';
      expect(wrapTextGracefully(text)).toBe(text);
    });

    it('returns text unchanged if it ends with exclamation mark', () => {
      const text = 'What a wonderful day!';
      expect(wrapTextGracefully(text)).toBe(text);
    });

    it('returns text unchanged if it ends with question mark', () => {
      const text = 'How are you today?';
      expect(wrapTextGracefully(text)).toBe(text);
    });

    it('adds ellipsis and prompt if no sentence ending found in lookback range', () => {
      const text = 'This text just keeps going and going without any proper ending and it never stops';
      const result = wrapTextGracefully(text);
      expect(result).toContain('...');
      expect(result).toContain('*Would you like me to continue?*');
    });

    it('cuts at last sentence within lookback range and adds prompt', () => {
      const text = 'First sentence. Second sentence. And then some incomplete text that goes';
      const result = wrapTextGracefully(text);
      expect(result).toContain('Second sentence.');
      expect(result).toContain('*Would you like me to continue?*');
      expect(result).not.toContain('incomplete text');
    });

    it('does not cut if too much text would be removed', () => {
      // Create text where the last sentence is far from the end
      const text = 'Complete sentence. ' + 'x'.repeat(200);
      const result = wrapTextGracefully(text);
      // Should keep all the text and add ellipsis since cutting would remove too much
      expect(result).toContain('xxx');
      expect(result).toContain('...');
      expect(result).toContain('*Would you like me to continue?*');
    });

    it('handles empty text gracefully', () => {
      const text = '';
      expect(wrapTextGracefully(text)).toBe(text);
    });

    it('handles whitespace-only text', () => {
      const text = '   ';
      const result = wrapTextGracefully(text);
      expect(result).toBe(text);
    });

    it('handles text with multiple sentences in lookback range', () => {
      const longStart = 'A'.repeat(500);
      const text = longStart + ' First. Second. Third. And incomplete';
      const result = wrapTextGracefully(text);
      // Should cut at "Third." since it's the last complete sentence in range
      expect(result).toContain('Third.');
      expect(result).toContain('*Would you like me to continue?*');
      expect(result).not.toContain('incomplete');
    });

    it('respects custom lookback range', () => {
      const text = 'Sentence one. Sentence two. Incomplete text here';
      const result = wrapTextGracefully(text, 30);
      // With smaller lookback, should find "Sentence two."
      expect(result).toContain('Sentence two.');
      expect(result).toContain('*Would you like me to continue?*');
    });

    it('handles text with quotes after punctuation', () => {
      const text = 'He said "Hello." And then more incomplete';
      const result = wrapTextGracefully(text);
      expect(result).toContain('He said "Hello."');
      expect(result).toContain('*Would you like me to continue?*');
    });
  });
});
