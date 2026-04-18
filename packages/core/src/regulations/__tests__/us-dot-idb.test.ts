import { describe, it, expect } from 'vitest';
import { applyUsDotIdb } from '../us-dot-idb.js';

describe('applyUsDotIdb — domestic', () => {
  it('owes nothing when substitute arrives within 60min', () => {
    const r = applyUsDotIdb({ isDomestic: true, substituteArrivalLateMinutes: 45, oneWayFareUsd: 300 });
    expect(r.eligible).toBe(false);
    expect(r.compensationUsd).toBe('0.00');
  });

  it('owes 200% capped at $1075 when 1-2h late', () => {
    const r = applyUsDotIdb({ isDomestic: true, substituteArrivalLateMinutes: 90, oneWayFareUsd: 300 });
    expect(r.eligible).toBe(true);
    expect(r.compensationUsd).toBe('600.00');
  });

  it('caps 200% at $1075', () => {
    const r = applyUsDotIdb({ isDomestic: true, substituteArrivalLateMinutes: 90, oneWayFareUsd: 700 });
    expect(r.compensationUsd).toBe('1075.00');
  });

  it('owes 400% capped at $2150 when >2h late', () => {
    const r = applyUsDotIdb({ isDomestic: true, substituteArrivalLateMinutes: 180, oneWayFareUsd: 300 });
    expect(r.compensationUsd).toBe('1200.00');
  });

  it('caps 400% at $2150', () => {
    const r = applyUsDotIdb({ isDomestic: true, substituteArrivalLateMinutes: 180, oneWayFareUsd: 800 });
    expect(r.compensationUsd).toBe('2150.00');
  });

  it('treats no-rerouting as highest band', () => {
    const r = applyUsDotIdb({ isDomestic: true, substituteArrivalLateMinutes: Infinity, oneWayFareUsd: 300 });
    expect(r.compensationUsd).toBe('1200.00');
  });
});

describe('applyUsDotIdb — international', () => {
  it('owes nothing when substitute arrives within 60min', () => {
    const r = applyUsDotIdb({ isDomestic: false, substituteArrivalLateMinutes: 45, oneWayFareUsd: 1000 });
    expect(r.compensationUsd).toBe('0.00');
  });

  it('owes 200% (capped) when 1-4h late', () => {
    const r = applyUsDotIdb({ isDomestic: false, substituteArrivalLateMinutes: 180, oneWayFareUsd: 600 });
    expect(r.compensationUsd).toBe('1075.00');
  });

  it('owes 400% (capped) when >4h late', () => {
    const r = applyUsDotIdb({ isDomestic: false, substituteArrivalLateMinutes: 300, oneWayFareUsd: 1000 });
    expect(r.compensationUsd).toBe('2150.00');
  });
});
