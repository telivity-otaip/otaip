/**
 * Mock Hotelbeds (APItude) adapter.
 *
 * Hotelbeds: OPEN (freemium), sandbox at test.hotelbeds.com,
 * 300,000+ properties, 50 req/day eval limit.
 *
 * Returns overlapping results with slightly different naming/IDs for same properties
 * (to test deduplication downstream in Agent 4.2).
 *
 * Domain source: OTAIP Lodging Knowledge Base §1 (Direct Connect APIs)
 */

import type { HotelSearchParams, HotelSourceAdapter } from './base-adapter.js';
import type { RawHotelResult } from '../../types/hotel-common.js';

const NYC_PROPERTIES: RawHotelResult[] = [
  {
    // Same physical property as Amadeus AMNYC001 — different name/ID/coordinates
    source: { sourceId: 'hotelbeds', sourcePropertyId: 'HB-87234' },
    propertyName: 'New York Marriott Marquis',
    address: { line1: '1535 Broadway Ave', city: 'New York', stateProvince: 'NY', postalCode: '10036', countryCode: 'US' },
    coordinates: { latitude: 40.7581, longitude: -73.9856 },
    chainCode: 'MC',
    chainName: 'Marriott International',
    starRating: 4,
    amenities: ['Wireless Internet', 'Gym', 'On-site Restaurant', 'Room Service', 'Business Centre'],
    roomTypes: [
      { roomTypeId: 'HB-87234-STD', description: 'Standard Room King Bed', maxOccupancy: 2, bedTypeRaw: 'King Bed' },
      { roomTypeId: 'HB-87234-DLX', description: 'Deluxe Room King City View', maxOccupancy: 2, bedTypeRaw: 'King Bed' },
    ],
    rates: [
      {
        rateId: 'HB-87234-R1', roomTypeId: 'HB-87234-STD', nightlyRate: '305.00', totalRate: '610.00',
        currency: 'USD', rateType: 'bar', paymentModel: 'prepaid',
        cancellationPolicy: { refundable: true, deadlines: [{ hoursBeforeCheckin: 24, penaltyType: 'nights', penaltyValue: 1 }], freeCancel24hrBooking: true },
        mandatoryFees: [{ type: 'destination_amenity_fee', amount: '25.00', currency: 'USD', perUnit: 'per_night' }],
        taxAmount: '54.35',
      },
    ],
    photos: [{ url: 'https://mock.hotelbeds.com/photos/87234/main.jpg', caption: 'Marriott Marquis', category: 'EXTERIOR' }],
    description: 'The New York Marriott Marquis is located in the heart of Times Square.',
  },
  {
    // Same physical property as Amadeus AMNYC002 — different name/ID
    source: { sourceId: 'hotelbeds', sourcePropertyId: 'HB-65891' },
    propertyName: 'Hilton New York Midtown',
    address: { line1: '1335 6th Ave', city: 'New York', stateProvince: 'NY', postalCode: '10019', countryCode: 'US' },
    coordinates: { latitude: 40.7625, longitude: -73.9791 },
    chainCode: 'HH',
    chainName: 'Hilton Hotels',
    starRating: 4,
    amenities: ['Free Wi-Fi', 'Fitness Center', 'Bar/Lounge', 'Conference Rooms', 'Parking'],
    roomTypes: [
      { roomTypeId: 'HB-65891-STD', description: 'Queen Guest Room', maxOccupancy: 2, bedTypeRaw: 'Queen' },
    ],
    rates: [
      {
        rateId: 'HB-65891-R1', roomTypeId: 'HB-65891-STD', nightlyRate: '275.00', totalRate: '550.00',
        currency: 'USD', rateType: 'bar', paymentModel: 'prepaid',
        cancellationPolicy: { refundable: true, deadlines: [{ hoursBeforeCheckin: 48, penaltyType: 'percentage', penaltyValue: 100 }], freeCancel24hrBooking: true },
        taxAmount: '49.00',
      },
    ],
    photos: [{ url: 'https://mock.hotelbeds.com/photos/65891/main.jpg', caption: 'Hilton Midtown', category: 'EXTERIOR' }],
    description: 'Hilton hotel in midtown Manhattan near Central Park.',
  },
  {
    // Unique to Hotelbeds — no match in Amadeus
    source: { sourceId: 'hotelbeds', sourcePropertyId: 'HB-44521' },
    propertyName: 'The Roosevelt Hotel New York',
    address: { line1: '45 East 45th Street', city: 'New York', stateProvince: 'NY', postalCode: '10017', countryCode: 'US' },
    coordinates: { latitude: 40.7549, longitude: -73.9771 },
    starRating: 4,
    amenities: ['WiFi', 'Restaurant', 'Bar', 'Fitness Room'],
    roomTypes: [
      { roomTypeId: 'HB-44521-STD', description: 'Classic Double Room', maxOccupancy: 2, bedTypeRaw: 'Double' },
    ],
    rates: [
      {
        rateId: 'HB-44521-R1', roomTypeId: 'HB-44521-STD', nightlyRate: '219.00', totalRate: '438.00',
        currency: 'USD', rateType: 'bar', paymentModel: 'pay_at_property',
        cancellationPolicy: { refundable: true, deadlines: [{ hoursBeforeCheckin: 24, penaltyType: 'nights', penaltyValue: 1 }], freeCancel24hrBooking: true },
        taxAmount: '39.02',
      },
    ],
    photos: [],
    description: 'A historic New York hotel near Grand Central Terminal.',
  },
];

const LON_PROPERTIES: RawHotelResult[] = [
  {
    // Same physical property as Amadeus AMLON001 — different name
    source: { sourceId: 'hotelbeds', sourcePropertyId: 'HB-12098' },
    propertyName: 'Savoy Hotel London',
    address: { line1: 'The Strand', city: 'London', postalCode: 'WC2R 0EZ', countryCode: 'GB' },
    coordinates: { latitude: 51.5104, longitude: -0.1206 },
    starRating: 5,
    amenities: ['Complimentary WiFi', 'Full Spa', 'Indoor Pool', 'Fine Dining', 'Lounge Bar', 'Gym', 'Room Service'],
    roomTypes: [
      { roomTypeId: 'HB-12098-SUP', description: 'Superior King River View', maxOccupancy: 2, bedTypeRaw: 'King' },
    ],
    rates: [
      {
        rateId: 'HB-12098-R1', roomTypeId: 'HB-12098-SUP', nightlyRate: '645.00', totalRate: '1290.00',
        currency: 'GBP', rateType: 'bar', paymentModel: 'prepaid',
        cancellationPolicy: { refundable: true, deadlines: [{ hoursBeforeCheckin: 72, penaltyType: 'nights', penaltyValue: 1 }], freeCancel24hrBooking: false },
        taxAmount: '258.00',
      },
    ],
    photos: [{ url: 'https://mock.hotelbeds.com/photos/12098/exterior.jpg', caption: 'Savoy Hotel', category: 'EXTERIOR' }],
    description: 'World-renowned luxury hotel on the Strand.',
  },
];

const MOCK_DATA: Record<string, RawHotelResult[]> = {
  'new york': NYC_PROPERTIES,
  'nyc': NYC_PROPERTIES,
  'jfk': NYC_PROPERTIES,
  'london': LON_PROPERTIES,
  'lon': LON_PROPERTIES,
  'lhr': LON_PROPERTIES,
};

export class MockHotelbedsAdapter implements HotelSourceAdapter {
  readonly adapterId = 'hotelbeds';
  readonly adapterName = 'Hotelbeds APItude API';

  async searchHotels(params: HotelSearchParams): Promise<RawHotelResult[]> {
    // Simulate ~200ms network latency
    await new Promise((resolve) => setTimeout(resolve, 200));

    const key = params.destination.toLowerCase();
    const results = MOCK_DATA[key] ?? [];

    return results.map((r) => ({
      ...r,
      source: { ...r.source, responseLatencyMs: 200 },
    }));
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
