/**
 * Mock Amadeus Hotel Search adapter.
 *
 * Amadeus Hotel API: OPEN (self-service), sandbox available,
 * SDKs for Ruby, Python, Java, Node.js, .NET.
 *
 * Domain source: OTAIP Lodging Knowledge Base §1 (Direct Connect APIs)
 */

import type { HotelSearchParams, HotelSourceAdapter } from './base-adapter.js';
import type { RawHotelResult } from '../../types/hotel-common.js';

const NYC_PROPERTIES: RawHotelResult[] = [
  {
    source: { sourceId: 'amadeus', sourcePropertyId: 'AMNYC001' },
    propertyName: 'Marriott Marquis Times Square',
    address: {
      line1: '1535 Broadway',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10036',
      countryCode: 'US',
    },
    coordinates: { latitude: 40.758, longitude: -73.9855 },
    chainCode: 'MC',
    chainName: 'Marriott',
    starRating: 4,
    amenities: [
      'Free WiFi',
      'Fitness Center',
      'Restaurant',
      'Room Service',
      'Business Center',
      'Concierge',
    ],
    roomTypes: [
      {
        roomTypeId: 'AMNYC001-STD-K',
        code: 'KNG',
        description: 'Standard King Room',
        maxOccupancy: 2,
        bedTypeRaw: 'King',
      },
      {
        roomTypeId: 'AMNYC001-DLX-K',
        code: 'KDLX',
        description: 'Deluxe King Room City View',
        maxOccupancy: 2,
        bedTypeRaw: 'King',
      },
    ],
    rates: [
      {
        rateId: 'AMNYC001-R1',
        roomTypeId: 'AMNYC001-STD-K',
        nightlyRate: '299.00',
        totalRate: '598.00',
        currency: 'USD',
        rateType: 'bar',
        paymentModel: 'pay_at_property',
        cancellationPolicy: {
          refundable: true,
          deadlines: [{ hoursBeforeCheckin: 24, penaltyType: 'nights', penaltyValue: 1 }],
          freeCancel24hrBooking: true,
        },
        mandatoryFees: [
          { type: 'destination_fee', amount: '25.00', currency: 'USD', perUnit: 'per_night' },
        ],
        taxAmount: '53.28',
      },
    ],
    photos: [
      {
        url: 'https://mock.amadeus.com/photos/AMNYC001/exterior.jpg',
        caption: 'Hotel Exterior',
        category: 'exterior',
      },
    ],
    description:
      'Located in the heart of Times Square, this iconic hotel offers modern rooms with stunning city views.',
  },
  {
    source: { sourceId: 'amadeus', sourcePropertyId: 'AMNYC002' },
    propertyName: 'Hilton Midtown Manhattan',
    address: {
      line1: '1335 Avenue of the Americas',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10019',
      countryCode: 'US',
    },
    coordinates: { latitude: 40.7624, longitude: -73.979 },
    chainCode: 'HH',
    chainName: 'Hilton',
    starRating: 4,
    amenities: ['Complimentary WiFi', 'Gym', 'Bar', 'Meeting Rooms', 'Valet Parking'],
    roomTypes: [
      {
        roomTypeId: 'AMNYC002-STD-Q',
        code: 'QN',
        description: 'Standard Queen Room',
        maxOccupancy: 2,
        bedTypeRaw: 'Queen',
      },
    ],
    rates: [
      {
        rateId: 'AMNYC002-R1',
        roomTypeId: 'AMNYC002-STD-Q',
        nightlyRate: '279.00',
        totalRate: '558.00',
        currency: 'USD',
        rateType: 'bar',
        paymentModel: 'pay_at_property',
        cancellationPolicy: {
          refundable: true,
          deadlines: [{ hoursBeforeCheckin: 48, penaltyType: 'nights', penaltyValue: 1 }],
          freeCancel24hrBooking: true,
        },
        taxAmount: '49.72',
      },
    ],
    photos: [
      {
        url: 'https://mock.amadeus.com/photos/AMNYC002/exterior.jpg',
        caption: 'Hotel Exterior',
        category: 'exterior',
      },
    ],
    description:
      'A modern Hilton hotel in midtown Manhattan, steps from Central Park and Rockefeller Center.',
  },
  {
    source: { sourceId: 'amadeus', sourcePropertyId: 'AMNYC003' },
    propertyName: 'Hyatt Grand Central New York',
    address: {
      line1: '109 East 42nd Street',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10017',
      countryCode: 'US',
    },
    coordinates: { latitude: 40.7527, longitude: -73.9772 },
    chainCode: 'HY',
    chainName: 'Hyatt',
    starRating: 4,
    amenities: ['Free Internet', 'Fitness Centre', 'Restaurant', 'Pet Friendly'],
    roomTypes: [
      {
        roomTypeId: 'AMNYC003-STD-K',
        code: 'KNG',
        description: 'King Room',
        maxOccupancy: 2,
        bedTypeRaw: 'King',
      },
    ],
    rates: [
      {
        rateId: 'AMNYC003-R1',
        roomTypeId: 'AMNYC003-STD-K',
        nightlyRate: '259.00',
        totalRate: '518.00',
        currency: 'USD',
        rateType: 'bar',
        paymentModel: 'prepaid',
        cancellationPolicy: { refundable: false, deadlines: [], freeCancel24hrBooking: true },
        taxAmount: '46.14',
      },
    ],
    photos: [],
    description:
      'Adjacent to Grand Central Terminal, this Hyatt offers convenient access to midtown Manhattan.',
  },
];

const LON_PROPERTIES: RawHotelResult[] = [
  {
    source: { sourceId: 'amadeus', sourcePropertyId: 'AMLON001' },
    propertyName: 'The Savoy London',
    address: { line1: 'Strand', city: 'London', postalCode: 'WC2R 0EZ', countryCode: 'GB' },
    coordinates: { latitude: 51.5103, longitude: -0.1205 },
    starRating: 5,
    amenities: [
      'Free WiFi',
      'Spa',
      'Pool',
      'Restaurant',
      'Bar',
      'Fitness Center',
      'Room Service',
      'Concierge',
    ],
    roomTypes: [
      {
        roomTypeId: 'AMLON001-SUP-K',
        code: 'KSUP',
        description: 'Superior King Room River View',
        maxOccupancy: 2,
        bedTypeRaw: 'King',
      },
    ],
    rates: [
      {
        rateId: 'AMLON001-R1',
        roomTypeId: 'AMLON001-SUP-K',
        nightlyRate: '650.00',
        totalRate: '1300.00',
        currency: 'GBP',
        rateType: 'bar',
        paymentModel: 'pay_at_property',
        cancellationPolicy: {
          refundable: true,
          deadlines: [{ hoursBeforeCheckin: 72, penaltyType: 'nights', penaltyValue: 1 }],
          freeCancel24hrBooking: false,
        },
        taxAmount: '260.00',
      },
    ],
    photos: [
      {
        url: 'https://mock.amadeus.com/photos/AMLON001/exterior.jpg',
        caption: 'The Savoy Exterior',
        category: 'exterior',
      },
    ],
    description: 'Iconic luxury hotel on the Strand, overlooking the Thames.',
  },
];

const MOCK_DATA: Record<string, RawHotelResult[]> = {
  'new york': NYC_PROPERTIES,
  nyc: NYC_PROPERTIES,
  jfk: NYC_PROPERTIES,
  london: LON_PROPERTIES,
  lon: LON_PROPERTIES,
  lhr: LON_PROPERTIES,
};

export class MockAmadeusHotelAdapter implements HotelSourceAdapter {
  readonly adapterId = 'amadeus';
  readonly adapterName = 'Amadeus Hotel Search API';

  async searchHotels(params: HotelSearchParams): Promise<RawHotelResult[]> {
    // Simulate ~150ms network latency
    await new Promise((resolve) => setTimeout(resolve, 150));

    const key = params.destination.toLowerCase();
    const results = MOCK_DATA[key] ?? [];

    return results.map((r) => ({
      ...r,
      source: { ...r.source, responseLatencyMs: 150 },
    }));
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
