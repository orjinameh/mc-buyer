import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { InvalidRequestError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

interface StoredAuthCode {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
}

interface StoredToken {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(clientMetadata: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
    this.clients.set(clientMetadata.client_id, clientMetadata);
    return clientMetadata;
  }
}

export class SimpleOAuthProvider implements OAuthServerProvider {
  private clientsStoreInstance = new InMemoryClientsStore();
  private codes = new Map<string, StoredAuthCode>();
  private tokens = new Map<string, StoredToken>();

  get clientsStore(): OAuthRegisteredClientsStore {
    return this.clientsStoreInstance;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    if (!client.redirect_uris.includes(params.redirectUri)) {
      throw new InvalidRequestError('Unregistered redirect_uri');
    }

    const code = randomUUID();
    this.codes.set(code, { client, params });

    const targetUrl = new URL(params.redirectUri);
    targetUrl.searchParams.set('code', code);
    if (params.state) {
      targetUrl.searchParams.set('state', params.state);
    }

    res.redirect(targetUrl.toString());
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
