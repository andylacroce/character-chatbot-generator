import { api_getVoiceConfigForCharacter } from '../../app/components/api_getVoiceConfigForCharacter';

jest.mock('../../src/utils/api', () => ({
  authenticatedFetch: jest.fn(),
}));

import { authenticatedFetch } from '../../src/utils/api';

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
});
