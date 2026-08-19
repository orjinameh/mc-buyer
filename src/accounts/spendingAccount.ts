import { Db, ObjectId } from 'mongodb';
import { SpendingAccount, SpendingTransaction } from '../stellar/types.js';
import { InsufficientBalanceError, DuplicateRequestError } from '../errors/index.js';
import { getDatabase } from '../config/database.js';

interface AccountDoc {
  _id?: ObjectId;
  id: string;
  userId: string;
  asset: 'USDC';
  stellarNetwork: 'testnet' | 'mainnet';
  balance: string;
  createdAt: string;
  updatedAt: string;
}

interface TransactionDoc {
  _id?: ObjectId;
  id: string;
  accountId: string;
  type: SpendingTransaction['type'];
  direction: 'credit' | 'debit';
  asset: 'USDC';
  assetAmount: string;
  fiatCurrency?: 'NGN';
  fiatAmount?: number;
  exchangeRate?: string;
  status: SpendingTransaction['status'];
  reference: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export class SpendingAccountManager {
  private db(): Db {
    return getDatabase();
  }

  async getAccount(userId: string): Promise<SpendingAccount> {
    const doc = await this.db().collection<AccountDoc>('spending_accounts').findOne({ userId });
    if (!doc) throw new Error(`No spending account for user ${userId}`);
    return this.toAccount(doc);
  }

  async createAccount(userId: string, network: 'testnet' | 'mainnet'): Promise<SpendingAccount> {
    const existing = await this.db().collection<AccountDoc>('spending_accounts').findOne({ userId });
    if (existing) return this.toAccount(existing);

    const account: AccountDoc = {
      id: `acct_${userId}_${Date.now()}`,
      userId,
      asset: 'USDC',
      stellarNetwork: network,
      balance: '0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.db().collection<AccountDoc>('spending_accounts').insertOne(account);
    return this.toAccount(account);
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
    const existing = await this.db().collection<TransactionDoc>('spending_transactions').findOne({ reference });
    if (existing && existing.status === 'completed') {
      throw new DuplicateRequestError(reference);
    }

    const account = await this.getAccount(userId);
    const newBalance = (parseFloat(account.balance) + parseFloat(amount)).toFixed(6);

    const tx: TransactionDoc = {
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

    await this.db().collection<TransactionDoc>('spending_transactions').insertOne(tx);
    await this.db().collection<AccountDoc>('spending_accounts').updateOne(
      { userId },
      { $set: { balance: newBalance, updatedAt: new Date().toISOString() } },
    );

    return this.toTransaction(tx);
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
    const existing = await this.db().collection<TransactionDoc>('spending_transactions').findOne({ reference });
    if (existing && existing.status === 'completed') {
      throw new DuplicateRequestError(reference);
    }

    const account = await this.getAccount(userId);
    const debitAmount = parseFloat(amount);
    const currentBalance = parseFloat(account.balance);

    if (debitAmount > currentBalance) {
      throw new InsufficientBalanceError(amount, account.balance);
    }

    const newBalance = (currentBalance - debitAmount).toFixed(6);

    const tx: TransactionDoc = {
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

    await this.db().collection<TransactionDoc>('spending_transactions').insertOne(tx);
    await this.db().collection<AccountDoc>('spending_accounts').updateOne(
      { userId },
      { $set: { balance: newBalance, updatedAt: new Date().toISOString() } },
    );

    return this.toTransaction(tx);
  }

  async reverseDebit(userId: string, reference: string): Promise<SpendingTransaction> {
    const account = await this.getAccount(userId);
    const originalTx = await this.db().collection<TransactionDoc>('spending_transactions').findOne({
      accountId: account.id,
      reference,
      direction: 'debit',
      status: 'completed',
    });

    if (!originalTx) {
      throw new Error(`No completed debit found with reference ${reference}`);
    }

    const reversalAmount = originalTx.assetAmount;
    const newBalance = (parseFloat(account.balance) + parseFloat(reversalAmount)).toFixed(6);

    const tx: TransactionDoc = {
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

    await this.db().collection<TransactionDoc>('spending_transactions').insertOne(tx);
    await this.db().collection<TransactionDoc>('spending_transactions').updateOne(
      { _id: originalTx._id },
      { $set: { status: 'reversed' } },
    );
    await this.db().collection<AccountDoc>('spending_accounts').updateOne(
      { userId },
      { $set: { balance: newBalance, updatedAt: new Date().toISOString() } },
    );

    return this.toTransaction(tx);
  }

  async getTransactions(userId: string, limit: number = 50, offset: number = 0): Promise<SpendingTransaction[]> {
    const account = await this.getAccount(userId);
    const txs = await this.db().collection<TransactionDoc>('spending_transactions')
      .find({ accountId: account.id })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    return txs.map((t) => this.toTransaction(t));
  }

  private toAccount(doc: AccountDoc): SpendingAccount {
    return {
      id: doc.id,
      userId: doc.userId,
      asset: doc.asset,
      stellarNetwork: doc.stellarNetwork,
      balance: doc.balance,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toTransaction(doc: TransactionDoc): SpendingTransaction {
    return {
      id: doc.id,
      accountId: doc.accountId,
      type: doc.type,
      direction: doc.direction,
      asset: doc.asset,
      assetAmount: doc.assetAmount,
      fiatCurrency: doc.fiatCurrency,
      fiatAmount: doc.fiatAmount,
      exchangeRate: doc.exchangeRate,
      status: doc.status,
      reference: doc.reference,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
    };
  }
}
