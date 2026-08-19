import { PaymentAuthorization, ServiceQuote } from '../stellar/types.js';
import { DuplicateRequestError, ExpiredQuoteError, QuoteMismatchError } from '../errors/index.js';

export class PaymentAuthorizationManager {
  private authorizations: Map<string, PaymentAuthorization> = new Map();

  async create(
    params: {
      userId: string;
      agentId: string;
      quote: ServiceQuote;
      service: PaymentAuthorization['service'];
      destination: Record<string, unknown>;
    },
  ): Promise<PaymentAuthorization> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

    const auth: PaymentAuthorization = {
      id: `auth_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      userId: params.userId,
      agentId: params.agentId,
      quoteId: params.quote.quoteId,
      service: params.service,
      assetAmount: params.quote.assetAmount,
      fiatAmount: params.quote.fiatAmount,
      fiatCurrency: 'NGN',
      status: 'pending',
      reference: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      expiresAt,
      metadata: { destination: params.destination, quote: params.quote },
      createdAt: now.toISOString(),
    };

    this.authorizations.set(auth.id, auth);
    return auth;
  }

  async authorize(
    authId: string,
    assetAmountFromQuote: string,
  ): Promise<PaymentAuthorization> {
    const auth = this.authorizations.get(authId);
    if (!auth) throw new Error(`Authorization ${authId} not found`);

    if (new Date(auth.expiresAt) < new Date()) {
      throw new ExpiredQuoteError(auth.quoteId);
    }

    if (auth.assetAmount !== assetAmountFromQuote) {
      throw new QuoteMismatchError();
    }

    if (auth.status !== 'pending') {
      throw new DuplicateRequestError(auth.reference);
    }

    auth.status = 'authorized';
    this.authorizations.set(authId, auth);
    return auth;
  }

  async settle(authId: string, txReference: string): Promise<PaymentAuthorization> {
    const auth = this.authorizations.get(authId);
    if (!auth) throw new Error(`Authorization ${authId} not found`);

    auth.status = 'settled';
    auth.executionRef = txReference;
    this.authorizations.set(authId, auth);
    return auth;
  }

  async execute(authId: string, providerReference: string): Promise<PaymentAuthorization> {
    const auth = this.authorizations.get(authId);
    if (!auth) throw new Error(`Authorization ${authId} not found`);

    auth.status = 'executed';
    auth.metadata.providerReference = providerReference;
    this.authorizations.set(authId, auth);
    return auth;
  }

  async fail(authId: string, reason: string): Promise<PaymentAuthorization> {
    const auth = this.authorizations.get(authId);
    if (!auth) throw new Error(`Authorization ${authId} not found`);

    auth.status = 'failed';
    auth.metadata.failureReason = reason;
    this.authorizations.set(authId, auth);
    return auth;
  }

  async reverse(authId: string): Promise<PaymentAuthorization> {
    const auth = this.authorizations.get(authId);
    if (!auth) throw new Error(`Authorization ${authId} not found`);

    auth.status = 'reversed';
    this.authorizations.set(authId, auth);
    return auth;
  }

  async get(authId: string): Promise<PaymentAuthorization | undefined> {
    return this.authorizations.get(authId);
  }

  async getByQuote(quoteId: string): Promise<PaymentAuthorization | undefined> {
    for (const auth of this.authorizations.values()) {
      if (auth.quoteId === quoteId) return auth;
    }
    return undefined;
  }
}
