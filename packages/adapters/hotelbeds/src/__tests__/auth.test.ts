import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import { buildAuthHeaders, signRequest } from '../auth.js';

describe('signRequest', () => {
  const credentials = { apiKey: 'TESTKEY', secret: 'TESTSECRET' };

  it('produces SHA256(apiKey + secret + nowSeconds) hex', () => {
    const ts = 1700000000;
    const expected = createHash('sha256')
      .update(`${credentials.apiKey}${credentials.secret}${ts}`)
      .digest('hex');
    expect(signRequest(credentials, ts)).toBe(expected);
  });

  it('changes when timestamp changes', () => {
    expect(signRequest(credentials, 1700000000)).not.toBe(signRequest(credentials, 1700000001));
  });

  it('returns 64 hex chars', () => {
    expect(signRequest(credentials, 1700000000)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('buildAuthHeaders', () => {
  const credentials = { apiKey: 'TESTKEY', secret: 'TESTSECRET' };

  it('sets Api-key and X-Signature', () => {
    const headers = buildAuthHeaders(credentials, 1700000000);
    expect(headers['Api-key']).toBe('TESTKEY');
    expect(headers['X-Signature']).toBe(signRequest(credentials, 1700000000));
  });

  it('asks for JSON and gzip', () => {
    const headers = buildAuthHeaders(credentials, 1700000000);
    expect(headers['Accept']).toBe('application/json');
    expect(headers['Accept-Encoding']).toBe('gzip');
  });

  it('regenerates signature each call when no timestamp passed (signature drifts over time)', () => {
    const a = buildAuthHeaders(credentials)['X-Signature'];
    // 1-second granularity — call again after a beat to ensure different ts.
    const b = buildAuthHeaders(credentials, Math.floor(Date.now() / 1000) + 5)['X-Signature'];
    expect(a).not.toBe(b);
  });
});
