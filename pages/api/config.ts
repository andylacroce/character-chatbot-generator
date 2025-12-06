/**
 * Public configuration endpoint exposing safe client values (e.g., avatar timeout).
 * Origin validation is enforced by middleware; no CORS handling needed here.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { AVATAR_TIMEOUT_MS } from '../../src/config/serverConfig';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
    // Only expose safe-to-share configuration values to the client
    res.status(200).json({ avatarTimeoutSeconds: Math.round(AVATAR_TIMEOUT_MS / 1000) });
}
