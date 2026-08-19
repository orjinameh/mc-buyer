import {
  create9bridge,
  GatewayFactory,
  IWebhookConfig,
  GatewayConfig,
  IVerifiedPaymentEvent,
  IX402PaymentChallenge,
  IExchangeRateProvider,
} from '9bridge';
import { config } from '../config/env.js';
import { SpendingAccountManager } from '../accounts/spendingAccount.js';

export class NineBridgeIntegration {
  gatewayFactory: GatewayFactory;
  private webhookRouter: any;
  private accounts: SpendingAccountManager;
  private rateProvider: IExchangeRateProvider;

  constructor(accounts: SpendingAccountManager, rateProvider: IExchangeRateProvider) {
    this.accounts = accounts;
    this.rateProvider = rateProvider;

    const gatewayConfig: GatewayConfig = {
      paystack: config.paystack.secretKey ? { apiKey: config.paystack.secretKey } : undefined,
      monnify: config.monnify.apiKey
        ? {
            apiKey: config.monnify.apiKey,
            secretKey: config.monnify.secretKey,
            contractCode: config.monnify.contractCode,
          }
        : undefined,
      flutterwave: config.flutterwave.secretKey
        ? { apiKey: config.flutterwave.secretKey }
        : undefined,
    };

    const webhookConfig: IWebhookConfig = {
      paystackSecret: config.paystack.secretKey,
      flutterwaveSecret: config.flutterwave.secretKey,
      stellarPayTo: config.stellar.payTo,
      sorobanContractId: config.stellar.sorobanContractId,
      stellarNetwork: config.stellar.network,
    };

    const { gatewayFactory, webhookRouter } = create9bridge(gatewayConfig, webhookConfig);
    this.gatewayFactory = gatewayFactory;
    this.webhookRouter = webhookRouter;
  }

  getExpressRouter() {
    return this.webhookRouter;
  }

  async handleFundingConfirmation(
    event: IVerifiedPaymentEvent,
  ): Promise<void> {
    const userId = (event.metadata.userId as string) ?? event.customer.email;

    if (!userId) {
      throw new Error('Cannot process funding: no userId or customer email');
    }

    await this.accounts.credit(
      userId,
      event.metadata.usdcAmount as string,
      `funding_${event.reference}`,
      {
        gateway: event.gateway,
        channel: event.channel,
        originalAmount: event.amount,
        originalCurrency: event.currency,
        exchangeRate: event.metadata.exchangeRate,
        paystackReference: event.reference,
      },
    );
  }
}
