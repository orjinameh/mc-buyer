import { Db, ObjectId } from 'mongodb';
import { AgentPolicy } from '../stellar/types.js';
import { UnauthorizedAgentError, SpendingLimitExceededError } from '../errors/index.js';
import { getDatabase } from '../config/database.js';

interface PolicyDoc {
  _id?: ObjectId;
  id: string;
  agentId: string;
  userId: string;
  enabled: boolean;
  dailyLimit: string;
  perTransactionLimit: string;
  allowedServices: AgentPolicy['allowedServices'];
  createdAt: string;
  updatedAt: string;
}

interface DailySpendDoc {
  _id?: ObjectId;
  key: string;
  agentId: string;
  date: string;
  total: string;
}

export class AgentPolicyManager {
  private db(): Db {
    return getDatabase();
  }

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
    const doc: PolicyDoc = {
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

    await this.db().collection<PolicyDoc>('agent_policies').insertOne(doc);
    return this.toPolicy(doc);
  }

  async getPolicy(agentId: string): Promise<AgentPolicy | undefined> {
    const doc = await this.db().collection<PolicyDoc>('agent_policies').findOne({ agentId });
    return doc ? this.toPolicy(doc) : undefined;
  }

  async updatePolicy(
    agentId: string,
    updates: Partial<Pick<AgentPolicy, 'enabled' | 'dailyLimit' | 'perTransactionLimit' | 'allowedServices'>>,
  ): Promise<AgentPolicy> {
    const doc = await this.db().collection<PolicyDoc>('agent_policies').findOne({ agentId });
    if (!doc) throw new UnauthorizedAgentError(agentId);

    const setFields: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (updates.enabled !== undefined) setFields.enabled = updates.enabled;
    if (updates.dailyLimit !== undefined) setFields.dailyLimit = updates.dailyLimit;
    if (updates.perTransactionLimit !== undefined) setFields.perTransactionLimit = updates.perTransactionLimit;
    if (updates.allowedServices !== undefined) setFields.allowedServices = updates.allowedServices;

    await this.db().collection<PolicyDoc>('agent_policies').updateOne(
      { agentId },
      { $set: setFields },
    );

    const updated = await this.db().collection<PolicyDoc>('agent_policies').findOne({ agentId });
    return this.toPolicy(updated!);
  }

  async authorize(
    agentId: string,
    service: AgentPolicy['allowedServices'][number],
    assetAmount: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const doc = await this.db().collection<PolicyDoc>('agent_policies').findOne({ agentId });

    if (!doc) {
      throw new UnauthorizedAgentError(agentId);
    }

    if (!doc.enabled) {
      return { allowed: false, reason: 'Agent is disabled' };
    }

    if (!doc.allowedServices.includes(service)) {
      return { allowed: false, reason: `Service "${service}" is not allowed for this agent` };
    }

    const amount = parseFloat(assetAmount);
    const perTxLimit = parseFloat(doc.perTransactionLimit);
    if (amount > perTxLimit) {
      throw new SpendingLimitExceededError('per-transaction', doc.perTransactionLimit);
    }

    const today = new Date().toISOString().split('T')[0];
    const key = `${agentId}:${today}`;
    const daily = await this.db().collection<DailySpendDoc>('daily_spends').findOne({ key });

    if (daily) {
      const dailyTotal = parseFloat(daily.total) + amount;
      const dailyLimit = parseFloat(doc.dailyLimit);
      if (dailyTotal > dailyLimit) {
        throw new SpendingLimitExceededError('daily', doc.dailyLimit);
      }
      await this.db().collection<DailySpendDoc>('daily_spends').updateOne(
        { key },
        { $set: { total: dailyTotal.toFixed(6) } },
      );
    } else {
      await this.db().collection<DailySpendDoc>('daily_spends').insertOne({
        key,
        agentId,
        date: today,
        total: assetAmount,
      });
    }

    return { allowed: true };
  }

  private toPolicy(doc: PolicyDoc): AgentPolicy {
    return {
      id: doc.id,
      agentId: doc.agentId,
      userId: doc.userId,
      enabled: doc.enabled,
      dailyLimit: doc.dailyLimit,
      perTransactionLimit: doc.perTransactionLimit,
      allowedServices: doc.allowedServices,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
