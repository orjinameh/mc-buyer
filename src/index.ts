import express from 'express';
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
import { config } from './config/env.js';

async function main() {
  await connectDatabase(config.mongodb.uri);
  console.log('Connected to MongoDB');

  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => { (req as any).rawBody = buf.toString(); },
  }));

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

  const mcpServer = createMCPServer(rateProvider);

  app.use(createDashboardRouter(accounts, quotes, policies));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      stellar: config.stellar.network,
    });
  });

  app.listen(config.port, () => {
    console.log(`MC Buyer running on port ${config.port}`);
    console.log(`Stellar network: ${config.stellar.network}`);
    console.log(`9bridge webhook endpoint: /api/v1/webhooks/payment-listener`);
  });
}

main().catch((err) => {
  console.error('Failed to start MC Buyer:', err);
  process.exit(1);
});
