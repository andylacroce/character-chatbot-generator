import {
  decodeHtmlEntities,
  escapeHtml,
  unescapeString,
  sanitizeForDisplay,
  sanitizeForReact,
  sanitizeCharacterName,
} from '../src/utils/security';

describe('Security Utils', () => {
  describe('decodeHtmlEntities', () => {
    it('should return empty string for non-string input', () => {
  expect(decodeHtmlEntities(null as unknown as string)).toBe('');
  expect(decodeHtmlEntities(undefined as unknown as string)).toBe('');
  expect(decodeHtmlEntities(123 as unknown as string)).toBe('');
    });

    it('should decode named HTML entities', () => {
      expect(decodeHtmlEntities('&amp;')).toBe('&');
      expect(decodeHtmlEntities('&lt;')).toBe('<');
      expect(decodeHtmlEntities('&gt;')).toBe('>');
      expect(decodeHtmlEntities('&quot;')).toBe('"');
      expect(decodeHtmlEntities('&#39;')).toBe("'");
      expect(decodeHtmlEntities('&#x27;')).toBe("'");
      expect(decodeHtmlEntities('&#x2F;')).toBe('/');
      expect(decodeHtmlEntities('&#x60;')).toBe('`');
      expect(decodeHtmlEntities('&#x3D;')).toBe('=');
    });

    it('should decode decimal numeric entities', () => {
      expect(decodeHtmlEntities('&#39;')).toBe("'"); // apostrophe
      expect(decodeHtmlEntities('&#65;')).toBe('A'); // capital A
      expect(decodeHtmlEntities('&#233;')).toBe('é'); // e with acute
    });

    it('should decode hexadecimal numeric entities', () => {
      expect(decodeHtmlEntities('&#x27;')).toBe("'"); // apostrophe
      expect(decodeHtmlEntities('&#x41;')).toBe('A'); // capital A
      expect(decodeHtmlEntities('&#xE9;')).toBe('é'); // e with acute
    });

    it('should leave unknown entities unchanged', () => {
      expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;');
      expect(decodeHtmlEntities('&#1114112;')).toBe('&#1114112;'); // Code point > 0x10FFFF
    });

    it('should decode multiple entities in a string', () => {
      expect(decodeHtmlEntities('Tom &amp; Jerry&#39;s show &lt;3')).toBe("Tom & Jerry's show <3");
    });

    it('should handle strings without entities', () => {
      expect(decodeHtmlEntities('Hello world')).toBe('Hello world');
    });
  });

  describe('escapeHtml', () => {
    it('should return empty string for non-string input', () => {
  expect(escapeHtml(null as unknown as string)).toBe('');
  expect(escapeHtml(undefined as unknown as string)).toBe('');
  expect(escapeHtml(123 as unknown as string)).toBe('');
    });

    it('should escape dangerous HTML characters', () => {
      expect(escapeHtml('&')).toBe('&amp;');
      expect(escapeHtml('<')).toBe('&lt;');
      expect(escapeHtml('>')).toBe('&gt;');
      expect(escapeHtml('"')).toBe('&quot;');
      expect(escapeHtml('`')).toBe('&#x60;');
    });

    it('should not escape safe characters', () => {
      expect(escapeHtml("'")).toBe("'"); // apostrophe is safe
      expect(escapeHtml('a')).toBe('a');
      expect(escapeHtml('1')).toBe('1');
    });

    it('should escape multiple dangerous characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
  });

  describe('unescapeString', () => {
    it('should return empty string for non-string input', () => {
  expect(unescapeString(null as unknown as string)).toBe('');
  expect(unescapeString(undefined as unknown as string)).toBe('');
  expect(unescapeString(123 as unknown as string)).toBe('');
    });

    it('should unescape common escape sequences', () => {
      expect(unescapeString('\\n')).toBe('\n');
      expect(unescapeString('\\r')).toBe('\r');
      expect(unescapeString('\\t')).toBe('\t');
      expect(unescapeString('\\b')).toBe('\b');
      expect(unescapeString('\\f')).toBe('\f');
      expect(unescapeString('\\v')).toBe('\v');
      expect(unescapeString('\\0')).toBe('\0');
      expect(unescapeString('\\\\')).toBe('\\');
      expect(unescapeString('\\"')).toBe('"');
      expect(unescapeString("\\'")).toBe("'");
    });

    it('should leave unknown escape sequences unchanged', () => {
      expect(unescapeString('\\z')).toBe('\\z');
      expect(unescapeString('\\1')).toBe('\\1');
    });

    it('should unescape multiple sequences in a string', () => {
      expect(unescapeString('Hello\\nworld\\t!')).toBe('Hello\nworld\t!');
    });

    it('should handle strings without escape sequences', () => {
      expect(unescapeString('Hello world')).toBe('Hello world');
    });
  });

  describe('sanitizeForDisplay', () => {
    it('should return empty string for non-string input', () => {
  expect(sanitizeForDisplay(null as unknown as string)).toBe('');
  expect(sanitizeForDisplay(undefined as unknown as string)).toBe('');
  expect(sanitizeForDisplay(123 as unknown as string)).toBe('');
    });

    it('should process strings through unescape, decode, and escape', () => {
      expect(sanitizeForDisplay('Hello\\n&amp;world')).toBe('Hello\n&amp;world');
      expect(sanitizeForDisplay('&#39;test&#39;')).toBe("'test'");
    });

    it('should handle complex cases', () => {
      expect(sanitizeForDisplay('Tom &amp; Jerry&#39;s &lt;script&gt;')).toBe("Tom &amp; Jerry's &lt;script&gt;");
    });
  });

  describe('sanitizeForReact', () => {
    it('should return empty string for non-string input', () => {
      expect(sanitizeForReact(null as unknown as string)).toBe('');
      expect(sanitizeForReact(undefined as unknown as string)).toBe('');
      expect(sanitizeForReact(123 as unknown as string)).toBe('');
    });

    it('should decode HTML entities without re-escaping', () => {
      expect(sanitizeForReact('&quot;Hello&quot;')).toBe('"Hello"');
      expect(sanitizeForReact('&amp;')).toBe('&');
      expect(sanitizeForReact('&lt;')).toBe('<');
      expect(sanitizeForReact('&gt;')).toBe('>');
    });

    it('should unescape JavaScript sequences', () => {
      expect(sanitizeForReact('Hello\\nWorld')).toBe('Hello\nWorld');
      expect(sanitizeForReact('Tab\\there')).toBe('Tab\there');
    });

    it('should handle mixed HTML entities and escape sequences', () => {
      expect(sanitizeForReact('&quot;Hello\\nWorld&quot;')).toBe('"Hello\nWorld"');
      expect(sanitizeForReact('Tom &amp; Jerry&#39;s')).toBe("Tom & Jerry's");
    });
  });

  describe('sanitizeCharacterName', () => {
    it('should return empty string for non-string input', () => {
  expect(sanitizeCharacterName(null as unknown as string)).toBe('');
  expect(sanitizeCharacterName(undefined as unknown as string)).toBe('');
  expect(sanitizeCharacterName(123 as unknown as string)).toBe('');
    });

    it('should remove dangerous characters', () => {
      expect(sanitizeCharacterName('<script>')).toBe('script');
      expect(sanitizeCharacterName('Tom & Jerry')).toBe('Tom  Jerry');
      expect(sanitizeCharacterName('"Quoted"')).toBe('Quoted');
      expect(sanitizeCharacterName("'Apostrophe'")).toBe('Apostrophe');
    });

    it('should trim whitespace', () => {
      expect(sanitizeCharacterName('  test  ')).toBe('test');
    });

    it('should limit length to 100 characters', () => {
      const longName = 'a'.repeat(150);
      expect(sanitizeCharacterName(longName)).toBe('a'.repeat(100));
    });

    it('should handle names that are already safe', () => {
      expect(sanitizeCharacterName('Gandalf')).toBe('Gandalf');
    });
  });
});