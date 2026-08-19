export interface SpendingAccount {
  id: string;
  userId: string;
  asset: 'USDC';
  stellarNetwork: 'testnet' | 'mainnet';
  balance: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpendingTransaction {
  id: string;
  accountId: string;
  type: 'funding' | 'airtime' | 'data' | 'electricity' | 'cable';
  direction: 'credit' | 'debit';
  asset: 'USDC';
  assetAmount: string;
  fiatCurrency?: 'NGN';
  fiatAmount?: number;
  exchangeRate?: string;
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  reference: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ServiceQuote {
  quoteId: string;
  service: 'airtime' | 'data' | 'electricity' | 'cable';
  fiatAmount: number;
  fiatCurrency: 'NGN';
  asset: 'USDC';
  assetAmount: string;
  exchangeRate: string;
  expiresAt: string;
  metadata: Record<string, unknown>;
}

export interface PaymentAuthorization {
  id: string;
  userId: string;
  agentId: string;
  quoteId: string;
  service: 'airtime' | 'data' | 'electricity' | 'cable';
  assetAmount: string;
  fiatAmount: number;
  fiatCurrency: 'NGN';
  status: 'pending' | 'authorized' | 'settled' | 'executed' | 'failed' | 'reversed';
  reference: string;
  expiresAt: string;
  executionRef?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AgentPolicy {
  id: string;
  agentId: string;
  userId: string;
  enabled: boolean;
  dailyLimit: string;
  perTransactionLimit: string;
  allowedServices: ('airtime' | 'data' | 'electricity' | 'cable')[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceResult {
  success: boolean;
  reference: string;
  providerReference?: string;
  message: string;
  metadata: Record<string, unknown>;
}

export type NetworkProvider = 'mtn' | 'airtel' | 'glo' | '9mobile';

export type CableProvider = 'dstv' | 'gotv' | 'startimes';

export type DiscoProvider =
  | 'ikeja-electric'
  | 'eko-electric'
  | 'ibadan-electric'
  | 'enugu-electric'
  | 'jos-electric'
  | 'kaduna-electric'
  | 'kano-electric'
  | 'port-harcourt-electric'
  | 'abuja-electric'
  | 'benin-electric'
  | 'yola-electric';
