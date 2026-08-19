import { Router, Request, Response } from 'express';
import { SpendingAccountManager } from '../accounts/spendingAccount.js';

export function createTransactionsRouter(accounts: SpendingAccountManager): Router {
  const router = Router();

  router.get('/api/v1/transactions', async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'Missing x-user-id header' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const service = req.query.service as string | undefined;

    const txs = await accounts.getTransactions(userId, limit + offset, 0);
    const filtered = service ? txs.filter((t) => t.type === service) : txs;
    const paginated = filtered.slice(offset, offset + limit);

    res.json({
      transactions: paginated,
      total: filtered.length,
      limit,
      offset,
    });
  });

  router.get('/api/v1/transactions/:id', async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'Missing x-user-id header' });
      return;
    }

    const txs = await accounts.getTransactions(userId, 200, 0);
    const tx = txs.find((t) => t.id === req.params.id);

    if (!tx) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    res.json(tx);
  });

  return router;
}
