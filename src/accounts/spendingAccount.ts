import { SpendingAccount, SpendingTransaction } from '../stellar/types.js';
import { InsufficientBalanceError, DuplicateRequestError } from '../errors/index.js';

export class SpendingAccountManager {
  private accounts: Map<string, SpendingAccount> = new Map();
  private transactions: Map<string, SpendingTransaction[]> = new Map();

  async getAccount(userId: string): Promise<SpendingAccount> {
    const account = this.accounts.get(userId);
    if (!account) {
      throw new Error(`No spending account for user ${userId}`);
    }
    return { ...account };
  }

  async createAccount(userId: string, network: 'testnet' | 'mainnet'): Promise<SpendingAccount> {
    if (this.accounts.has(userId)) {
      return this.getAccount(userId);
    }

    const account: SpendingAccount = {
      id: `acct_${userId}_${Date.now()}`,
      userId,
      asset: 'USDC',
      stellarNetwork: network,
      balance: '0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.accounts.set(userId, account);
    this.transactions.set(account.id, []);
    return { ...account };
  }

  async getBalance(userId: string): Promise<{ available: string; asset: string; network: string }> {
    const account = await this.getAccount(userId);
    return {
      available: account.balance,
      asset: account.asset,
      network: account.stellarNetwork,
    };
  }

  async credit(
    userId: string,
    amount: string,
    reference: string,
    metadata: Record<string, unknown> = {},
  ): Promise<SpendingTransaction> {
    const account = await this.getAccount(userId);

    if (this.hasTransaction(account.id, reference)) {
      throw new DuplicateRequestError(reference);
    }

    const newBalance = (parseFloat(account.balance) + parseFloat(amount)).toFixed(6);

    const tx: SpendingTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      accountId: account.id,
      type: 'funding',
      direction: 'credit',
      asset: 'USDC',
      assetAmount: amount,
      status: 'completed',
      reference,
      metadata,
      createdAt: new Date().toISOString(),
    };

    account.balance = newBalance;
    account.updatedAt = new Date().toISOString();
    this.accounts.set(userId, account);
    this.appendTransaction(account.id, tx);

    return tx;
  }

  async debit(
    userId: string,
    amount: string,
    type: SpendingTransaction['type'],
    reference: string,
    fiatAmount?: number,
    exchangeRate?: string,
    metadata: Record<string, unknown> = {},
  ): Promise<SpendingTransaction> {
    const account = await this.getAccount(userId);

    if (this.hasTransaction(account.id, reference)) {
      throw new DuplicateRequestError(reference);
    }

    const debitAmount = parseFloat(amount);
    const currentBalance = parseFloat(account.balance);

    if (debitAmount > currentBalance) {
      throw new InsufficientBalanceError(amount, account.balance);
    }

    const newBalance = (currentBalance - debitAmount).toFixed(6);

    const tx: SpendingTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      accountId: account.id,
      type,
      direction: 'debit',
      asset: 'USDC',
      assetAmount: amount,
      fiatCurrency: fiatAmount !== undefined ? 'NGN' : undefined,
      fiatAmount,
      exchangeRate,
      status: 'completed',
      reference,
      metadata,
      createdAt: new Date().toISOString(),
    };

    account.balance = newBalance;
    account.updatedAt = new Date().toISOString();
    this.accounts.set(userId, account);
    this.appendTransaction(account.id, tx);

    return tx;
  }

  async reverseDebit(
    userId: string,
    reference: string,
  ): Promise<SpendingTransaction> {
    const account = await this.getAccount(userId);
    const txs = this.transactions.get(account.id) ?? [];
    const originalTx = txs.find(
      (t) => t.reference === reference && t.direction === 'debit' && t.status === 'completed',
    );

    if (!originalTx) {
      throw new Error(`No completed debit transaction found with reference ${reference}`);
    }

    const reversalAmount = originalTx.assetAmount;
    const newBalance = (parseFloat(account.balance) + parseFloat(reversalAmount)).toFixed(6);

    const tx: SpendingTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      accountId: account.id,
      type: originalTx.type,
      direction: 'credit',
      asset: 'USDC',
      assetAmount: reversalAmount,
      fiatCurrency: originalTx.fiatCurrency,
      fiatAmount: originalTx.fiatAmount,
      exchangeRate: originalTx.exchangeRate,
      status: 'completed',
      reference: `reversal_${reference}`,
      metadata: { originalReference: reference, reversalFor: originalTx.id },
      createdAt: new Date().toISOString(),
    };

    originalTx.status = 'reversed';
    account.balance = newBalance;
    account.updatedAt = new Date().toISOString();
    this.accounts.set(userId, account);
    this.appendTransaction(account.id, tx);

    return tx;
  }

  async getTransactions(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<SpendingTransaction[]> {
    const account = await this.getAccount(userId);
    const txs = this.transactions.get(account.id) ?? [];
    return txs.slice(offset, offset + limit);
  }

  private hasTransaction(accountId: string, reference: string): boolean {
    const txs = this.transactions.get(accountId) ?? [];
    return txs.some((t) => t.reference === reference && t.status === 'completed');
  }

  private appendTransaction(accountId: string, tx: SpendingTransaction): void {
    const txs = this.transactions.get(accountId) ?? [];
    txs.push(tx);
    this.transactions.set(accountId, txs);
  }
}
