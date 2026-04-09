/**
 * Navitaire JWT token management with caching and auto-refresh.
 *
 * Uses the Navitaire Digital API auth endpoints:
 *   - POST /api/auth/v1/token/user  — create agent token
 *   - PUT  /api/auth/v1/token       — refresh before expiry
 */

import type { NavitaireConfig } from './config.js';

interface CachedToken {
  token: string;
  expiresAt: number;
}

const TOKEN_REFRESH_MARGIN_MS = 60_000;

export class NavitaireAuth {
  private readonly baseUrl: string;
  private readonly credentials: NavitaireConfig['credentials'];
  private cached: CachedToken | null = null;

  constructor(config: NavitaireConfig) {
    this.baseUrl = config.baseUrl;
    this.credentials = config.credentials;
  }

  async getToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.cached.token;
    }

    if (this.cached && Date.now() < this.cached.expiresAt) {
      return this.refreshToken();
    }

    return this.createToken();
  }

  invalidate(): void {
    this.cached = null;
  }

  private async createToken(): Promise<string> {
    const url = `${this.baseUrl}/api/auth/v1/token/user`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domainCode: this.credentials.domain,
        username: this.credentials.username,
        password: this.credentials.password,
      }),
    });

    if (!response.ok) {
      throw new Error(`Navitaire auth failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as NavitaireTokenResponse;
    this.cacheToken(data);
    return data.token;
  }

  private async refreshToken(): Promise<string> {
    if (!this.cached) {
      return this.createToken();
    }

    const url = `${this.baseUrl}/api/auth/v1/token`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cached.token}`,
      },
    });

    if (!response.ok) {
      this.cached = null;
      return this.createToken();
    }

    const data = (await response.json()) as NavitaireTokenResponse;
    this.cacheToken(data);
    return data.token;
  }

  private cacheToken(data: NavitaireTokenResponse): void {
    const expiresInMs = data.idleTimeoutInMinutes ? data.idleTimeoutInMinutes * 60_000 : 1_200_000; // Default 20 minutes

    this.cached = {
      token: data.token,
      expiresAt: Date.now() + expiresInMs,
    };
  }
}

export interface NavitaireTokenResponse {
  token: string;
  idleTimeoutInMinutes?: number;
  roleCode?: string;
}
