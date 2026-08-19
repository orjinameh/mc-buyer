import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

const idempotencyStore = new Map<string, { response: unknown; timestamp: number }>();

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['idempotency-key'] as string | undefined;

  if (!key) {
    next();
    return;
  }

  const cached = idempotencyStore.get(key);
  if (cached && Date.now() - cached.timestamp < IDEMPOTENCY_TTL_MS) {
    res.status(200).json(cached.response);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode < 400) {
      idempotencyStore.set(key, { response: body, timestamp: Date.now() });
    }
    return originalJson(body);
  };

  next();
}

export function cleanupIdempotency(): void {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore) {
    if (now - entry.timestamp > IDEMPOTENCY_TTL_MS) {
      idempotencyStore.delete(key);
    }
  }
}

setInterval(cleanupIdempotency, 60 * 60 * 1000);
