import { describe, it, expect, beforeEach } from 'vitest';
import { SpendingAccountManager } from '../src/accounts/spendingAccount.js';
import { QuoteManager } from '../src/payments/quotes.js';
import { PaymentAuthorizationManager } from '../src/payments/authorization.js';
import { AgentPolicyManager } from '../src/agents/policies.js';
import { SettlementLayer } from '../src/payments/settlement.js';
import { StaticExchangeRateProvider } from '9bridge';
import {
  InsufficientBalanceError,
  ExpiredQuoteError,
  DuplicateRequestError,
  QuoteMismatchError,
} from '../src/errors/index.js';

describe('SpendingAccountManager', () => {
  let accounts: SpendingAccountManager;

  beforeEach(() => {
    accounts = new SpendingAccountManager();
  });

  it('creates account', async () => {
    const account = await accounts.createAccount('user1', 'testnet');
    expect(account.userId).toBe('user1');
    expect(account.balance).toBe('0');
    expect(account.asset).toBe('USDC');
  });

  it('credits account', async () => {
    await accounts.createAccount('user1', 'testnet');
    const tx = await accounts.credit('user1', '10.000000', 'fund_123');
    expect(tx.direction).toBe('credit');
    expect(tx.assetAmount).toBe('10.000000');

    const balance = await accounts.getBalance('user1');
    expect(balance.available).toBe('10.000000');
  });

  it('rejects duplicate credit', async () => {
    await accounts.createAccount('user1', 'testnet');
    await accounts.credit('user1', '10.000000', 'fund_123');

    await expect(accounts.credit('user1', '5.000000', 'fund_123')).rejects.toThrow(DuplicateRequestError);
  });

  it('debits account', async () => {
    await accounts.createAccount('user1', 'testnet');
    await accounts.credit('user1', '10.000000', 'fund_123');

    const tx = await accounts.debit('user1', '3.000000', 'airtime', 'airtime_1');
    expect(tx.direction).toBe('debit');
    expect(tx.type).toBe('airtime');

    const balance = await accounts.getBalance('user1');
    expect(balance.available).toBe('7.000000');
  });

  it('rejects insufficient balance', async () => {
    await accounts.createAccount('user1', 'testnet');
    await accounts.credit('user1', '2.000000', 'fund_123');

    await expect(
      accounts.debit('user1', '5.000000', 'airtime', 'airtime_1'),
    ).rejects.toThrow(InsufficientBalanceError);
  });

  it('reverses debit', async () => {
    await accounts.createAccount('user1', 'testnet');
    await accounts.credit('user1', '10.000000', 'fund_123');
    await accounts.debit('user1', '3.000000', 'airtime', 'airtime_1');

    await accounts.reverseDebit('user1', 'airtime_1');

    const balance = await accounts.getBalance('user1');
    expect(balance.available).toBe('10.000000');
  });
});

describe('QuoteManager', () => {
  let quotes: QuoteManager;

  beforeEach(() => {
    quotes = new QuoteManager(new StaticExchangeRateProvider(0.000625, 'test'));
  });

  it('creates quote', async () => {
    const quote = await quotes.createQuote('airtime', 1000);
    expect(quote.service).toBe('airtime');
    expect(quote.fiatAmount).toBe(1000);
    expect(quote.fiatCurrency).toBe('NGN');
    expect(quote.asset).toBe('USDC');
    expect(parseFloat(quote.assetAmount)).toBeGreaterThan(0);
    expect(quote.quoteId).toMatch(/^quote_/);
  });

  it('retrieves quote', async () => {
    const quote = await quotes.createQuote('airtime', 1000);
    const retrieved = await quotes.getQuote(quote.quoteId);
    expect(retrieved.quoteId).toBe(quote.quoteId);
  });

  it('invalidates quote', async () => {
    const quote = await quotes.createQuote('airtime', 1000);
    await quotes.invalidateQuote(quote.quoteId);

    await expect(quotes.getQuote(quote.quoteId)).rejects.toThrow();
  });
});

describe('PaymentAuthorizationManager', () => {
  let authorizations: PaymentAuthorizationManager;
  let quotes: QuoteManager;

  beforeEach(() => {
    authorizations = new PaymentAuthorizationManager();
    quotes = new QuoteManager(new StaticExchangeRateProvider(0.000625, 'test'));
  });

  it('creates and authorizes', async () => {
    const quote = await quotes.createQuote('airtime', 1000);
    const auth = await authorizations.create({
      userId: 'user1',
      agentId: 'agent1',
      quote,
      service: 'airtime',
      destination: { phoneNumber: '08012345678', network: 'mtn' },
    });

    expect(auth.status).toBe('pending');

    const authorized = await authorizations.authorize(auth.id, quote.assetAmount);
    expect(authorized.status).toBe('authorized');
  });

  it('rejects expired quote authorization', async () => {
    const quote = await quotes.createQuote('airtime', 1000);
    const auth = await authorizations.create({
      userId: 'user1',
      agentId: 'agent1',
      quote,
      service: 'airtime',
      destination: { phoneNumber: '08012345678', network: 'mtn' },
    });

    // Manually expire the auth
    auth.expiresAt = new Date(Date.now() - 100000).toISOString();
    authorizations['authorizations'].set(auth.id, auth);

    await expect(authorizations.authorize(auth.id, quote.assetAmount)).rejects.toThrow(ExpiredQuoteError);
  });
});

describe('AgentPolicyManager', () => {
  let policies: AgentPolicyManager;

  beforeEach(() => {
    policies = new AgentPolicyManager();
  });

  it('creates policy and authorizes', async () => {
    await policies.createPolicy('agent1', 'user1', {
      dailyLimit: '10',
      perTransactionLimit: '3',
      allowedServices: ['airtime', 'data'],
    });

    const result = await policies.authorize('agent1', 'airtime', '2.000000');
    expect(result.allowed).toBe(true);
  });

  it('rejects unauthorized agent', async () => {
    await expect(policies.authorize('unknown', 'airtime', '1.000000')).rejects.toThrow();
  });

  it('rejects disallowed service', async () => {
    await policies.createPolicy('agent1', 'user1', {
      allowedServices: ['airtime'],
    });

    const result = await policies.authorize('agent1', 'cable', '1.000000');
    expect(result.allowed).toBe(false);
  });

  it('rejects over per-tx limit', async () => {
    await policies.createPolicy('agent1', 'user1', {
      perTransactionLimit: '3',
    });

    await expect(policies.authorize('agent1', 'airtime', '5.000000')).rejects.toThrow();
  });

  it('rejects disabled agent', async () => {
    await policies.createPolicy('agent1', 'user1', { enabled: false });

    const result = await policies.authorize('agent1', 'airtime', '1.000000');
    expect(result.allowed).toBe(false);
  });
});

describe('SettlementLayer', () => {
  let accounts: SpendingAccountManager;
  let authorizations: PaymentAuthorizationManager;
  let quotes: QuoteManager;
  let settlement: SettlementLayer;

  beforeEach(() => {
    accounts = new SpendingAccountManager();
    authorizations = new PaymentAuthorizationManager();
    quotes = new QuoteManager(new StaticExchangeRateProvider(0.000625, 'test'));
    settlement = new SettlementLayer(accounts, authorizations);
  });

  it('settles and debits', async () => {
    await accounts.createAccount('user1', 'testnet');
    await accounts.credit('user1', '10.000000', 'fund_1');

    const quote = await quotes.createQuote('airtime', 1000);
    const auth = await authorizations.create({
      userId: 'user1',
      agentId: 'agent1',
      quote,
      service: 'airtime',
      destination: { phoneNumber: '08012345678', network: 'mtn' },
    });

    const tx = await settlement.settleAndDebit('user1', auth);
    expect(tx.direction).toBe('debit');

    const balance = await accounts.getBalance('user1');
    expect(parseFloat(balance.available)).toBeLessThan(10);
  });

  it('reverses on failure', async () => {
    await accounts.createAccount('user1', 'testnet');
    await accounts.credit('user1', '10.000000', 'fund_1');

    const quote = await quotes.createQuote('airtime', 1000);
    const auth = await authorizations.create({
      userId: 'user1',
      agentId: 'agent1',
      quote,
      service: 'airtime',
      destination: { phoneNumber: '08012345678', network: 'mtn' },
    });

    await settlement.settleAndDebit('user1', auth);
    await settlement.reverseAndCredit('user1', auth.id);

    const balance = await accounts.getBalance('user1');
    expect(balance.available).toBe('10.000000');
  });
});
