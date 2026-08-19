import { PaymentAuthorization, SpendingTransaction } from '../stellar/types.js';
import { SpendingAccountManager } from '../accounts/spendingAccount.js';
import { PaymentAuthorizationManager } from './authorization.js';

export class SettlementLayer {
  constructor(
    private accounts: SpendingAccountManager,
    private authorizations: PaymentAuthorizationManager,
  ) {}

  async settleAndDebit(
    userId: string,
    authorization: PaymentAuthorization,
  ): Promise<SpendingTransaction> {
    const tx = await this.accounts.debit(
      userId,
      authorization.assetAmount,
      authorization.service,
      authorization.reference,
      authorization.fiatAmount,
      (authorization.metadata.quote as Record<string, unknown>)?.exchangeRate as string | undefined,
      { authorizationId: authorization.id, agentId: authorization.agentId },
    );

    await this.authorizations.settle(authorization.id, tx.id);
    return tx;
  }

  async reverseAndCredit(
    userId: string,
    authorizationId: string,
  ): Promise<SpendingTransaction> {
    const auth = await this.authorizations.get(authorizationId);
    if (!auth) throw new Error(`Authorization ${authorizationId} not found`);

    const reversal = await this.accounts.reverseDebit(userId, auth.reference);
    await this.authorizations.reverse(authorizationId);
    return reversal;
  }
}
