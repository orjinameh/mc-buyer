import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { Db, Collection } from 'mongodb';
import { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { InvalidRequestError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

class MongoClientsStore implements OAuthRegisteredClientsStore {
  private col: Collection;

  constructor(private db: Db) {
    this.col = db.collection('oauth_clients');
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const doc = await this.col.findOne({ client_id: clientId });
    return doc ? (doc as any) : undefined;
  }

  async registerClient(clientMetadata: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
    await this.col.updateOne(
      { client_id: clientMetadata.client_id },
      { $set: clientMetadata },
      { upsert: true },
    );
    return clientMetadata;
  }
}

export interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
}

export class SimpleOAuthProvider implements OAuthServerProvider {
  private clientsStoreInstance: MongoClientsStore;
  private codesCol: Collection;
  private tokensCol: Collection;
  private pendingAuthsCol: Collection;
  private baseUrl: string;

  constructor(db: Db, baseUrl: string) {
    this.clientsStoreInstance = new MongoClientsStore(db);
    this.codesCol = db.collection('oauth_codes');
    this.tokensCol = db.collection('oauth_tokens');
    this.pendingAuthsCol = db.collection('oauth_pending_auths');
    this.baseUrl = baseUrl;

    this.codesCol.createIndex({ code: 1 }, { unique: true });
    this.codesCol.createIndex({ createdAt: 1 }, { expireAfterSeconds: 600 });
    this.tokensCol.createIndex({ token: 1 }, { unique: true });
    this.tokensCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    this.pendingAuthsCol.createIndex({ sessionId: 1 }, { unique: true });
    this.pendingAuthsCol.createIndex({ createdAt: 1 }, { expireAfterSeconds: 600 });
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return this.clientsStoreInstance;
  }

  async createPendingAuth(params: AuthorizationParams, client: OAuthClientInformationFull): Promise<string> {
    const sessionId = randomUUID();
    await this.pendingAuthsCol.insertOne({
      sessionId,
      client,
      params,
      createdAt: new Date(),
    });
    return sessionId;
  }

  async getPendingAuth(sessionId: string): Promise<PendingAuth | undefined> {
    const doc = await this.pendingAuthsCol.findOne({ sessionId });
    if (!doc) return undefined;
    return { client: doc.client, params: doc.params };
  }

  async completePendingAuth(sessionId: string, _provider: string, _email?: string): Promise<{ redirect: string } | null> {
    const doc = await this.pendingAuthsCol.findOneAndDelete({ sessionId });
    if (!doc) return null;

    const code = randomUUID();
    await this.codesCol.insertOne({
      code,
      client: doc.client,
      params: doc.params,
      createdAt: new Date(),
    });

    const targetUrl = new URL(doc.params.redirectUri);
    targetUrl.searchParams.set('code', code);
    if (doc.params.state) {
      targetUrl.searchParams.set('state', doc.params.state);
    }
    return { redirect: targetUrl.toString() };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    if (!client.redirect_uris.includes(params.redirectUri)) {
      throw new InvalidRequestError('Unregistered redirect_uri');
    }

    const loginUrl = new URL('/auth/login', this.baseUrl);
    loginUrl.searchParams.set('session_id', await this.createPendingAuth(params, client));
    loginUrl.searchParams.set('redirect_uri', params.redirectUri);
    if (params.state) loginUrl.searchParams.set('state', params.state);

    res.redirect(loginUrl.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const codeData = await this.codesCol.findOne({ code: authorizationCode });
    if (!codeData) {
      throw new Error('Invalid authorization code');
    }
    return codeData.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const codeData = await this.codesCol.findOneAndDelete({ code: authorizationCode });
    if (!codeData) {
      throw new Error('Invalid authorization code');
    }
    if (codeData.client.client_id !== client.client_id) {
      throw new Error('Client mismatch');
    }

    const token = randomUUID();
    const expiresAt = Date.now() + 3600000;
    await this.tokensCol.insertOne({
      token,
      clientId: client.client_id,
      scopes: codeData.params.scopes || [],
      expiresAt,
      createdAt: new Date(),
    });

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: (codeData.params.scopes || []).join(' '),
    };
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    _refreshToken: string,
    _scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    throw new Error('Refresh token exchange not implemented');
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenData = await this.tokensCol.findOne({ token });
    if (!tokenData || tokenData.expiresAt < Date.now()) {
      throw new Error('Invalid or expired token');
    }
    return {
      token,
      clientId: tokenData.clientId,
      scopes: tokenData.scopes,
      expiresAt: Math.floor(tokenData.expiresAt / 1000),
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    if (request.token) {
      await this.tokensCol.deleteOne({ token: request.token });
    }
  }
}
