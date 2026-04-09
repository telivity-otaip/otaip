import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RateComparisonAgent } from '../index.js';
import type { CanonicalProperty, RawHotelResult } from '../../types/hotel-common.js';
import { calculateMandatoryFees } from '../fee-calculator.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeSourceResult(overrides: Partial<RawHotelResult>): RawHotelResult {
  return {
    source: { sourceId: 'test', sourcePropertyId: 'T-001' },
    propertyName: 'Test Hotel',
    address: { line1: '123 Test St', city: 'New York', countryCode: 'US' },
    coordinates: { latitude: 40.75, longitude: -73.98 },
    amenities: [],
    roomTypes: [],
    rates: [],
    photos: [],
    ...overrides,
  };
}

const PROPERTY_WITH_MULTIPLE_RATES: CanonicalProperty = {
  canonicalId: 'rate-test-001',
  propertyName: 'Marriott Marquis NYC',
  address: { line1: '1535 Broadway', city: 'New York', countryCode: 'US' },
  coordinates: { latitude: 40.758, longitude: -73.985 },
  chainCode: 'MC',
  sources: [
    { sourceId: 'amadeus', sourcePropertyId: 'AM-001' },
    { sourceId: 'hotelbeds', sourcePropertyId: 'HB-001' },
  ],
  sourceResults: [
    makeSourceResult({
      source: { sourceId: 'amadeus', sourcePropertyId: 'AM-001' },
      rates: [
        {
          rateId: 'AM-R1',
          roomTypeId: 'AM-STD',
          nightlyRate: '299.00',
          totalRate: '299.00',
          currency: 'USD',
          rateType: 'bar',
          paymentModel: 'pay_at_property',
          cancellationPolicy: {
            refundable: true,
            deadlines: [{ hoursBeforeCheckin: 24, penaltyType: 'nights', penaltyValue: 1 }],
            freeCancel24hrBooking: true,
          },
          mandatoryFees: [
            { type: 'resort_fee', amount: '25.00', currency: 'USD', perUnit: 'per_night' },
          ],
          taxAmount: '53.28',
        },
      ],
    }),
    makeSourceResult({
      source: { sourceId: 'hotelbeds', sourcePropertyId: 'HB-001' },
      rates: [
        {
          rateId: 'HB-R1',
          roomTypeId: 'HB-STD',
          nightlyRate: '305.00',
          totalRate: '305.00',
          currency: 'USD',
          rateType: 'bar',
          paymentModel: 'prepaid',
          cancellationPolicy: {
            refundable: true,
            deadlines: [{ hoursBeforeCheckin: 24, penaltyType: 'nights', penaltyValue: 1 }],
            freeCancel24hrBooking: true,
          },
          mandatoryFees: [
            { type: 'destination_fee', amount: '25.00', currency: 'USD', perUnit: 'per_night' },
          ],
          taxAmount: '54.35',
        },
      ],
    }),
  ],
  mergeConfidence: 0.95,
  mergeReasoning: 'test merge',
  reviewRequired: false,
};

const PROPERTY_WITH_PARITY: CanonicalProperty = {
  ...PROPERTY_WITH_MULTIPLE_RATES,
  canonicalId: 'parity-test-001',
  sourceResults: [
    makeSourceResult({
      source: { sourceId: 'amadeus', sourcePropertyId: 'AM-002' },
      rates: [
        {
          rateId: 'AM-R2',
          roomTypeId: 'AM-STD',
          nightlyRate: '200.00',
          totalRate: '200.00',
          currency: 'USD',
          rateType: 'bar',
          paymentModel: 'pay_at_property',
          cancellationPolicy: { refundable: true, deadlines: [], freeCancel24hrBooking: true },
          taxAmount: '20.00',
        },
      ],
    }),
    makeSourceResult({
      source: { sourceId: 'hotelbeds', sourcePropertyId: 'HB-002' },
      rates: [
        {
          rateId: 'HB-R2',
          roomTypeId: 'HB-STD',
          nightlyRate: '201.00',
          totalRate: '201.00',
          currency: 'USD',
          rateType: 'bar',
          paymentModel: 'prepaid',
          cancellationPolicy: { refundable: true, deadlines: [], freeCancel24hrBooking: true },
          taxAmount: '20.10',
        },
      ],
    }),
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent 20.4 — Rate Comparison', () => {
  let agent: RateComparisonAgent;

  beforeAll(async () => {
    agent = new RateComparisonAgent();
    await agent.initialize();
  });

  afterAll(() => {
    agent.destroy();
  });

  describe('Total cost calculation', () => {
    it('includes base rate + taxes + mandatory fees in total', async () => {
      const result = await agent.execute({
        data: { properties: [PROPERTY_WITH_MULTIPLE_RATES] },
      });

      const comparison = result.data.comparisons[0]!;
      expect(comparison.rates.length).toBe(2);

      for (const rate of comparison.rates) {
        const grandTotal = parseFloat(rate.totalCost.grandTotal.amount);
        const roomCharges = parseFloat(rate.totalCost.roomCharges.amount);
        expect(grandTotal).toBeGreaterThan(roomCharges);
      }
    });

    it('sorts rates by total cost (lowest first)', async () => {
      const result = await agent.execute({
        data: { properties: [PROPERTY_WITH_MULTIPLE_RATES] },
      });

      const rates = result.data.comparisons[0]!.rates;
      for (let i = 1; i < rates.length; i++) {
        const prev = parseFloat(rates[i - 1]!.totalCost.grandTotal.amount);
        const curr = parseFloat(rates[i]!.totalCost.grandTotal.amount);
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });

    it('correctly classifies rate types', async () => {
      const result = await agent.execute({
        data: { properties: [PROPERTY_WITH_MULTIPLE_RATES] },
      });

      const comparison = result.data.comparisons[0]!;
      expect(comparison.bestByRateType['bar']).toBeDefined();
    });
  });

  describe('Fee calculator', () => {
    it('calculates per-night fees correctly', () => {
      const total = calculateMandatoryFees(
        [{ type: 'resort_fee', amount: '25.00', currency: 'USD', perUnit: 'per_night' }],
        3,
      );
      expect(total).toBe('75.00');
    });

    it('calculates per-stay fees correctly', () => {
      const total = calculateMandatoryFees(
        [{ type: 'cleaning_fee', amount: '50.00', currency: 'USD', perUnit: 'per_stay' }],
        3,
      );
      expect(total).toBe('50.00');
    });

    it('calculates per-person-per-night fees correctly', () => {
      const total = calculateMandatoryFees(
        [{ type: 'tourism_tax', amount: '5.00', currency: 'USD', perUnit: 'per_person_per_night' }],
        3, // nights
        2, // guests
      );
      expect(total).toBe('30.00');
    });

    it('sums multiple fee types', () => {
      const total = calculateMandatoryFees(
        [
          { type: 'resort_fee', amount: '25.00', currency: 'USD', perUnit: 'per_night' },
          { type: 'parking', amount: '10.00', currency: 'USD', perUnit: 'per_night' },
        ],
        2,
      );
      expect(total).toBe('70.00');
    });

    it('returns 0 for no fees', () => {
      const total = calculateMandatoryFees([], 3);
      expect(total).toBe('0.00');
    });
  });

  describe('Rate parity detection', () => {
    it('detects parity when rates are within 2%', async () => {
      const result = await agent.execute({
        data: { properties: [PROPERTY_WITH_PARITY] },
      });

      const comparison = result.data.comparisons[0]!;
      expect(comparison.parity).not.toBeNull();
      expect(comparison.parity!.isAtParity).toBe(true);
      expect(comparison.parity!.spreadPercent).toBeLessThanOrEqual(2.0);
    });

    it('detects parity violation when rates differ significantly', async () => {
      const wideSpread: CanonicalProperty = {
        ...PROPERTY_WITH_MULTIPLE_RATES,
        canonicalId: 'parity-violation-001',
        sourceResults: [
          makeSourceResult({
            source: { sourceId: 'cheap', sourcePropertyId: 'C-001' },
            rates: [
              {
                rateId: 'C-R1',
                roomTypeId: 'C-STD',
                nightlyRate: '200.00',
                totalRate: '200.00',
                currency: 'USD',
                rateType: 'bar',
                paymentModel: 'prepaid',
                cancellationPolicy: {
                  refundable: true,
                  deadlines: [],
                  freeCancel24hrBooking: true,
                },
                taxAmount: '0.00',
              },
            ],
          }),
          makeSourceResult({
            source: { sourceId: 'expensive', sourcePropertyId: 'E-001' },
            rates: [
              {
                rateId: 'E-R1',
                roomTypeId: 'E-STD',
                nightlyRate: '280.00',
                totalRate: '280.00',
                currency: 'USD',
                rateType: 'bar',
                paymentModel: 'pay_at_property',
                cancellationPolicy: {
                  refundable: true,
                  deadlines: [],
                  freeCancel24hrBooking: true,
                },
                taxAmount: '0.00',
              },
            ],
          }),
        ],
      };

      const result = await agent.execute({ data: { properties: [wideSpread] } });
      const comparison = result.data.comparisons[0]!;

      expect(comparison.parity).not.toBeNull();
      expect(comparison.parity!.isAtParity).toBe(false);
      expect(comparison.parity!.spreadPercent).toBeGreaterThan(2.0);
      expect(result.data.parityViolations).toBe(1);
    });

    it('returns null parity for single-source properties', async () => {
      const singleSource: CanonicalProperty = {
        ...PROPERTY_WITH_MULTIPLE_RATES,
        canonicalId: 'single-src-001',
        sourceResults: [
          makeSourceResult({
            source: { sourceId: 'amadeus', sourcePropertyId: 'AM-003' },
            rates: [
              {
                rateId: 'AM-R3',
                roomTypeId: 'AM-STD',
                nightlyRate: '200.00',
                totalRate: '200.00',
                currency: 'USD',
                rateType: 'bar',
                paymentModel: 'pay_at_property',
                cancellationPolicy: {
                  refundable: true,
                  deadlines: [],
                  freeCancel24hrBooking: true,
                },
              },
            ],
          }),
        ],
      };

      const result = await agent.execute({ data: { properties: [singleSource] } });
      expect(result.data.comparisons[0]!.parity).toBeNull();
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('20.4');
      expect(agent.name).toBe('Hotel Rate Comparison');
      expect(agent.version).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninit = new RateComparisonAgent();
      await expect(uninit.execute({ data: { properties: [] } })).rejects.toThrow(
        'not been initialized',
      );
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });
  });
});
