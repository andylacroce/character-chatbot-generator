import type { NextApiRequest, NextApiResponse } from 'next';
import { AVATAR_TIMEOUT_MS } from '../../src/config/serverConfig';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
    // Origin validation is handled by middleware - no need for CORS headers here
    // Only expose safe-to-share configuration values to the client
    res.status(200).json({ avatarTimeoutSeconds: Math.round(AVATAR_TIMEOUT_MS / 1000) });
}
