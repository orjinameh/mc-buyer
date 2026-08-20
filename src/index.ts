import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { StaticExchangeRateProvider } from '9bridge';
import { connectDatabase, closeDatabase } from './config/database.js';
import { NineBridgeIntegration } from './payments/ninebridge.js';
import { SpendingAccountManager } from './accounts/spendingAccount.js';
import { AgentPolicyManager } from './agents/policies.js';
import { QuoteManager } from './payments/quotes.js';
import { PaymentAuthorizationManager } from './payments/authorization.js';
import { SettlementLayer } from './payments/settlement.js';
import { createMCPServer } from './mcp/server.js';
import { SimpleOAuthProvider } from './mcp/oauth.js';
import { createDashboardRouter } from './api/dashboard.js';
import { createFundingRouter } from './api/funding.js';
import { createTransactionsRouter } from './api/transactions.js';
import { rateLimit } from './api/rateLimit.js';
import { idempotency } from './api/idempotency.js';
import { replayProtection } from './api/replayProtection.js';
import { config } from './config/env.js';
import { AuthService } from './auth/service.js';
import { createAuthRouter } from './auth/router.js';
import { VTpassProvider } from './vtu/providers/vtpass.js';
import { StellarAccountManager } from './stellar/account.js';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, mcpAuthMetadataRouter, getOAuthProtectedResourceMetadataUrl, createOAuthMetadata } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

async function main() {
  const db = (await connectDatabase(config.mongodb.uri));
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

  const vtpass = new VTpassProvider(config.vtpass);
  const stellarAccounts = new StellarAccountManager({
    network: config.stellar.network,
    contractId: config.stellar.sorobanContractId,
  });
  const mcpManagers = { accounts, policies, quotes, authorizations, settlement, vtpass, stellarAccounts };

  // --- MCP OAuth Setup ---
  const externalUrl = config.render.externalUrl || `http://localhost:${config.port}`;
  const baseUrl = new URL(externalUrl);
  const mcpServerUrl = new URL('/mcp', baseUrl);

  const oauthProvider = new SimpleOAuthProvider(db, externalUrl);
  const oauthMetadata = createOAuthMetadata({
    provider: oauthProvider,
    issuerUrl: baseUrl,
    scopesSupported: ['mcp:tools'],
  });

  // OAuth server endpoints (dynamic client registration, authorize, token, etc.)
  app.use(mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: baseUrl,
    scopesSupported: ['mcp:tools'],
    resourceName: 'MC Buyer',
  }));

  // Protected resource metadata for MCP endpoint
  app.use(mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl: mcpServerUrl,
    scopesSupported: ['mcp:tools'],
    resourceName: 'MC Buyer',
  }));

  // Bearer auth middleware for MCP endpoints
  const authMiddleware = requireBearerAuth({
    verifier: oauthProvider,
    requiredScopes: [],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
  });

  // --- MCP Server with Streamable HTTP Transport ---
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post('/mcp', authMiddleware, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            console.log(`MCP session initialized: ${sid}`);
            transports[sid] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
          }
        };

        const server = createMCPServer(mcpManagers);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP POST error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', authMiddleware, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  app.delete('/mcp', authMiddleware, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // --- Auth ---
  const auth = new AuthService(db);
  await auth.init();
  app.use(createAuthRouter(auth));

  // --- Auth Login & Setup Routes ---
  app.get('/auth/login', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'src', 'api', 'login.html'));
  });

  app.get('/auth/setup', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'src', 'api', 'setup.html'));
  });

  app.post('/auth/setup/complete', async (req, res) => {
    const { session_id } = req.body;
    if (!session_id) {
      res.status(400).json({ error: 'Missing session_id' });
      return;
    }
    const result = await oauthProvider.completePendingAuth(session_id, 'email');
    if (!result) {
      res.status(400).json({ error: 'Invalid or expired session' });
      return;
    }
    res.json({ redirect: result.redirect });
  });

  // --- Routes ---
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '1.2.0',
      stellar: config.stellar.network,
      tools: 10,
    });
  });

  app.get('/debug/clients', async (_req, res) => {
    const clients = await db.collection('oauth_clients').find({}).toArray();
    res.json({ count: clients.length, clients: clients.map((c: any) => ({ client_id: c.client_id, redirect_uris: c.redirect_uris })) });
  });

  app.get('/', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'src', 'api', 'landing.html'));
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const server = app.listen(config.port, () => {
    console.log(`MC Buyer v1.2.0 on port ${config.port}`);
    console.log(`Stellar: ${config.stellar.network}`);
    console.log(`MCP: ${mcpServerUrl}`);
    console.log(`OAuth: ${baseUrl}`);
  });

  const shutdown = async () => {
    console.log('Shutting down...');
    for (const sid in transports) {
      try { await transports[sid].close(); delete transports[sid]; } catch {}
    }
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
