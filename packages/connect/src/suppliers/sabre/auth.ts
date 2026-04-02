/**
 * Sabre OAuth2 token management with caching.
 *
 * Uses client_credentials grant against the Sabre REST API token endpoint.
 * Tokens are cached in memory and refreshed automatically before expiry.
 */

import type { SabreConfig } from './config.js';
import { getBaseUrl } from './config.js';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const TOKEN_REFRESH_MARGIN_MS = 60_000;

export class SabreAuth {
  private readonly baseUrl: string;
  private readonly credentials: string;
  private cached: CachedToken | null = null;

  constructor(config: SabreConfig) {
    this.baseUrl = getBaseUrl(config.environment);
    // Sabre requires double base64: base64(base64(clientId):base64(clientSecret))
    this.credentials = btoa(`${btoa(config.clientId)}:${btoa(config.clientSecret)}`);
  }

  async getToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.cached.accessToken;
    }
    return this.fetchToken();
  }

  invalidate(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<string> {
    const url = `${this.baseUrl}/v2/auth/token`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(
        `Sabre auth failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    this.cached = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1_000,
    };

    return data.access_token;
  }
}
