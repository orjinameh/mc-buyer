import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { Db } from 'mongodb';
import { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { InvalidRequestError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

class MongoClientsStore implements OAuthRegisteredClientsStore {
  constructor(private db: Db) {}

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    console.log(`[OAuth] Looking up client: ${clientId}`);
    const doc = await this.db.collection('oauth_clients').findOne({ client_id: clientId });
    console.log(`[OAuth] Client found: ${!!doc}`);
    return doc ? (doc as any) : undefined;
  }

  async registerClient(clientMetadata: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
    console.log(`[OAuth] Registering client: ${clientMetadata.client_id}`);
    await this.db.collection('oauth_clients').updateOne(
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

export interface UserAccount {
  passkey: string;
  secret: string;
  address: string;
  daily_limit: number;
  per_tx_limit: number;
}

export class SimpleOAuthProvider implements OAuthServerProvider {
  private clientsStoreInstance: MongoClientsStore;
  private codes: Map<string, any> = new Map();
  private tokens: Map<string, any> = new Map();
  private pendingAuths: Map<string, PendingAuth> = new Map();

  constructor(db: Db) {
    this.clientsStoreInstance = new MongoClientsStore(db);
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return this.clientsStoreInstance;
  }

  createPendingAuth(params: AuthorizationParams, client: OAuthClientInformationFull): string {
    const sessionId = randomUUID();
    this.pendingAuths.set(sessionId, { client, params });
    return sessionId;
  }

  getPendingAuth(sessionId: string): PendingAuth | undefined {
    return this.pendingAuths.get(sessionId);
  }

  completePendingAuth(sessionId: string, _provider: string, _email?: string): { redirect: string } | null {
    const pending = this.pendingAuths.get(sessionId);
    if (!pending) return null;
    this.pendingAuths.delete(sessionId);

    const code = randomUUID();
    this.codes.set(code, pending);

    const targetUrl = new URL(pending.params.redirectUri);
    targetUrl.searchParams.set('code', code);
    if (pending.params.state) {
      targetUrl.searchParams.set('state', pending.params.state);
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

    const loginUrl = new URL('/auth/login', new URL(params.redirectUri).origin);
    loginUrl.searchParams.set('session_id', this.createPendingAuth(params, client));
    loginUrl.searchParams.set('redirect_uri', params.redirectUri);
    if (params.state) loginUrl.searchParams.set('state', params.state);

    res.redirect(loginUrl.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const codeData = this.codes.get(authorizationCode);
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
    const codeData = this.codes.get(authorizationCode);
    if (!codeData) {
      throw new Error('Invalid authorization code');
    }
    if (codeData.client.client_id !== client.client_id) {
      throw new Error('Client mismatch');
    }

    this.codes.delete(authorizationCode);

    const token = randomUUID();
    this.tokens.set(token, {
      token,
      clientId: client.client_id,
      scopes: codeData.params.scopes || [],
      expiresAt: Date.now() + 3600000,
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
    const tokenData = this.tokens.get(token);
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
      this.tokens.delete(request.token);
    }
  }
}
