import { describe, expect, it } from 'vitest';
import {
  captureOutputContract,
  checkCrossAgentConsistency,
} from '../cross-agent-checker.js';
import type { PipelineSession } from '../types.js';

const mkSession = (): PipelineSession => ({
  sessionId: 's1',
  intent: {
    type: 't',
    origin: 'JFK',
    destination: 'LHR',
    outboundDate: '2026-05-01',
    passengerCount: 2,
    lockedAt: '2026-04-16T12:00:00Z',
    lockedBy: 'test',
  },
  history: [],
  contractState: new Map(),
  retriesUsed: new Map(),
});

describe('captureOutputContract', () => {
  it('stores only declared fields', () => {
    const s = mkSession();
    captureOutputContract(
      'search',
      { offerId: 'o-1', totalPrice: 450, currency: 'USD', segments: [] },
      ['offerId', 'totalPrice', 'currency'],
      s,
    );
    expect(s.contractState.get('search')).toEqual({
      offerId: 'o-1',
      totalPrice: 450,
      currency: 'USD',
    });
  });

  it('noop when output is null/primitive', () => {
    const s = mkSession();
    captureOutputContract('x', null, ['a'], s);
    captureOutputContract('x', 42, ['a'], s);
    expect(s.contractState.size).toBe(0);
  });
});

describe('checkCrossAgentConsistency', () => {
  it('passes when no prior state exists', () => {
    const s = mkSession();
    expect(checkCrossAgentConsistency({ offerId: 'anything' }, s).ok).toBe(true);
  });

  it('passes when input matches recorded value', () => {
    const s = mkSession();
    s.contractState.set('search', { offerId: 'o-1' });
    expect(checkCrossAgentConsistency({ offerId: 'o-1', note: 'ok' }, s).ok).toBe(true);
  });

  it('rejects fabricated offerId', () => {
    const s = mkSession();
    s.contractState.set('search', { offerId: 'o-1' });
    const r = checkCrossAgentConsistency({ offerId: 'o-999' }, s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues[0]?.code).toBe('CROSS_AGENT_INCONSISTENCY');
      expect(r.issues[0]?.path).toEqual(['offerId']);
    }
  });

  it('deeply compares objects', () => {
    const s = mkSession();
    s.contractState.set('search', {
      segments: [{ from: 'JFK', to: 'LHR' }],
    });
    expect(
      checkCrossAgentConsistency({ segments: [{ from: 'JFK', to: 'LHR' }] }, s).ok,
    ).toBe(true);
    expect(
      checkCrossAgentConsistency({ segments: [{ from: 'JFK', to: 'CDG' }] }, s).ok,
    ).toBe(false);
  });

  it('accepts an input field whose value matches any prior agent', () => {
    const s = mkSession();
    s.contractState.set('search', { totalPrice: 450 });
    s.contractState.set('pricing', { totalPrice: 460 });
    // Input totalPrice 460 matches pricing's recorded value — should pass.
    expect(checkCrossAgentConsistency({ totalPrice: 460 }, s).ok).toBe(true);
    // 999 matches neither — should fail.
    expect(checkCrossAgentConsistency({ totalPrice: 999 }, s).ok).toBe(false);
  });
});
