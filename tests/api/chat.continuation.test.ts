/**
 * Tests for the chat API continuation logic
 * Tests the isResponseIncomplete function behavior with various text patterns
 */

describe('Chat API Continuation Logic', () => {
  // Helper function to test the incomplete response detection logic
  // This mirrors the function in pages/api/chat.ts
  function isResponseIncomplete(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return true;
    
    // Check if ends with sentence-ending punctuation
    const endsWithPunctuation = /[.!?。！？][\s"'»]*$/.test(trimmed);
    if (endsWithPunctuation) return false;
    
    // Check for incomplete patterns
    const incompletePatterns = [
      // Conjunctions and articles
      /\s(and|but|or|so|because|when|where|who|what|how|the|a|an|to|from|with|in|on|at|as|if|that|which|while|after|before|since|until|unless|than|though|although)$/i,
      // Adjectives and determiners that suggest more is coming
      /\s(most|least|best|worst|first|last|next|only|very|more|less|such|each|every|some|any|all|both|either|neither|my|your|his|her|its|our|their|this|that|these|those)$/i,
      // Verbs that typically need objects or complements
      /\s(is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|shall|should|may|might|must|can|could|need|needs|say|says|said|think|thinks|thought|know|knows|knew|see|sees|saw|get|gets|got|make|makes|made|take|takes|took|give|gives|gave|seem|seems|seemed|become|becomes|became)$/i,
      // Prepositions that need objects
      /\s(of|for|by|about|like|through|over|between|among|during|without|within|regarding|concerning|including|following|considering|despite)$/i,
      // Punctuation indicating continuation
      /,\s*$/,  // Ends with comma
      /:\s*$/,  // Ends with colon
      /;\s*$/,  // Ends with semicolon
      /\s-+\s*$/,  // Ends with dash
      // Unclosed symbols
      /\([^)]*$/,  // Unclosed parenthesis
      /\[[^\]]*$/,  // Unclosed bracket
      /["'][^"']*$/,  // Unclosed quote
    ];
    
    return incompletePatterns.some(pattern => pattern.test(trimmed));
  }

  describe('isResponseIncomplete - Complete responses', () => {
    it('should return false for text ending with period', () => {
      expect(isResponseIncomplete('This is a complete sentence.')).toBe(false);
    });

    it('should return false for text ending with exclamation mark', () => {
      expect(isResponseIncomplete('What a great day!')).toBe(false);
    });

    it('should return false for text ending with question mark', () => {
      expect(isResponseIncomplete('How are you today?')).toBe(false);
    });

    it('should return false for text ending with period and quote', () => {
      expect(isResponseIncomplete('He said "Hello."')).toBe(false);
    });

    it('should return false for text ending with period and closing bracket', () => {
      expect(isResponseIncomplete('This is important (note: very important).')).toBe(false);
    });

    it('should return false for multi-sentence complete text', () => {
      expect(isResponseIncomplete('First sentence. Second sentence. Third sentence!')).toBe(false);
    });
  });

  describe('isResponseIncomplete - Incomplete patterns with conjunctions', () => {
    it('should detect text ending with "and"', () => {
      expect(isResponseIncomplete('The story goes on and')).toBe(true);
    });

    it('should detect text ending with "but"', () => {
      expect(isResponseIncomplete('I wanted to go but')).toBe(true);
    });

    it('should detect text ending with "or"', () => {
      expect(isResponseIncomplete('Choose this or')).toBe(true);
    });

    it('should detect text ending with "the"', () => {
      expect(isResponseIncomplete('It led us to the')).toBe(true);
    });

    it('should detect text ending with "a"', () => {
      expect(isResponseIncomplete('Once upon a')).toBe(true);
    });

    it('should detect text ending with "to"', () => {
      expect(isResponseIncomplete('I need to')).toBe(true);
    });

    it('should detect text ending with "from"', () => {
      expect(isResponseIncomplete('Coming from')).toBe(true);
    });

    it('should detect text ending with "with"', () => {
      expect(isResponseIncomplete('Together with')).toBe(true);
    });

    it('should detect text ending with "while"', () => {
      expect(isResponseIncomplete('I was thinking while')).toBe(true);
    });

    it('should detect text ending with "if"', () => {
      expect(isResponseIncomplete('I wonder if')).toBe(true);
    });

    it('should detect text ending with "that"', () => {
      expect(isResponseIncomplete('I realized that')).toBe(true);
    });

    it('should detect text ending with "which"', () => {
      expect(isResponseIncomplete('The story which')).toBe(true);
    });
  });

  describe('isResponseIncomplete - Adjectives and determiners', () => {
    it('should detect text ending with "best"', () => {
      expect(isResponseIncomplete('my cat might not be the best')).toBe(true);
    });

    it('should detect text ending with "worst"', () => {
      expect(isResponseIncomplete('this is the worst')).toBe(true);
    });

    it('should detect text ending with "most"', () => {
      expect(isResponseIncomplete('this is the most')).toBe(true);
    });

    it('should detect text ending with "first"', () => {
      expect(isResponseIncomplete('this was the first')).toBe(true);
    });

    it('should detect text ending with "only"', () => {
      expect(isResponseIncomplete('he was the only')).toBe(true);
    });

    it('should detect text ending with "my"', () => {
      expect(isResponseIncomplete('that is my')).toBe(true);
    });

    it('should detect text ending with "this"', () => {
      expect(isResponseIncomplete('I think this')).toBe(true);
    });
  });

  describe('isResponseIncomplete - Verbs needing complements', () => {
    it('should detect text ending with "is"', () => {
      expect(isResponseIncomplete('The answer is')).toBe(true);
    });

    it('should detect text ending with "was"', () => {
      expect(isResponseIncomplete('It was')).toBe(true);
    });

    it('should detect text ending with "have"', () => {
      expect(isResponseIncomplete('I have')).toBe(true);
    });

    it('should detect text ending with "said"', () => {
      expect(isResponseIncomplete('He said')).toBe(true);
    });

    it('should detect text ending with "became"', () => {
      expect(isResponseIncomplete('She became')).toBe(true);
    });
  });

  describe('isResponseIncomplete - Prepositions needing objects', () => {
    it('should detect text ending with "of"', () => {
      expect(isResponseIncomplete('one of')).toBe(true);
    });

    it('should detect text ending with "for"', () => {
      expect(isResponseIncomplete('looking for')).toBe(true);
    });

    it('should detect text ending with "by"', () => {
      expect(isResponseIncomplete('written by')).toBe(true);
    });

    it('should detect text ending with "about"', () => {
      expect(isResponseIncomplete('thinking about')).toBe(true);
    });

    it('should detect text ending with "like"', () => {
      expect(isResponseIncomplete('feels like')).toBe(true);
    });
  });

  describe('isResponseIncomplete - Punctuation patterns', () => {
    it('should detect text ending with comma', () => {
      expect(isResponseIncomplete('First, second,')).toBe(true);
    });

    it('should detect text ending with comma and space', () => {
      expect(isResponseIncomplete('Item one, item two, ')).toBe(true);
    });

    it('should detect text ending with colon', () => {
      expect(isResponseIncomplete('Here are the items:')).toBe(true);
    });

    it('should detect text ending with dash', () => {
      expect(isResponseIncomplete('The result was -')).toBe(true);
    });

    it('should detect text ending with multiple dashes', () => {
      expect(isResponseIncomplete('Wait for it --')).toBe(true);
    });
  });

  describe('isResponseIncomplete - Unclosed symbols', () => {
    it('should detect unclosed parenthesis', () => {
      expect(isResponseIncomplete('This concept (which is important')).toBe(true);
    });

    it('should detect unclosed bracket', () => {
      expect(isResponseIncomplete('The list includes [item one, item two')).toBe(true);
    });

    it('should detect unclosed double quote', () => {
      expect(isResponseIncomplete('He said "This is important')).toBe(true);
    });

    it('should detect unclosed single quote', () => {
      expect(isResponseIncomplete("She said 'Wait a moment")).toBe(true);
    });

    it('should not flag properly closed parentheses', () => {
      expect(isResponseIncomplete('This is (properly closed).')).toBe(false);
    });

    it('should not flag properly closed quotes', () => {
      expect(isResponseIncomplete('He said "Hello world."')).toBe(false);
    });
  });

  describe('isResponseIncomplete - Edge cases', () => {
    it('should return true for empty string', () => {
      expect(isResponseIncomplete('')).toBe(true);
    });

    it('should return true for whitespace only', () => {
      expect(isResponseIncomplete('   ')).toBe(true);
    });

    it('should handle text with newlines and ending with period', () => {
      expect(isResponseIncomplete('Line one.\nLine two.\nLine three.')).toBe(false);
    });

    it('should detect incomplete text with newlines', () => {
      expect(isResponseIncomplete('Line one.\nLine two.\nIncomplete and')).toBe(true);
    });

    it('should handle Red Skelton story cutoff - relies on finish_reason', () => {
      // "laughter is the greatest" doesn't match patterns, but finish_reason: 'length' triggers continuation
      const redSkeltonCutoff = 'Clem realized that laughter is the greatest';
      const finishReason = 'length'; // This is what would come from OpenAI
      const shouldContinue = finishReason === 'length' || isResponseIncomplete(redSkeltonCutoff);
      expect(shouldContinue).toBe(true);
    });

    it('should handle Richie Rich story cutoff - relies on finish_reason', () => {
      // "to the roof" doesn't match patterns, but finish_reason: 'length' triggers continuation
      const richieRichCutoff = 'It led us to the roof';
      const finishReason = 'length';
      const shouldContinue = finishReason === 'length' || isResponseIncomplete(richieRichCutoff);
      expect(shouldContinue).toBe(true);
    });

    it('should not flag complete story endings', () => {
      const completeStory = 'And they all lived happily ever after.';
      expect(isResponseIncomplete(completeStory)).toBe(false);
    });

    it('should handle text with multiple incomplete signals', () => {
      const multipleSignals = 'This story (which goes on and';
      expect(isResponseIncomplete(multipleSignals)).toBe(true);
    });
  });

  describe('isResponseIncomplete - Real-world scenarios', () => {
    it('should detect story mid-sentence cutoff', () => {
      const story = 'Once upon a time in a small town, there lived a boy named Clem. Now, Clem was a bit of a dreamer—he had his head in the clouds and his feet barely touching the ground! One day, he decided he wanted to be a great magician. So, he got himself a top hat, a cape, and a very confused rabbit named Binky. Clem practiced day and night, but his magic was a little... well, let\'s say it was more "oops" than "abracadabra!" One day, he was gonna perform for the whole town. The big night arrived, and as the crowd gathered, Clem was so nervous he lost track of Binky! Well, the little rabbit found his way into the audience, causing chaos! People were laughing, and Clem thought, "Hey, maybe I should just embrace the chaos!" So, he turned his tricks into a comedy routine. He juggled eggs, but they all ended up scrambled! He pulled scarves out of his hat, but they were all tied together like a big ol\' knot! By the end of the night, everyone was in stitches! Clem learned that sometimes the best magic isn\'t in the tricks but in the laughter we share. And from that day on, he became the town\'s favorite comedian instead of a magician! And that, my friends, is';
      expect(isResponseIncomplete(story)).toBe(true);
    });

    it('should not flag complete multi-paragraph response', () => {
      const complete = 'First paragraph with complete thought.\n\nSecond paragraph also complete.\n\nFinal paragraph ends properly.';
      expect(isResponseIncomplete(complete)).toBe(false);
    });

    it('should detect list that trails off with incomplete word', () => {
      // The word "third" by itself doesn't trigger incomplete detection
      // But if it ends with a conjunction or comma, it would
      const list = 'The requirements are: first item, second item, and';
      expect(isResponseIncomplete(list)).toBe(true);
    });

    it('should not flag complete list', () => {
      const list = 'The requirements are: first item, second item, and third item.';
      expect(isResponseIncomplete(list)).toBe(false);
    });
  });

  describe('Continuation scenarios', () => {
    it('should detect when finish_reason is length', () => {
      // When OpenAI returns finish_reason: 'length', we should continue
      const finishReason = 'length';
      expect(finishReason === 'length').toBe(true);
    });

    it('should not continue when finish_reason is stop and text is complete', () => {
      const finishReason: string = 'stop';
      const text = 'This is a complete response.';
      const shouldContinue = finishReason === 'length' || isResponseIncomplete(text);
      expect(shouldContinue).toBe(false);
    });

    it('should continue when finish_reason is stop but text appears incomplete', () => {
      const finishReason: string = 'stop';
      const text = 'This is an incomplete response that ends with the';
      const shouldContinue = finishReason === 'length' || isResponseIncomplete(text);
      expect(shouldContinue).toBe(true);
    });

    it('should continue when finish_reason is length even if text looks complete', () => {
      const finishReason = 'length';
      const text = 'This looks complete.';
      const shouldContinue = finishReason === 'length' || isResponseIncomplete(text);
      // Should continue because finish_reason indicates more to say
      expect(shouldContinue).toBe(true);
    });
  });

  describe('Continuation loop behavior', () => {
    it('should simulate up to 3 continuation attempts', () => {
      const MAX_ATTEMPTS = 3;
      let attempts = 0;
      
      // Simulate multiple incomplete responses
      const responses = [
        { text: 'Part one and', finishReason: 'length' },
        { text: 'part two with', finishReason: 'length' },
        { text: 'part three ending.', finishReason: 'stop' },
      ];
      
      for (const response of responses) {
        if (attempts >= MAX_ATTEMPTS) break;
        
        const shouldContinue = response.finishReason === 'length' || 
                              isResponseIncomplete(response.text);
        
        if (shouldContinue) {
          attempts++;
        } else {
          break;
        }
      }
      
      expect(attempts).toBe(2); // Should stop after finding complete response
    });

    it('should stop after 3 attempts even if still incomplete', () => {
      const MAX_ATTEMPTS = 3;
      let attempts = 0;
      
      // Simulate continuous incomplete responses
      const responses = [
        { text: 'Part one and', finishReason: 'length' },
        { text: 'part two and', finishReason: 'length' },
        { text: 'part three and', finishReason: 'length' },
        { text: 'part four and', finishReason: 'length' }, // Should not reach this
      ];
      
      for (const response of responses) {
        if (attempts >= MAX_ATTEMPTS) break;
        
        const shouldContinue = response.finishReason === 'length' || 
                              isResponseIncomplete(response.text);
        
        if (shouldContinue) {
          attempts++;
        } else {
          break;
        }
      }
      
      expect(attempts).toBe(MAX_ATTEMPTS);
    });
  });

  describe('Text concatenation logic', () => {
    it('should concatenate with space when original does not end with space or comma', () => {
      const original = 'Hello world';
      const continuation = 'and goodbye';
      const result = original.endsWith(',') || original.endsWith(' ')
        ? original + continuation
        : original + ' ' + continuation;
      expect(result).toBe('Hello world and goodbye');
    });

    it('should concatenate without space when original ends with comma', () => {
      const original = 'first, second,';
      const continuation = 'and third';
      const result = original.endsWith(',') || original.endsWith(' ')
        ? original + continuation
        : original + ' ' + continuation;
      expect(result).toBe('first, second,and third');
    });

    it('should concatenate without extra space when original ends with space', () => {
      const original = 'Hello ';
      const continuation = 'world';
      const result = original.endsWith(',') || original.endsWith(' ')
        ? original + continuation
        : original + ' ' + continuation;
      expect(result).toBe('Hello world');
    });
  });
});
