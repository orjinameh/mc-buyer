import { MongoClient, Db } from 'mongodb';

const state: { client: MongoClient | null; db: Db | null } = {
  client: null,
  db: null,
};

export async function connectDatabase(uri: string): Promise<Db> {
  if (state.db) return state.db;

  state.client = new MongoClient(uri);
  await state.client.connect();
  state.db = state.client.db();

  await state.db.collection('spending_accounts').createIndex({ userId: 1 }, { unique: true });
  await state.db.collection('spending_transactions').createIndex({ accountId: 1, createdAt: -1 });
  await state.db.collection('spending_transactions').createIndex({ reference: 1 }, { unique: true });
  await state.db.collection('service_quotes').createIndex({ quoteId: 1 }, { unique: true });
  await state.db.collection('service_quotes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 600 });
  await state.db.collection('payment_authorizations').createIndex({ id: 1 }, { unique: true });
  await state.db.collection('payment_authorizations').createIndex({ quoteId: 1 });
    await state.db.collection('agent_policies').createIndex({ agentId: 1 }, { unique: true });
    await state.db.collection('oauth_clients').createIndex({ client_id: 1 }, { unique: true });
    await state.db.collection('daily_wallet_spends').createIndex({ key: 1 }, { unique: true });

  return state.db;
}

export function getDatabase(): Db {
  if (!state.db) throw new Error('Database not connected. Call connectDatabase() first.');
  return state.db;
}

/** For testing: directly set the database instance. */
export function setDatabase(db: Db): void {
  state.db = db;
}

export async function closeDatabase(): Promise<void> {
  if (state.client) {
    await state.client.close();
    state.client = null;
    state.db = null;
  }
}
