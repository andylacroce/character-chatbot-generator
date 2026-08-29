const mockGetServerSession = jest.fn();

jest.mock('next-auth/next', () => ({
    getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock('../../src/auth/authOptions', () => ({ authOptions: { __fakeAuthOptions: true } }));

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionUserId } from '../../src/utils/getSessionUserId';

describe('getSessionUserId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns null when there is no session', async () => {
        mockGetServerSession.mockResolvedValueOnce(null);
        const result = await getSessionUserId({} as NextApiRequest, {} as NextApiResponse);
        expect(result).toBeNull();
    });

    it('returns null when the session has no user id', async () => {
        mockGetServerSession.mockResolvedValueOnce({ user: {} });
        const result = await getSessionUserId({} as NextApiRequest, {} as NextApiResponse);
        expect(result).toBeNull();
    });

    it('returns the user id from the session', async () => {
        mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-123' } });
        const result = await getSessionUserId({} as NextApiRequest, {} as NextApiResponse);
        expect(result).toBe('user-123');
    });
});
