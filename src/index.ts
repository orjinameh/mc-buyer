import express from 'express';
import path from 'path';
import { StaticExchangeRateProvider } from '9bridge';
import { connectDatabase, closeDatabase } from './config/database.js';
import { NineBridgeIntegration } from './payments/ninebridge.js';
import { SpendingAccountManager } from './accounts/spendingAccount.js';
import { AgentPolicyManager } from './agents/policies.js';
import { QuoteManager } from './payments/quotes.js';
import { PaymentAuthorizationManager } from './payments/authorization.js';
import { SettlementLayer } from './payments/settlement.js';
import { createMCPServer } from './mcp/server.js';
import { createDashboardRouter } from './api/dashboard.js';
import { createFundingRouter } from './api/funding.js';
import { createTransactionsRouter } from './api/transactions.js';
import { rateLimit } from './api/rateLimit.js';
import { idempotency } from './api/idempotency.js';
import { replayProtection } from './api/replayProtection.js';
import { requireAuth } from './api/auth.js';
import { config } from './config/env.js';

async function main() {
  await connectDatabase(config.mongodb.uri);
  console.log('Connected to MongoDB');

  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => { (req as any).rawBody = buf.toString(); },
  }));

  app.use(rateLimit({ windowMs: 60_000, maxRequests: 120 }));
  app.use(replayProtection);
  app.use(idempotency);

  const rateProvider = new StaticExchangeRateProvider(
    config.exchangeRate.fallbackNgNUsd,
    'default-static',
  );

  const accounts = new SpendingAccountManager();
  const policies = new AgentPolicyManager();
  const quotes = new QuoteManager(rateProvider);
  const authorizations = new PaymentAuthorizationManager();
  const settlement = new SettlementLayer(accounts, authorizations);

  const ninebridge = new NineBridgeIntegration(accounts, rateProvider);
  app.use(ninebridge.getExpressRouter());

  app.use(createDashboardRouter(accounts, quotes, policies));
  app.use(createFundingRouter(accounts, ninebridge));
  app.use(createTransactionsRouter(accounts));

  const mcpServer = createMCPServer(rateProvider);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '1.2.0',
      stellar: config.stellar.network,
      tools: 10,
    });
  });

  app.get('/', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'src', 'api', 'landing.html'));
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const server = app.listen(config.port, () => {
    console.log(`MC Buyer v1.1.0 on port ${config.port}`);
    console.log(`Stellar: ${config.stellar.network}`);
    console.log(`Webhook: /api/v1/webhooks/payment-listener`);
    console.log(`Dashboard: /api/v1/account`);
    console.log(`Funding: /api/v1/funding/initiate`);
    console.log(`Transactions: /api/v1/transactions`);
  });

  const shutdown = async () => {
    console.log('Shutting down...');
    server.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start MC Buyer:', err);
  process.exit(1);
});
