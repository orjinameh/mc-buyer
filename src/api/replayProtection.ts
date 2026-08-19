import { Request, Response, NextFunction } from 'express';

const replayStore = new Map<string, number>();

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export function replayProtection(req: Request, res: Response, next: NextFunction): void {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const timestamp = req.headers['x-request-timestamp'] as string | undefined;
  const nonce = req.headers['x-nonce'] as string | undefined;

  if (idempotencyKey && timestamp && nonce) {
    const compositeKey = `${idempotencyKey}:${timestamp}:${nonce}`;
    const existingTimestamp = replayStore.get(compositeKey);

    if (existingTimestamp) {
      res.status(409).json({ error: 'Replay detected: duplicate request' });
      return;
    }

    const requestTime = parseInt(timestamp, 10);
    if (!isNaN(requestTime) && Math.abs(Date.now() - requestTime) > REPLAY_WINDOW_MS) {
      res.status(400).json({ error: 'Request timestamp outside allowed window' });
      return;
    }

    replayStore.set(compositeKey, Date.now());
  }

  next();
}

export function cleanupReplayStore(): void {
  const cutoff = Date.now() - REPLAY_WINDOW_MS;
  for (const [key, timestamp] of replayStore) {
    if (timestamp < cutoff) replayStore.delete(key);
  }
}

setInterval(cleanupReplayStore, 60_000);
