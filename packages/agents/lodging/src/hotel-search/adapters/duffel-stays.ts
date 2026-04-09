/**
 * Mock Duffel Stays adapter.
 *
 * Duffel Stays: OPEN, 1M+ properties, profit-share model,
 * Node.js/Python SDKs.
 *
 * Returns a third set of overlapping results with different naming conventions.
 *
 * Domain source: OTAIP Lodging Knowledge Base §1 (Direct Connect APIs)
 */

import type { HotelSearchParams, HotelSourceAdapter } from './base-adapter.js';
import type { RawHotelResult } from '../../types/hotel-common.js';

const NYC_PROPERTIES: RawHotelResult[] = [
  {
    // Same physical property as Amadeus AMNYC001 / Hotelbeds HB-87234
    source: { sourceId: 'duffel', sourcePropertyId: 'duf_htl_nyc_0001' },
    propertyName: 'Marriott Marquis New York Times Square',
    address: {
      line1: '1535 Broadway',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10036',
      countryCode: 'US',
    },
    coordinates: { latitude: 40.7579, longitude: -73.9854 },
    chainCode: 'MC',
    chainName: 'Marriott',
    starRating: 4,
    amenities: [
      'WiFi included',
      'Fitness centre',
      'Dining',
      'In-room service',
      'Business facilities',
    ],
    roomTypes: [
      {
        roomTypeId: 'duf_rm_001',
        description: 'King Bed Standard',
        maxOccupancy: 2,
        bedTypeRaw: 'King',
      },
    ],
    rates: [
      {
        rateId: 'duf_rate_001',
        roomTypeId: 'duf_rm_001',
        nightlyRate: '302.00',
        totalRate: '604.00',
        currency: 'USD',
        rateType: 'bar',
        paymentModel: 'prepaid',
        cancellationPolicy: {
          refundable: true,
          deadlines: [{ hoursBeforeCheckin: 24, penaltyType: 'nights', penaltyValue: 1 }],
          freeCancel24hrBooking: true,
        },
        mandatoryFees: [
          { type: 'facility_fee', amount: '25.00', currency: 'USD', perUnit: 'per_night' },
        ],
        taxAmount: '53.72',
      },
    ],
    photos: [
      {
        url: 'https://mock.duffel.com/stays/nyc0001/main.jpg',
        caption: 'Marriott Marquis NYC',
        category: 'exterior',
      },
    ],
    description: 'Iconic Times Square hotel with panoramic city views.',
  },
  {
    // Unique to Duffel — no match in other adapters
    source: { sourceId: 'duffel', sourcePropertyId: 'duf_htl_nyc_0004' },
    propertyName: 'Pod 51 Hotel',
    address: {
      line1: '230 East 51st Street',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10022',
      countryCode: 'US',
    },
    coordinates: { latitude: 40.7557, longitude: -73.9685 },
    starRating: 3,
    amenities: ['Free WiFi', 'Rooftop Bar'],
    roomTypes: [
      {
        roomTypeId: 'duf_rm_004',
        description: 'Full Pod Queen',
        maxOccupancy: 2,
        bedTypeRaw: 'Queen',
      },
    ],
    rates: [
      {
        rateId: 'duf_rate_004',
        roomTypeId: 'duf_rm_004',
        nightlyRate: '149.00',
        totalRate: '298.00',
        currency: 'USD',
        rateType: 'bar',
        paymentModel: 'pay_at_property',
        cancellationPolicy: {
          refundable: true,
          deadlines: [{ hoursBeforeCheckin: 24, penaltyType: 'nights', penaltyValue: 1 }],
          freeCancel24hrBooking: true,
        },
        taxAmount: '26.55',
      },
    ],
    photos: [],
    description: 'A micro-hotel in midtown offering compact, efficient rooms.',
  },
];

const MOCK_DATA: Record<string, RawHotelResult[]> = {
  'new york': NYC_PROPERTIES,
  nyc: NYC_PROPERTIES,
  jfk: NYC_PROPERTIES,
};

export class MockDuffelStaysAdapter implements HotelSourceAdapter {
  readonly adapterId = 'duffel';
  readonly adapterName = 'Duffel Stays API';

  async searchHotels(params: HotelSearchParams): Promise<RawHotelResult[]> {
    // Simulate ~180ms network latency
    await new Promise((resolve) => setTimeout(resolve, 180));

    const key = params.destination.toLowerCase();
    const results = MOCK_DATA[key] ?? [];

    return results.map((r) => ({
      ...r,
      source: { ...r.source, responseLatencyMs: 180 },
    }));
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
