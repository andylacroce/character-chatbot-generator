/**
 * Public configuration endpoint exposing safe client values (e.g., avatar timeout).
 * Origin validation is enforced by middleware; no CORS handling needed here.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { AVATAR_TIMEOUT_MS } from '../../src/config/serverConfig';

/**
 * @swagger
 * /config:
 *   get:
 *     summary: Get public client configuration
 *     description: Safe-to-share runtime config values. No auth beyond proxy.ts.
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: Configuration values
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 avatarTimeoutSeconds:
 *                   type: integer
 *                   example: 45
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
    // Only expose safe-to-share configuration values to the client
    res.status(200).json({ avatarTimeoutSeconds: Math.round(AVATAR_TIMEOUT_MS / 1000) });
}
