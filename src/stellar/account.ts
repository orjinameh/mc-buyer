export interface StellarAccountConfig {
  network: 'testnet' | 'mainnet';
  contractId: string;
}

export interface StellarAccount {
  publicKey: string;
  network: 'testnet' | 'mainnet';
}

export class StellarAccountManager {
  private accounts: Map<string, StellarAccount> = new Map();
  private config: StellarAccountConfig;

  constructor(config: StellarAccountConfig) {
    this.config = config;
  }

  async getOrCreate(userId: string): Promise<StellarAccount> {
    const existing = this.accounts.get(userId);
    if (existing) return existing;

    const account: StellarAccount = {
      publicKey: `G${Array.from({ length: 55 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)],
      ).join('')}`,
      network: this.config.network,
    };

    this.accounts.set(userId, account);
    return account;
  }

  getContractId(): string {
    return this.config.contractId;
  }

  getNetwork(): string {
    return this.config.network;
  }
}
