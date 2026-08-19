import { AgentPolicy } from '../stellar/types.js';
import { UnauthorizedAgentError, SpendingLimitExceededError } from '../errors/index.js';

export class AgentPolicyManager {
  private policies: Map<string, AgentPolicy> = new Map();
  private dailySpend: Map<string, { date: string; total: string }> = new Map();

  async createPolicy(
    agentId: string,
    userId: string,
    config: {
      enabled?: boolean;
      dailyLimit?: string;
      perTransactionLimit?: string;
      allowedServices?: AgentPolicy['allowedServices'];
    } = {},
  ): Promise<AgentPolicy> {
    const policy: AgentPolicy = {
      id: `policy_${agentId}_${Date.now()}`,
      agentId,
      userId,
      enabled: config.enabled ?? true,
      dailyLimit: config.dailyLimit ?? '10',
      perTransactionLimit: config.perTransactionLimit ?? '3',
      allowedServices: config.allowedServices ?? ['airtime', 'data', 'electricity'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.policies.set(agentId, policy);
    return policy;
  }

  async getPolicy(agentId: string): Promise<AgentPolicy | undefined> {
    return this.policies.get(agentId);
  }

  async updatePolicy(
    agentId: string,
    updates: Partial<Pick<AgentPolicy, 'enabled' | 'dailyLimit' | 'perTransactionLimit' | 'allowedServices'>>,
  ): Promise<AgentPolicy> {
    const policy = this.policies.get(agentId);
    if (!policy) throw new UnauthorizedAgentError(agentId);

    if (updates.enabled !== undefined) policy.enabled = updates.enabled;
    if (updates.dailyLimit !== undefined) policy.dailyLimit = updates.dailyLimit;
    if (updates.perTransactionLimit !== undefined) policy.perTransactionLimit = updates.perTransactionLimit;
    if (updates.allowedServices !== undefined) policy.allowedServices = updates.allowedServices;
    policy.updatedAt = new Date().toISOString();

    this.policies.set(agentId, policy);
    return policy;
  }

  async authorize(
    agentId: string,
    service: AgentPolicy['allowedServices'][number],
    assetAmount: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const policy = this.policies.get(agentId);

    if (!policy) {
      throw new UnauthorizedAgentError(agentId);
    }

    if (!policy.enabled) {
      return { allowed: false, reason: 'Agent is disabled' };
    }

    if (!policy.allowedServices.includes(service)) {
      return { allowed: false, reason: `Service "${service}" is not allowed for this agent` };
    }

    const amount = parseFloat(assetAmount);
    const perTxLimit = parseFloat(policy.perTransactionLimit);
    if (amount > perTxLimit) {
      throw new SpendingLimitExceededError(
        'per-transaction',
        policy.perTransactionLimit,
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const key = `${agentId}:${today}`;
    const daily = this.dailySpend.get(key);

    if (daily) {
      const dailyTotal = parseFloat(daily.total) + amount;
      const dailyLimit = parseFloat(policy.dailyLimit);
      if (dailyTotal > dailyLimit) {
        throw new SpendingLimitExceededError('daily', policy.dailyLimit);
      }
      daily.total = dailyTotal.toFixed(6);
    } else {
      this.dailySpend.set(key, { date: today, total: assetAmount });
    }

    return { allowed: true };
  }
}
