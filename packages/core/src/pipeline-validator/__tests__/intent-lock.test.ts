import { describe, expect, it } from 'vitest';
import { checkIntentDrift, checkIntentRelevance } from '../intent-lock.js';
import type { PipelineIntent } from '../types.js';

const intent: PipelineIntent = {
  type: 'one_way_economy_booking',
  origin: 'JFK',
  destination: 'LHR',
  outboundDate: '2026-05-01',
  passengerCount: 2,
  cabinClass: 'economy',
  lockedAt: '2026-04-16T12:00:00Z',
  lockedBy: 'test',
};

describe('checkIntentDrift', () => {
  it('passes when input does not reference locked fields', () => {
    expect(checkIntentDrift({ offerId: 'abc' }, intent).ok).toBe(true);
  });

  it('passes when input matches locked fields', () => {
    expect(checkIntentDrift({ origin: 'JFK', destination: 'LHR' }, intent).ok).toBe(true);
  });

  it('rejects when input tries to change destination', () => {
    const r = checkIntentDrift({ destination: 'CDG' }, intent);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues[0]?.code).toBe('INTENT_LOCK_VIOLATION');
      expect(r.issues[0]?.path).toEqual(['destination']);
    }
  });

  it('rejects passenger count drift', () => {
    const r = checkIntentDrift({ passengerCount: 3 }, intent);
    expect(r.ok).toBe(false);
  });

  it('ignores null/primitive inputs', () => {
    expect(checkIntentDrift(null, intent).ok).toBe(true);
    expect(checkIntentDrift('string', intent).ok).toBe(true);
    expect(checkIntentDrift(42, intent).ok).toBe(true);
  });
});

describe('checkIntentRelevance', () => {
  it('passes when intentRelevance is undefined', () => {
    expect(checkIntentRelevance('anything', undefined).ok).toBe(true);
  });

  it('passes when intentRelevance is empty', () => {
    expect(checkIntentRelevance('anything', []).ok).toBe(true);
  });

  it('passes when intent type is in the list', () => {
    expect(checkIntentRelevance('booking', ['booking', 'search']).ok).toBe(true);
  });

  it('rejects when intent type is not in the list', () => {
    const r = checkIntentRelevance('refund', ['booking', 'search']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues[0]?.code).toBe('INTENT_MISMATCH');
    }
  });
});
