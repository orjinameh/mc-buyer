import { Router, Request, Response } from 'express';
import { SpendingAccountManager } from '../accounts/spendingAccount.js';
import { QuoteManager } from '../payments/quotes.js';
import { AgentPolicyManager } from '../agents/policies.js';
import { config } from '../config/env.js';

export function createDashboardRouter(
  accounts: SpendingAccountManager,
  quotes: QuoteManager,
  policies: AgentPolicyManager,
): Router {
  const router = Router();

  router.get('/api/v1/account', async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'Missing x-user-id header' });
      return;
    }

    try {
      await accounts.getAccount(userId);
    } catch {
      await accounts.createAccount(userId, config.stellar.network);
    }

    const balance = await accounts.getBalance(userId);
    const transactions = await accounts.getTransactions(userId, 20);

    res.json({
      account: balance,
      recentTransactions: transactions,
    });
  });

  router.post('/api/v1/quote', async (req: Request, res: Response) => {
    const { service, ...params } = req.body;

    try {
      let quote;
      switch (service) {
        case 'airtime':
          quote = await quotes.createQuote('airtime', params.amountNGN, { network: params.network });
          break;
        case 'data':
          quote = await quotes.createQuote('data', params.fiatAmount, { network: params.network, plan: params.plan });
          break;
        case 'electricity':
          quote = await quotes.createQuote('electricity', params.amountNGN, { discoProvider: params.discoProvider });
          break;
        case 'cable':
          quote = await quotes.createQuote('cable', params.fiatAmount, { provider: params.provider, bundlePlan: params.bundlePlan });
          break;
        default:
          res.status(400).json({ error: `Unknown service: ${service}` });
          return;
      }
      res.json(quote);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/api/v1/policies', async (req: Request, res: Response) => {
    const { agentId, userId, dailyLimit, perTransactionLimit, allowedServices } = req.body;

    if (!agentId || !userId) {
      res.status(400).json({ error: 'agentId and userId are required' });
      return;
    }

    const policy = await policies.createPolicy(agentId, userId, {
      dailyLimit,
      perTransactionLimit,
      allowedServices,
    });

    res.status(201).json(policy);
  });

  router.get('/api/v1/policies/:agentId', async (req: Request, res: Response) => {
    const policy = await policies.getPolicy(req.params.agentId);
    if (!policy) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }
    res.json(policy);
  });

  router.patch('/api/v1/policies/:agentId', async (req: Request, res: Response) => {
    try {
      const policy = await policies.updatePolicy(req.params.agentId, req.body);
      res.json(policy);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
    }
  });

  router.get('/api/v1/services/airtime', (_req: Request, res: Response) => {
    res.json({ catalog: 'See 9bridge README for airtime variations' });
  });

  router.get('/api/v1/services/data', (_req: Request, res: Response) => {
    res.json({ catalog: 'See 9bridge README for data plans' });
  });

  router.get('/api/v1/services/electricity', (_req: Request, res: Response) => {
    res.json({ catalog: 'See 9bridge README for electricity providers' });
  });

  router.get('/api/v1/services/cable', (_req: Request, res: Response) => {
    res.json({ catalog: 'See 9bridge README for cable plans' });
  });

  return router;
}
