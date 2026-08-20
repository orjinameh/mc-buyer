import { Router } from 'express';
import { AuthService } from './service.js';

export function createAuthRouter(auth: AuthService) {
  const router = Router();

  router.post('/auth/register', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password required' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({ error: 'Invalid email address' });
        return;
      }
      const result = await auth.register(email, password);
      res.json({ userId: result.userId, token: result.token });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password required' });
        return;
      }
      const result = await auth.login(email, password);
      res.json({ userId: result.userId, token: result.token });
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  });

  router.get('/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const session = auth.verifyToken(authHeader.slice(7));
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    res.json({ userId: session.userId, email: session.email });
  });

  return router;
}
