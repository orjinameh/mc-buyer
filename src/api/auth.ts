import { Request, Response, NextFunction } from 'express';

const API_KEY_HEADER = 'x-api-key';
const BEARER_PREFIX = 'Bearer ';

export interface AuthConfig {
  apiKeys?: string[];
  jwtSecret?: string;
}

export function requireAuth(config: AuthConfig = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.headers[API_KEY_HEADER] as string | undefined;

    if (apiKey && config.apiKeys && config.apiKeys.includes(apiKey)) {
      (req as any).authenticatedUser = { type: 'api-key', keyPrefix: apiKey.substring(0, 8) };
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith(BEARER_PREFIX)) {
      const token = authHeader.substring(BEARER_PREFIX.length);

      if (config.jwtSecret) {
        try {
          const payload = verifyJWT(token, config.jwtSecret);
          (req as any).authenticatedUser = { type: 'jwt', ...payload };
          next();
          return;
        } catch {
          // fall through
        }
      }
    }

    const userId = req.headers['x-user-id'] as string;
    if (userId) {
      (req as any).authenticatedUser = { type: 'header', userId };
      next();
      return;
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Provide x-api-key, Authorization: Bearer <token>, or x-user-id header',
    });
  };
}

function verifyJWT(token: string, secret: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');

  const [header, payload, signature] = parts;
  const expectedSig = require('crypto')
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (signature !== expectedSig) throw new Error('Invalid signature');

  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());

  if (data.exp && Date.now() / 1000 > data.exp) {
    throw new Error('Token expired');
  }

  return data;
}
