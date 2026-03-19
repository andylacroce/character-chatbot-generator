import { extractJson } from '../../src/utils/parseClaudeJson';

describe('extractJson', () => {
  it('returns plain text unchanged when no code fence is present', () => {
    const input = '{"foo":"bar"}';
    expect(extractJson(input)).toBe('{"foo":"bar"}');
  });

  it('strips a ```json ... ``` fence', () => {
    const input = '```json\n{"foo":"bar"}\n```';
    expect(extractJson(input)).toBe('{"foo":"bar"}');
  });

  it('strips a plain ``` ... ``` fence without language label', () => {
    const input = '```\n{"foo":"bar"}\n```';
    expect(extractJson(input)).toBe('{"foo":"bar"}');
  });

  it('trims surrounding whitespace from fenced content', () => {
    const input = '```json\n\n  {"foo":"bar"}  \n\n```';
    expect(extractJson(input)).toBe('{"foo":"bar"}');
  });

  it('trims surrounding whitespace from plain text', () => {
    expect(extractJson('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('handles multiline JSON inside a fence', () => {
    const inner = '{\n  "name": "Alice",\n  "age": 30\n}';
    const input = '```json\n' + inner + '\n```';
    expect(extractJson(input)).toBe(inner.trim());
  });

  it('returns empty string when input is empty', () => {
    expect(extractJson('')).toBe('');
  });

  it('returns content as-is when it contains backticks but is not a valid fence', () => {
    const input = 'some `inline` code without fences';
    expect(extractJson(input)).toBe(input.trim());
  });
});
