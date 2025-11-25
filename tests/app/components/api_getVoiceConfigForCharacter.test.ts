import { api_getVoiceConfigForCharacter } from '../../../app/components/api_getVoiceConfigForCharacter';

jest.mock('../../../src/utils/api', () => ({
  authenticatedFetch: jest.fn(),
}));

import { authenticatedFetch } from '../../../src/utils/api';

describe('api_getVoiceConfigForCharacter', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns parsed JSON when response ok', async () => {
    (authenticatedFetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'en-US' }) });
    const result = await api_getVoiceConfigForCharacter('Bob');
    expect(result).toEqual({ name: 'en-US' });
  });

  it('throws when response not ok', async () => {
    (authenticatedFetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    await expect(api_getVoiceConfigForCharacter('Fail')).rejects.toThrow('Failed to fetch voice config');
  });

  it('includes gender in request body when gender is provided', async () => {
    (authenticatedFetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'en-US-Wavenet-F' }) });
    await api_getVoiceConfigForCharacter('Alice', 'female');
    
    expect(authenticatedFetch).toHaveBeenCalledWith('/api/get-voice-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', gender: 'female' }),
    });
  });

  it('excludes gender from request body when gender is null', async () => {
    (authenticatedFetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'en-US' }) });
    await api_getVoiceConfigForCharacter('Bob', null);
    
    expect(authenticatedFetch).toHaveBeenCalledWith('/api/get-voice-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob' }),
    });
  });
});
