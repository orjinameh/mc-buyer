import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60,
};

const store = new Map<string, RateLimitEntry>();

export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + cfg.windowMs });
      res.setHeader('X-RateLimit-Limit', cfg.maxRequests);
      res.setHeader('X-RateLimit-Remaining', cfg.maxRequests - 1);
      next();
      return;
    }

    entry.count++;

    if (entry.count > cfg.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({
        error: 'Too many requests',
        retryAfter,
      });
      return;
    }

    res.setHeader('X-RateLimit-Limit', cfg.maxRequests);
    res.setHeader('X-RateLimit-Remaining', cfg.maxRequests - entry.count);
    next();
  };
}

export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

setInterval(cleanupRateLimits, 60_000);
