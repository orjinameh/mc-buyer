import { ServiceQuote } from '../stellar/types.js';
import {
  IExchangeRateProvider,
  IExchangeRateQuote,
} from '9bridge';
import { ExpiredQuoteError } from '../errors/index.js';
import * as crypto from 'crypto';

export class QuoteManager {
  private quotes: Map<string, ServiceQuote & { createdAt: string }> = new Map();
  private rateProvider: IExchangeRateProvider;

  constructor(rateProvider: IExchangeRateProvider) {
    this.rateProvider = rateProvider;
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

    const serviceQuote: ServiceQuote = {
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
    };

    this.quotes.set(id, { ...serviceQuote, createdAt: now.toISOString() });
    return serviceQuote;
  }

  async getQuote(quoteId: string): Promise<ServiceQuote> {
    const quote = this.quotes.get(quoteId);
    if (!quote) throw new Error(`Quote ${quoteId} not found`);

    if (new Date(quote.expiresAt) < new Date()) {
      throw new ExpiredQuoteError(quoteId);
    }

    return quote;
  }

  async invalidateQuote(quoteId: string): Promise<void> {
    this.quotes.delete(quoteId);
  }
}
