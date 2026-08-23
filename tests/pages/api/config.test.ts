import type { NextApiRequest, NextApiResponse } from 'next';

import handler from '../../../pages/api/config';
import { AVATAR_TIMEOUT_MS } from '../../../src/config/serverConfig';

function makeRes() {
    const res: Partial<NextApiResponse> = {};
    res.status = jest.fn().mockReturnValue(res as NextApiResponse);
    res.json = jest.fn().mockReturnValue(res as NextApiResponse);
    return res as NextApiResponse;
}

describe('config API', () => {
    it('exposes the avatar timeout in seconds', () => {
        const res = makeRes();
        handler({} as NextApiRequest, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            avatarTimeoutSeconds: Math.round(AVATAR_TIMEOUT_MS / 1000),
        });
    });

    it('exposes nothing beyond the timeout', () => {
        // This endpoint is unauthenticated for first-party callers, so the payload
        // must stay free of anything server-only.
        const res = makeRes();
        handler({} as NextApiRequest, res);

        const payload = (res.json as jest.Mock).mock.calls[0][0];
        expect(Object.keys(payload)).toEqual(['avatarTimeoutSeconds']);
    });
});
