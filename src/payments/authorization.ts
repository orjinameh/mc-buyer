import { Db, ObjectId } from 'mongodb';
import { PaymentAuthorization, ServiceQuote } from '../stellar/types.js';
import { DuplicateRequestError, ExpiredQuoteError, QuoteMismatchError } from '../errors/index.js';
import { getDatabase } from '../config/database.js';

interface AuthDoc {
  _id?: ObjectId;
  id: string;
  userId: string;
  agentId: string;
  quoteId: string;
  service: PaymentAuthorization['service'];
  assetAmount: string;
  fiatAmount: number;
  fiatCurrency: 'NGN';
  status: PaymentAuthorization['status'];
  reference: string;
  expiresAt: string;
  executionRef?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export class PaymentAuthorizationManager {
  private db(): Db {
    return getDatabase();
  }

  async create(params: {
    userId: string;
    agentId: string;
    quote: ServiceQuote;
    service: PaymentAuthorization['service'];
    destination: Record<string, unknown>;
  }): Promise<PaymentAuthorization> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    const auth: AuthDoc = {
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
      expiresAt: expiresAt.toISOString(),
      metadata: { destination: params.destination, quote: params.quote },
      createdAt: now.toISOString(),
    };

    await this.db().collection<AuthDoc>('payment_authorizations').insertOne(auth);
    return this.toAuth(auth);
  }

  async authorize(authId: string, assetAmountFromQuote: string): Promise<PaymentAuthorization> {
    const doc = await this.db().collection<AuthDoc>('payment_authorizations').findOne({ id: authId });
    if (!doc) throw new Error(`Authorization ${authId} not found`);

    if (new Date(doc.expiresAt) < new Date()) {
      throw new ExpiredQuoteError(doc.quoteId);
    }

    if (doc.assetAmount !== assetAmountFromQuote) {
      throw new QuoteMismatchError();
    }

    if (doc.status !== 'pending') {
      throw new DuplicateRequestError(doc.reference);
    }

    await this.db().collection<AuthDoc>('payment_authorizations').updateOne(
      { id: authId },
      { $set: { status: 'authorized' } },
    );

    return this.toAuth({ ...doc, status: 'authorized' });
  }

  async settle(authId: string, txReference: string): Promise<PaymentAuthorization> {
    const doc = await this.db().collection<AuthDoc>('payment_authorizations').findOne({ id: authId });
    if (!doc) throw new Error(`Authorization ${authId} not found`);

    await this.db().collection<AuthDoc>('payment_authorizations').updateOne(
      { id: authId },
      { $set: { status: 'settled', executionRef: txReference } },
    );

    return this.toAuth({ ...doc, status: 'settled', executionRef: txReference });
  }

  async execute(authId: string, providerReference: string): Promise<PaymentAuthorization> {
    const doc = await this.db().collection<AuthDoc>('payment_authorizations').findOne({ id: authId });
    if (!doc) throw new Error(`Authorization ${authId} not found`);

    await this.db().collection<AuthDoc>('payment_authorizations').updateOne(
      { id: authId },
      { $set: { status: 'executed', [`metadata.providerReference`]: providerReference } },
    );

    return this.toAuth({
      ...doc,
      status: 'executed',
      metadata: { ...doc.metadata, providerReference },
    });
  }

  async fail(authId: string, reason: string): Promise<PaymentAuthorization> {
    const doc = await this.db().collection<AuthDoc>('payment_authorizations').findOne({ id: authId });
    if (!doc) throw new Error(`Authorization ${authId} not found`);

    await this.db().collection<AuthDoc>('payment_authorizations').updateOne(
      { id: authId },
      { $set: { status: 'failed', [`metadata.failureReason`]: reason } },
    );

    return this.toAuth({
      ...doc,
      status: 'failed',
      metadata: { ...doc.metadata, failureReason: reason },
    });
  }

  async reverse(authId: string): Promise<PaymentAuthorization> {
    const doc = await this.db().collection<AuthDoc>('payment_authorizations').findOne({ id: authId });
    if (!doc) throw new Error(`Authorization ${authId} not found`);

    await this.db().collection<AuthDoc>('payment_authorizations').updateOne(
      { id: authId },
      { $set: { status: 'reversed' } },
    );

    return this.toAuth({ ...doc, status: 'reversed' });
  }

  async get(authId: string): Promise<PaymentAuthorization | undefined> {
    const doc = await this.db().collection<AuthDoc>('payment_authorizations').findOne({ id: authId });
    return doc ? this.toAuth(doc) : undefined;
  }

  async getByQuote(quoteId: string): Promise<PaymentAuthorization | undefined> {
    const doc = await this.db().collection<AuthDoc>('payment_authorizations').findOne({ quoteId });
    return doc ? this.toAuth(doc) : undefined;
  }

  private toAuth(doc: AuthDoc): PaymentAuthorization {
    return {
      id: doc.id,
      userId: doc.userId,
      agentId: doc.agentId,
      quoteId: doc.quoteId,
      service: doc.service,
      assetAmount: doc.assetAmount,
      fiatAmount: doc.fiatAmount,
      fiatCurrency: doc.fiatCurrency,
      status: doc.status,
      reference: doc.reference,
      expiresAt: doc.expiresAt,
      executionRef: doc.executionRef,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
    };
  }
}
