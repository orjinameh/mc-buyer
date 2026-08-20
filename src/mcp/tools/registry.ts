import { Db } from 'mongodb';
import { SpendingAccountManager } from '../../accounts/spendingAccount.js';
import { AgentPolicyManager } from '../../agents/policies.js';
import { QuoteManager } from '../../payments/quotes.js';
import { PaymentAuthorizationManager } from '../../payments/authorization.js';
import { SettlementLayer } from '../../payments/settlement.js';
import { VTpassProvider } from '../../vtu/providers/vtpass.js';
import { findAirtimeAmount, findDataPlan, findCablePlan } from '../../vtu/catalog.js';
import { simulateStellarSettlement } from '../../stellar/settlement.js';
import { StellarAccountManager } from '../../stellar/account.js';
import { MCBuyerError } from '../../errors/index.js';
import { config } from '../../config/env.js';
import type { ServiceQuote } from '../../stellar/types.js';
import {
  enforceCategoryCap,
  enforceDailyWalletCap,
  validateSlippage,
  validateStellarDestination,
  acquireTransactionLock,
  releaseTransactionLock,
  type PathPaymentQuote,
} from '../../security/protocol.js';

export interface ToolContext {
  userId: string;
  agentId: string;
}

export class ToolRegistry {
  constructor(
    private db: Db,
    private accounts: SpendingAccountManager,
    private policies: AgentPolicyManager,
    private quotes: QuoteManager,
    private authorizations: PaymentAuthorizationManager,
    private settlement: SettlementLayer,
    private vtpass: VTpassProvider,
    private stellarAccounts: StellarAccountManager,
  ) {}

  private async ensureAccount(userId: string) {
    try {
      return await this.accounts.getAccount(userId);
    } catch {
      return await this.accounts.createAccount(userId, config.stellar.network);
    }
  }

  private async gatekeeper(
    service: string,
    assetAmount: string,
    userId: string,
    ctx: ToolContext,
  ): Promise<{ cap: ReturnType<typeof enforceCategoryCap> }> {
    const cap = enforceCategoryCap(service, assetAmount);
    await enforceDailyWalletCap(this.db, userId, cap.amount);
    await this.policies.authorize(ctx.agentId, service as any, assetAmount);
    return { cap };
  }

  async getSpendingBalance(ctx: ToolContext) {
    await this.ensureAccount(ctx.userId);
    const balance = await this.accounts.getBalance(ctx.userId);

    return {
      asset: balance.asset,
      network: balance.network,
      available: balance.available,
      fiatEstimate: `≈ ₦${(parseFloat(balance.available) * config.exchangeRate.fallbackNgNUsd).toLocaleString()}`,
    };
  }

  async quoteAirtime(params: { network: string; amountNGN: number }) {
    const exists = findAirtimeAmount(params.network, params.amountNGN);
    if (!exists) {
      throw new MCBuyerError(
        `Invalid airtime: ${params.network} ₦${params.amountNGN} not found`,
        'INVALID_AIRTIME_AMOUNT',
        400,
      );
    }

    const quote = await this.quotes.createQuote('airtime', params.amountNGN, {
      network: params.network,
    });

    return {
      service: 'airtime' as const,
      fiatAmount: quote.fiatAmount,
      fiatCurrency: 'NGN' as const,
      asset: 'USDC' as const,
      assetAmount: quote.assetAmount,
      exchangeRate: quote.exchangeRate,
      quoteId: quote.quoteId,
      expiresAt: quote.expiresAt,
    };
  }

  async buyAirtime(
    params: { phoneNumber: string; network: string; amountNGN: number; quoteId: string },
    ctx: ToolContext,
  ) {
    const quote = await this.quotes.getQuote(params.quoteId);
    const sessionId = `airtime_${ctx.userId}_${params.quoteId}`;

    if (!acquireTransactionLock(sessionId, 'airtime')) {
      throw new MCBuyerError(
        'Transaction already in progress. Wait for it to complete or start a fresh quote.',
        'TRANSACTION_IN_PROGRESS',
        409,
      );
    }

    try {
      await this.gatekeeper('airtime', quote.assetAmount, ctx.userId, ctx);

      const auth = await this.authorizations.create({
        userId: ctx.userId,
        agentId: ctx.agentId,
        quote,
        service: 'airtime',
        destination: { phoneNumber: params.phoneNumber, network: params.network },
      });

      const stellarAcc = await this.stellarAccounts.getOrCreate(ctx.userId);
      await simulateStellarSettlement({
        authorization: auth,
        stellarAccount: stellarAcc.publicKey,
        contractId: this.stellarAccounts.getContractId(),
        network: this.stellarAccounts.getNetwork(),
      });

      const debitTx = await this.settlement.settleAndDebit(ctx.userId, auth);

      try {
        const result = await this.vtpass.buyAirtime({
          phoneNumber: params.phoneNumber,
          network: params.network,
          amountNGN: params.amountNGN,
          reference: auth.reference,
        });

        await this.authorizations.execute(auth.id, result.providerReference ?? '');

        return {
          success: true,
          transactionId: debitTx.id,
          authorizationId: auth.id,
          reference: auth.reference,
          providerReference: result.providerReference,
          assetAmount: quote.assetAmount,
          fiatAmount: quote.fiatAmount,
          category: 'airtime_data',
          cap: '50 USDC',
          message: result.message,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'VTU execution failed';
        await this.authorizations.fail(auth.id, errorMsg);
        await this.settlement.reverseAndCredit(ctx.userId, auth.id);

        return {
          success: false,
          authorizationId: auth.id,
          error: errorMsg,
          reversed: true,
        };
      }
    } finally {
      releaseTransactionLock(sessionId);
    }
  }

  async quoteData(params: { network: string; plan: string }) {
    const planDetails = findDataPlan(params.network, params.plan);
    if (!planDetails) {
      throw new MCBuyerError(
        `Invalid data plan: ${params.network} ${params.plan}`,
        'INVALID_DATA_PLAN',
        400,
      );
    }

    const quote = await this.quotes.createQuote('data', planDetails.price, {
      network: params.network,
      plan: params.plan,
      planSize: planDetails.size,
      validity: planDetails.validity,
    });

    return {
      service: 'data' as const,
      plan: planDetails,
      fiatAmount: quote.fiatAmount,
      fiatCurrency: 'NGN' as const,
      asset: 'USDC' as const,
      assetAmount: quote.assetAmount,
      exchangeRate: quote.exchangeRate,
      quoteId: quote.quoteId,
      expiresAt: quote.expiresAt,
    };
  }

  async buyData(
    params: { phoneNumber: string; network: string; plan: string; quoteId: string },
    ctx: ToolContext,
  ) {
    const quote = await this.quotes.getQuote(params.quoteId);
    const sessionId = `data_${ctx.userId}_${params.quoteId}`;

    if (!acquireTransactionLock(sessionId, 'data')) {
      throw new MCBuyerError(
        'Transaction already in progress. Wait for it to complete or start a fresh quote.',
        'TRANSACTION_IN_PROGRESS',
        409,
      );
    }

    try {
      await this.gatekeeper('data', quote.assetAmount, ctx.userId, ctx);

      const auth = await this.authorizations.create({
        userId: ctx.userId,
        agentId: ctx.agentId,
        quote,
        service: 'data',
        destination: { phoneNumber: params.phoneNumber, network: params.network, plan: params.plan },
      });

      const stellarAcc = await this.stellarAccounts.getOrCreate(ctx.userId);
      await simulateStellarSettlement({
        authorization: auth,
        stellarAccount: stellarAcc.publicKey,
        contractId: this.stellarAccounts.getContractId(),
        network: this.stellarAccounts.getNetwork(),
      });

      const debitTx = await this.settlement.settleAndDebit(ctx.userId, auth);

      try {
        const result = await this.vtpass.buyData({
          phoneNumber: params.phoneNumber,
          network: params.network,
          plan: params.plan,
          reference: auth.reference,
        });

        await this.authorizations.execute(auth.id, result.providerReference ?? '');

        return {
          success: true,
          transactionId: debitTx.id,
          authorizationId: auth.id,
          reference: auth.reference,
          providerReference: result.providerReference,
          assetAmount: quote.assetAmount,
          fiatAmount: quote.fiatAmount,
          category: 'airtime_data',
          cap: '50 USDC',
          message: result.message,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'VTU execution failed';
        await this.authorizations.fail(auth.id, errorMsg);
        await this.settlement.reverseAndCredit(ctx.userId, auth.id);

        return {
          success: false,
          authorizationId: auth.id,
          error: errorMsg,
          reversed: true,
        };
      }
    } finally {
      releaseTransactionLock(sessionId);
    }
  }

  async quoteElectricity(params: { discoProvider: string; amountNGN: number }) {
    const quote = await this.quotes.createQuote('electricity', params.amountNGN, {
      discoProvider: params.discoProvider,
    });

    return {
      service: 'electricity' as const,
      fiatAmount: quote.fiatAmount,
      fiatCurrency: 'NGN' as const,
      asset: 'USDC' as const,
      assetAmount: quote.assetAmount,
      exchangeRate: quote.exchangeRate,
      quoteId: quote.quoteId,
      expiresAt: quote.expiresAt,
    };
  }

  async payElectricityBill(
    params: { meterNumber: string; discoProvider: string; amountNGN: number; quoteId: string },
    ctx: ToolContext,
  ) {
    const quote = await this.quotes.getQuote(params.quoteId);
    const sessionId = `electricity_${ctx.userId}_${params.quoteId}`;

    if (!acquireTransactionLock(sessionId, 'electricity')) {
      throw new MCBuyerError(
        'Transaction already in progress. Wait for it to complete or start a fresh quote.',
        'TRANSACTION_IN_PROGRESS',
        409,
      );
    }

    try {
      await this.gatekeeper('electricity', quote.assetAmount, ctx.userId, ctx);

      const auth = await this.authorizations.create({
        userId: ctx.userId,
        agentId: ctx.agentId,
        quote,
        service: 'electricity',
        destination: { meterNumber: params.meterNumber, discoProvider: params.discoProvider },
      });

      const stellarAcc = await this.stellarAccounts.getOrCreate(ctx.userId);
      await simulateStellarSettlement({
        authorization: auth,
        stellarAccount: stellarAcc.publicKey,
        contractId: this.stellarAccounts.getContractId(),
        network: this.stellarAccounts.getNetwork(),
      });

      const debitTx = await this.settlement.settleAndDebit(ctx.userId, auth);

      try {
        const result = await this.vtpass.payElectricity({
          meterNumber: params.meterNumber,
          discoProvider: params.discoProvider,
          amountNGN: params.amountNGN,
          reference: auth.reference,
        });

        await this.authorizations.execute(auth.id, result.providerReference ?? '');

        return {
          success: true,
          transactionId: debitTx.id,
          authorizationId: auth.id,
          reference: auth.reference,
          providerReference: result.providerReference,
          token: result.metadata.token,
          units: result.metadata.units,
          assetAmount: quote.assetAmount,
          fiatAmount: quote.fiatAmount,
          category: 'electricity_bills',
          cap: '250 USDC',
          message: result.message,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'VTU execution failed';
        await this.authorizations.fail(auth.id, errorMsg);
        await this.settlement.reverseAndCredit(ctx.userId, auth.id);

        return {
          success: false,
          authorizationId: auth.id,
          error: errorMsg,
          reversed: true,
        };
      }
    } finally {
      releaseTransactionLock(sessionId);
    }
  }

  async quoteCable(params: { provider: string; bundlePlan: string }) {
    const plan = findCablePlan(params.provider, params.bundlePlan);
    if (!plan) {
      throw new MCBuyerError(
        `Invalid cable plan: ${params.provider} ${params.bundlePlan}`,
        'INVALID_CABLE_PLAN',
        400,
      );
    }

    const quote = await this.quotes.createQuote('cable', plan.price, {
      provider: params.provider,
      bundlePlan: params.bundlePlan,
      planName: plan.name,
    });

    return {
      service: 'cable' as const,
      plan,
      fiatAmount: quote.fiatAmount,
      fiatCurrency: 'NGN' as const,
      asset: 'USDC' as const,
      assetAmount: quote.assetAmount,
      exchangeRate: quote.exchangeRate,
      quoteId: quote.quoteId,
      expiresAt: quote.expiresAt,
    };
  }

  async renewCableTv(
    params: { smartCardNumber: string; provider: string; bundlePlan: string; quoteId: string },
    ctx: ToolContext,
  ) {
    const quote = await this.quotes.getQuote(params.quoteId);
    const sessionId = `cable_${ctx.userId}_${params.quoteId}`;

    if (!acquireTransactionLock(sessionId, 'cable')) {
      throw new MCBuyerError(
        'Transaction already in progress. Wait for it to complete or start a fresh quote.',
        'TRANSACTION_IN_PROGRESS',
        409,
      );
    }

    try {
      await this.gatekeeper('cable', quote.assetAmount, ctx.userId, ctx);

      const auth = await this.authorizations.create({
        userId: ctx.userId,
        agentId: ctx.agentId,
        quote,
        service: 'cable',
        destination: { smartCardNumber: params.smartCardNumber, provider: params.provider },
      });

      const stellarAcc = await this.stellarAccounts.getOrCreate(ctx.userId);
      await simulateStellarSettlement({
        authorization: auth,
        stellarAccount: stellarAcc.publicKey,
        contractId: this.stellarAccounts.getContractId(),
        network: this.stellarAccounts.getNetwork(),
      });

      const debitTx = await this.settlement.settleAndDebit(ctx.userId, auth);

      try {
        const result = await this.vtpass.renewCable({
          smartCardNumber: params.smartCardNumber,
          provider: params.provider,
          bundlePlan: params.bundlePlan,
          reference: auth.reference,
        });

        await this.authorizations.execute(auth.id, result.providerReference ?? '');

        return {
          success: true,
          transactionId: debitTx.id,
          authorizationId: auth.id,
          reference: auth.reference,
          providerReference: result.providerReference,
          assetAmount: quote.assetAmount,
          fiatAmount: quote.fiatAmount,
          category: 'electricity_bills',
          cap: '250 USDC',
          message: result.message,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'VTU execution failed';
        await this.authorizations.fail(auth.id, errorMsg);
        await this.settlement.reverseAndCredit(ctx.userId, auth.id);

        return {
          success: false,
          authorizationId: auth.id,
          error: errorMsg,
          reversed: true,
        };
      }
    } finally {
      releaseTransactionLock(sessionId);
    }
  }

  async swapTokens(
    params: {
      sourceAsset: string;
      destinationAsset: string;
      amount: string;
      destinationAddress: string;
      memo?: string;
    },
    ctx: ToolContext,
  ) {
    const destValidation = validateStellarDestination(params.destinationAddress, params.memo);
    if (!destValidation.valid) {
      throw new MCBuyerError(destValidation.error!, 'INVALID_STELLAR_DESTINATION', 400);
    }

    const amount = parseFloat(params.amount);
    const sessionId = `swap_${ctx.userId}_${params.sourceAsset}_${params.destinationAsset}_${Date.now()}`;

    if (!acquireTransactionLock(sessionId, 'swap')) {
      throw new MCBuyerError(
        'Transaction already in progress. Wait for it to complete or request a fresh quote.',
        'TRANSACTION_IN_PROGRESS',
        409,
      );
    }

    try {
      await this.gatekeeper('swap', params.amount, ctx.userId, ctx);

      const quote: PathPaymentQuote = {
        sourceAsset: params.sourceAsset,
        destinationAsset: params.destinationAsset,
        sourceAmount: params.amount,
        destinationAmount: (amount * 0.995).toFixed(6),
        expectedPrice: '1.0',
        networkFee: '0.00001',
        slippageBps: 50,
      };

      validateSlippage(quote);

      return {
        success: true,
        sourceAsset: params.sourceAsset,
        destinationAsset: params.destinationAsset,
        sourceAmount: params.amount,
        destinationAmount: quote.destinationAmount,
        expectedPrice: quote.expectedPrice,
        networkFee: quote.networkFee,
        slippage: `${quote.slippageBps / 100}%`,
        destinationAddress: params.destinationAddress,
        category: 'flights_shopping_swap',
        cap: '3000 USDC',
        message: 'Swap quote validated. Slippage within threshold.',
      };
    } finally {
      releaseTransactionLock(sessionId);
    }
  }

  async getTransactionHistory(
    ctx: ToolContext,
    opts: { limit?: number; service?: string },
  ) {
    const txs = await this.accounts.getTransactions(ctx.userId, opts.limit ?? 20);

    if (opts.service) {
      return txs.filter((tx) => tx.type === opts.service);
    }

    return txs;
  }
}
