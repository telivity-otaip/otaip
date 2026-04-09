import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HotelBookingAgent } from '../index.js';
import type { BookingRequest } from '../types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const VALID_BOOKING_REQUEST: BookingRequest = {
  canonicalPropertyId: 'otaip-htl-test001',
  rateId: 'AM-R1',
  source: { sourceId: 'amadeus', sourcePropertyId: 'AM-001' },
  checkIn: '2025-06-15',
  checkOut: '2025-06-17',
  rooms: 1,
  guest: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1-555-0100',
  },
  paymentModel: 'pay_at_property',
  specialRequests: 'High floor preferred',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent 20.5 — Hotel Booking', () => {
  let agent: HotelBookingAgent;

  beforeAll(async () => {
    agent = new HotelBookingAgent();
    await agent.initialize();
  });

  afterAll(() => {
    agent.destroy();
  });

  describe('Full booking flow', () => {
    it('creates a booking with all confirmation codes', async () => {
      const result = await agent.execute({
        data: { operation: 'book', bookingRequest: VALID_BOOKING_REQUEST },
      });

      expect(result.data.success).toBe(true);
      expect(result.data.booking).toBeDefined();
      expect(result.data.booking!.bookingId).toBeDefined();

      // Three-layer confirmation codes
      const conf = result.data.booking!.confirmation;
      expect(conf.crsConfirmation).toBeDefined();
      expect(conf.crsConfirmation.startsWith('CRS-')).toBe(true);
      expect(conf.pmsConfirmation).toBeDefined();
      expect(conf.pmsConfirmation!.startsWith('PMS-')).toBe(true);
      expect(conf.channelConfirmation).toBeDefined();
      expect(conf.channelConfirmation!.startsWith('CHN-')).toBe(true);
    });

    it('returns confirmed status', async () => {
      const result = await agent.execute({
        data: { operation: 'book', bookingRequest: VALID_BOOKING_REQUEST },
      });

      expect(result.data.booking!.status).toBe('confirmed');
    });

    it('includes cancellation policy and deadline', async () => {
      const result = await agent.execute({
        data: { operation: 'book', bookingRequest: VALID_BOOKING_REQUEST },
      });

      expect(result.data.booking!.cancellationPolicy).toBeDefined();
      expect(result.data.booking!.cancellationDeadline).toBeDefined();
    });

    it('preserves guest details in booking', async () => {
      const result = await agent.execute({
        data: { operation: 'book', bookingRequest: VALID_BOOKING_REQUEST },
      });

      expect(result.data.booking!.guest.firstName).toBe('John');
      expect(result.data.booking!.guest.lastName).toBe('Doe');
    });
  });

  describe('Payment routing', () => {
    it('handles pay-at-property (no immediate charge)', async () => {
      const result = await agent.execute({
        data: {
          operation: 'book',
          bookingRequest: { ...VALID_BOOKING_REQUEST, paymentModel: 'pay_at_property' },
        },
      });

      expect(result.data.booking!.paymentModel).toBe('pay_at_property');
      expect(result.data.booking!.totalCharged.amount).toBe('0.00');
    });

    it('handles prepaid booking', async () => {
      const result = await agent.execute({
        data: {
          operation: 'book',
          bookingRequest: { ...VALID_BOOKING_REQUEST, paymentModel: 'prepaid' },
        },
      });

      expect(result.data.booking!.paymentModel).toBe('prepaid');
    });

    it('handles virtual card booking with dual folio', async () => {
      const result = await agent.execute({
        data: {
          operation: 'book',
          bookingRequest: { ...VALID_BOOKING_REQUEST, paymentModel: 'virtual_card' },
        },
      });

      expect(result.data.booking!.paymentModel).toBe('virtual_card');
      expect(result.data.booking!.virtualCard).toBeDefined();
      expect(result.data.booking!.virtualCard!.dualFolioRequired).toBe(true);
      expect(result.data.booking!.virtualCard!.lastFour).toHaveLength(4);
    });
  });

  describe('Rate verification', () => {
    it('verifies rate successfully', async () => {
      const result = await agent.execute({
        data: { operation: 'verify_rate', bookingRequest: VALID_BOOKING_REQUEST },
      });

      expect(result.data.success).toBe(true);
      expect(result.data.rateChanged).toBe(false);
    });
  });

  describe('Booking retrieval', () => {
    it('retrieves an existing booking', async () => {
      // Create booking first
      const createResult = await agent.execute({
        data: { operation: 'book', bookingRequest: VALID_BOOKING_REQUEST },
      });
      const bookingId = createResult.data.booking!.bookingId;

      // Retrieve it
      const getResult = await agent.execute({
        data: { operation: 'get_booking', bookingId },
      });

      expect(getResult.data.success).toBe(true);
      expect(getResult.data.booking!.bookingId).toBe(bookingId);
    });

    it('returns error for non-existent booking', async () => {
      const result = await agent.execute({
        data: { operation: 'get_booking', bookingId: 'NONEXISTENT-123' },
      });

      expect(result.data.success).toBe(false);
      expect(result.data.error).toContain('not found');
    });
  });

  describe('Input validation', () => {
    it('rejects missing operation', async () => {
      await expect(agent.execute({ data: { operation: '' as 'book' } })).rejects.toThrow(
        'operation',
      );
    });

    it('rejects missing booking request for book operation', async () => {
      await expect(agent.execute({ data: { operation: 'book' } })).rejects.toThrow(
        'bookingRequest',
      );
    });

    it('rejects missing booking ID for get_booking', async () => {
      await expect(agent.execute({ data: { operation: 'get_booking' } })).rejects.toThrow(
        'bookingId',
      );
    });

    it('rejects missing guest details', async () => {
      const noGuest = { ...VALID_BOOKING_REQUEST, guest: undefined };
      await expect(
        agent.execute({ data: { operation: 'book', bookingRequest: noGuest as BookingRequest } }),
      ).rejects.toThrow('guest');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('20.5');
      expect(agent.name).toBe('Hotel Booking');
      expect(agent.version).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninit = new HotelBookingAgent();
      await expect(
        uninit.execute({ data: { operation: 'book', bookingRequest: VALID_BOOKING_REQUEST } }),
      ).rejects.toThrow('not been initialized');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });
  });
});
