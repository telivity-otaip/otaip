import { describe, it, expect } from 'vitest';
import { applyEU261, greatCircleDistanceKm } from '../eu261.js';

describe('applyEU261 — delay path', () => {
  it('pays €250 for short-haul ≤1500km with 3h+ delay', () => {
    const r = applyEU261({
      distanceKm: 1200,
      arrivalDelayHours: 3,
      extraordinaryCircumstances: false,
      flightCancelled: false,
    });
    expect(r.eligible).toBe(true);
    expect(r.compensationEur).toBe('250.00');
    expect(r.reductionPercent).toBe(0);
  });

  it('pays €400 for medium-haul 1500-3500km with 3h+ delay', () => {
    const r = applyEU261({
      distanceKm: 3000,
      arrivalDelayHours: 4,
      extraordinaryCircumstances: false,
      flightCancelled: false,
    });
    expect(r.compensationEur).toBe('400.00');
  });

  it('pays €600 for long-haul >3500km with 4h+ delay', () => {
    const r = applyEU261({
      distanceKm: 6000,
      arrivalDelayHours: 5,
      extraordinaryCircumstances: false,
      flightCancelled: false,
    });
    expect(r.compensationEur).toBe('600.00');
  });

  it('Article 7(2) rerouting reduction: 50% (€300) when alternative arrival within 4h on long-haul', () => {
    const r = applyEU261({
      distanceKm: 6000,
      arrivalDelayHours: 3.5,
      extraordinaryCircumstances: false,
      flightCancelled: false,
      reroutingOffered: true,
      reroutingArrivalLatenessHours: 4,
    });
    expect(r.compensationEur).toBe('300.00');
    expect(r.reductionPercent).toBe(50);
  });

  it('Article 7(2) rerouting reduction: 50% (€125) when alternative arrival within 2h on short-haul', () => {
    const r = applyEU261({
      distanceKm: 1000,
      arrivalDelayHours: 4,
      extraordinaryCircumstances: false,
      flightCancelled: false,
      reroutingOffered: true,
      reroutingArrivalLatenessHours: 1.5,
    });
    expect(r.compensationEur).toBe('125.00');
    expect(r.reductionPercent).toBe(50);
  });

  it('no reduction when rerouting arrival exceeds band threshold', () => {
    const r = applyEU261({
      distanceKm: 1000,
      arrivalDelayHours: 4,
      extraordinaryCircumstances: false,
      flightCancelled: false,
      reroutingOffered: true,
      reroutingArrivalLatenessHours: 2.5,
    });
    expect(r.compensationEur).toBe('250.00');
    expect(r.reductionPercent).toBe(0);
  });

  it('returns ineligible when delay < 3h', () => {
    const r = applyEU261({
      distanceKm: 1200,
      arrivalDelayHours: 2,
      extraordinaryCircumstances: false,
      flightCancelled: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.compensationEur).toBe('0.00');
  });
});

describe('applyEU261 — cancellation path', () => {
  it('owes compensation when notified < 14 days', () => {
    const r = applyEU261({
      distanceKm: 1200,
      arrivalDelayHours: 0,
      extraordinaryCircumstances: false,
      flightCancelled: true,
      noticeDaysBeforeDeparture: 7,
    });
    expect(r.eligible).toBe(true);
    expect(r.compensationEur).toBe('250.00');
  });

  it('safe-harbours when notified ≥ 14 days', () => {
    const r = applyEU261({
      distanceKm: 1200,
      arrivalDelayHours: 0,
      extraordinaryCircumstances: false,
      flightCancelled: true,
      noticeDaysBeforeDeparture: 14,
    });
    expect(r.eligible).toBe(false);
  });
});

describe('applyEU261 — extraordinary circumstances', () => {
  it('exempts the carrier even when delay is severe', () => {
    const r = applyEU261({
      distanceKm: 6000,
      arrivalDelayHours: 10,
      extraordinaryCircumstances: true,
      flightCancelled: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/Extraordinary circumstances/);
  });
});

describe('applyEU261 — refund choice', () => {
  it('flags refund choice when delay ≥ 5h', () => {
    const r = applyEU261({
      distanceKm: 1200,
      arrivalDelayHours: 5,
      extraordinaryCircumstances: false,
      flightCancelled: false,
    });
    expect(r.refundChoiceAvailable).toBe(true);
  });
});

describe('greatCircleDistanceKm', () => {
  it('returns 0 for identical points', () => {
    const d = greatCircleDistanceKm(
      { latitude: 51.4775, longitude: -0.4614 },
      { latitude: 51.4775, longitude: -0.4614 },
    );
    expect(d).toBeCloseTo(0, 3);
  });

  it('approximates LHR-JFK at ~5540km', () => {
    const d = greatCircleDistanceKm(
      { latitude: 51.4775, longitude: -0.4614 },
      { latitude: 40.6413, longitude: -73.7781 },
    );
    expect(d).toBeGreaterThan(5500);
    expect(d).toBeLessThan(5600);
  });
});
