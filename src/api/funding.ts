import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { SpendingAccountManager } from '../accounts/spendingAccount.js';
import { NineBridgeIntegration } from '../payments/ninebridge.js';

const usedIdempotencyKeys = new Set<string>();

export function createFundingRouter(
  accounts: SpendingAccountManager,
  ninebridge: NineBridgeIntegration,
): Router {
  const router = Router();

  router.post('/api/v1/funding/initiate', async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'Missing x-user-id header' });
      return;
    }

    const { amountNGN, channel } = req.body;
    if (!amountNGN || typeof amountNGN !== 'number' || amountNGN <= 0) {
      res.status(400).json({ error: 'amountNGN must be a positive number' });
      return;
    }

    if (channel && !['card', 'transfer', 'ussd_wallet'].includes(channel)) {
      res.status(400).json({ error: 'channel must be card, transfer, or ussd_wallet' });
      return;
    }

    try {
      await accounts.getAccount(userId);
    } catch {
      await accounts.createAccount(userId, 'testnet');
    }

    const reference = `fund_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const method = channel ?? 'card';
    const gateway = ninebridge.gatewayFactory.resolveByMethod(method);

    const payment = await gateway.initializePayment({
      amount: amountNGN,
      currency: 'NGN',
      email: req.headers['x-user-email'] as string ?? `${userId}@mc-buyer.local`,
      reference,
      metadata: { userId, purpose: 'funding' },
    });

    res.status(200).json({
      reference,
      authorization_url: payment.data.authorization_url,
      amountNGN,
      channel: method,
      status: 'pending',
    });
  });

  router.get('/api/v1/funding/status/:reference', async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'Missing x-user-id header' });
      return;
    }

    const { reference } = req.params;

    try {
      const txs = await accounts.getTransactions(userId, 100);
      const tx = txs.find((t) => t.reference === reference || t.metadata.originalReference === reference);

      if (!tx) {
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }

      res.json({ reference, status: tx.status, type: tx.type, createdAt: tx.createdAt });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
