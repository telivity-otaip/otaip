/**
 * Hotelbeds APItude request signing.
 *
 * Hotelbeds requires every request to carry two headers:
 *   Api-key:     <apiKey>
 *   X-Signature: SHA256(apiKey + secret + unix_timestamp_seconds).hex
 *
 * The signature must be regenerated per request because it pins to the
 * current Unix timestamp. Hotelbeds rejects signatures more than ~5
 * minutes off server time.
 */

import { createHash } from 'node:crypto';

export interface HotelbedsCredentials {
  apiKey: string;
  secret: string;
}

/**
 * Compute the X-Signature header value.
 *
 * Exposed as `nowSeconds` for testability — defaulted to wall-clock seconds.
 */
export function signRequest(
  credentials: HotelbedsCredentials,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  return createHash('sha256')
    .update(`${credentials.apiKey}${credentials.secret}${nowSeconds}`)
    .digest('hex');
}

/**
 * Build the full set of headers Hotelbeds requires on every request.
 * `Accept-Encoding: gzip` is recommended by Hotelbeds — payloads are large.
 */
export function buildAuthHeaders(
  credentials: HotelbedsCredentials,
  nowSeconds?: number,
): Record<string, string> {
  return {
    'Api-key': credentials.apiKey,
    'X-Signature': signRequest(credentials, nowSeconds),
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
  };
}
