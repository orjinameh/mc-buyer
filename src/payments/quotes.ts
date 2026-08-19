import { Db, ObjectId } from 'mongodb';
import { ServiceQuote } from '../stellar/types.js';
import { IExchangeRateProvider } from '9bridge';
import { ExpiredQuoteError } from '../errors/index.js';
import * as crypto from 'crypto';
import { getDatabase } from '../config/database.js';

interface QuoteDoc {
  _id?: ObjectId;
  quoteId: string;
  service: ServiceQuote['service'];
  fiatAmount: number;
  fiatCurrency: 'NGN';
  asset: 'USDC';
  assetAmount: string;
  exchangeRate: string;
  expiresAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export class QuoteManager {
  private rateProvider: IExchangeRateProvider;

  constructor(rateProvider: IExchangeRateProvider) {
    this.rateProvider = rateProvider;
  }

  private db(): Db {
    return getDatabase();
  }

  async createQuote(
    service: ServiceQuote['service'],
    fiatAmount: number,
    metadata: Record<string, unknown> = {},
  ): Promise<ServiceQuote> {
    const quote = await this.rateProvider.getRate('NGN', 'USDC');
    const assetAmount = (fiatAmount * quote.rate).toFixed(6);

    const id = `quote_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    const doc: QuoteDoc = {
      quoteId: id,
      service,
      fiatAmount,
      fiatCurrency: 'NGN',
      asset: 'USDC',
      assetAmount,
      exchangeRate: quote.rate.toString(),
      expiresAt: expiresAt.toISOString(),
      metadata: {
        ...metadata,
        rateSource: quote.source,
        rateTimestamp: quote.timestamp,
        rateQuoteId: quote.quoteId,
      },
      createdAt: now.toISOString(),
    };

    await this.db().collection<QuoteDoc>('service_quotes').insertOne(doc);

    return this.toQuote(doc);
  }

  async getQuote(quoteId: string): Promise<ServiceQuote> {
    const doc = await this.db().collection<QuoteDoc>('service_quotes').findOne({ quoteId });
    if (!doc) throw new Error(`Quote ${quoteId} not found`);

    if (new Date(doc.expiresAt) < new Date()) {
      throw new ExpiredQuoteError(quoteId);
    }

    return this.toQuote(doc);
  }

  async invalidateQuote(quoteId: string): Promise<void> {
    await this.db().collection<QuoteDoc>('service_quotes').deleteOne({ quoteId });
  }

  private toQuote(doc: QuoteDoc): ServiceQuote {
    return {
      quoteId: doc.quoteId,
      service: doc.service,
      fiatAmount: doc.fiatAmount,
      fiatCurrency: doc.fiatCurrency,
      asset: doc.asset,
      assetAmount: doc.assetAmount,
      exchangeRate: doc.exchangeRate,
      expiresAt: doc.expiresAt,
      metadata: doc.metadata,
    };
  }
}
