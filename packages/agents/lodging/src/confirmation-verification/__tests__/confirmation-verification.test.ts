import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ConfirmationVerificationAgent } from '../index.js';
import { verifyBooking } from '../verification-workflow.js';
import type { VerificationInput, CrsBookingData, PmsBookingData } from '../types.js';
import type { HotelConfirmation } from '../../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const confirmation: HotelConfirmation = {
  crsConfirmation: 'CRS-ABC123',
  pmsConfirmation: 'PMS-XYZ789',
  channelConfirmation: 'CHN-001',
  source: { sourceId: 'amadeus', sourcePropertyId: 'NYCMC001' },
};

const baseCrsData: CrsBookingData = {
  confirmationCode: 'CRS-ABC123',
  guestName: 'John Smith',
  checkIn: '2025-08-01',
  checkOut: '2025-08-03',
  roomType: 'Deluxe King',
  nightlyRate: { amount: '299.00', currency: 'USD' },
  totalRate: { amount: '598.00', currency: 'USD' },
  status: 'confirmed',
};

const matchingPmsData: PmsBookingData = {
  confirmationCode: 'PMS-XYZ789',
  guestName: 'John Smith',
  checkIn: '2025-08-01',
  checkOut: '2025-08-03',
  roomType: 'Deluxe King',
  nightlyRate: { amount: '299.00', currency: 'USD' },
  totalRate: { amount: '598.00', currency: 'USD' },
  status: 'confirmed',
};

const baseInput: VerificationInput = {
  operation: 'verify',
  bookingId: 'BK-001',
  confirmation,
  crsData: baseCrsData,
  pmsData: matchingPmsData,
  guest: { firstName: 'John', lastName: 'Smith' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent 20.7 — Confirmation Verification', () => {
  let agent: ConfirmationVerificationAgent;

  beforeAll(async () => {
    agent = new ConfirmationVerificationAgent();
    await agent.initialize();
  });

  afterAll(() => {
    agent.destroy();
  });

  describe('CRS↔PMS cross-check', () => {
    it('passes when all fields match', () => {
      const result = verifyBooking(baseInput);

      expect(result.verified).toBe(true);
      expect(result.discrepancies).toHaveLength(0);
      expect(result.escalationRequired).toBe(false);
      expect(result.escalationReasons).toHaveLength(0);
    });

    it('escalates when PMS data is missing', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: undefined,
      });

      expect(result.verified).toBe(false);
      expect(result.escalationRequired).toBe(true);
      expect(result.escalationReasons).toContain('pms_code_missing');
      expect(result.discrepancies[0].field).toBe('pms_missing');
      expect(result.discrepancies[0].severity).toBe('critical');
    });

    it('detects check-in date mismatch', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: { ...matchingPmsData, checkIn: '2025-08-02' },
      });

      expect(result.verified).toBe(false);
      expect(result.escalationRequired).toBe(true);
      expect(result.escalationReasons).toContain('date_mismatch');

      const dateMismatch = result.discrepancies.find(d => d.field === 'check_in');
      expect(dateMismatch).toBeDefined();
      expect(dateMismatch!.severity).toBe('critical');
      expect(dateMismatch!.crsValue).toBe('2025-08-01');
      expect(dateMismatch!.pmsValue).toBe('2025-08-02');
    });

    it('detects check-out date mismatch', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: { ...matchingPmsData, checkOut: '2025-08-05' },
      });

      expect(result.verified).toBe(false);
      expect(result.escalationReasons).toContain('date_mismatch');
    });

    it('detects nightly rate mismatch', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: {
          ...matchingPmsData,
          nightlyRate: { amount: '349.00', currency: 'USD' },
        },
      });

      expect(result.verified).toBe(false);
      expect(result.escalationRequired).toBe(true);
      expect(result.escalationReasons).toContain('rate_mismatch');

      const rateMismatch = result.discrepancies.find(d => d.field === 'nightly_rate');
      expect(rateMismatch).toBeDefined();
      expect(rateMismatch!.severity).toBe('critical');
    });

    it('detects total rate mismatch', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: {
          ...matchingPmsData,
          totalRate: { amount: '700.00', currency: 'USD' },
        },
      });

      expect(result.verified).toBe(false);
      expect(result.escalationReasons).toContain('rate_mismatch');
    });

    it('detects currency mismatch in rates', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: {
          ...matchingPmsData,
          nightlyRate: { amount: '299.00', currency: 'EUR' },
        },
      });

      expect(result.verified).toBe(false);
      expect(result.escalationReasons).toContain('rate_mismatch');
    });

    it('detects room type mismatch', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: { ...matchingPmsData, roomType: 'Standard Double' },
      });

      expect(result.verified).toBe(false);
      expect(result.escalationRequired).toBe(true);
      expect(result.escalationReasons).toContain('room_type_mismatch');
    });

    it('detects guest name mismatch as warning', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: { ...matchingPmsData, guestName: 'Jonathan Smith' },
      });

      expect(result.verified).toBe(false);
      expect(result.escalationReasons).toContain('guest_name_mismatch');

      const nameMismatch = result.discrepancies.find(d => d.field === 'guest_name');
      expect(nameMismatch).toBeDefined();
      expect(nameMismatch!.severity).toBe('warning');
    });

    it('handles GDS name format (SMITH/JOHN) matching PMS format', () => {
      const result = verifyBooking({
        ...baseInput,
        crsData: { ...baseCrsData, guestName: 'SMITH/JOHN' },
        pmsData: { ...matchingPmsData, guestName: 'John Smith' },
      });

      // After normalization, these should match
      expect(result.discrepancies.find(d => d.field === 'guest_name')).toBeUndefined();
    });
  });

  describe('Status escalation', () => {
    it('escalates waitlist status', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: { ...matchingPmsData, status: 'waitlist' },
      });

      expect(result.escalationRequired).toBe(true);
      expect(result.escalationReasons).toContain('waitlist_status');

      const statusDisc = result.discrepancies.find(d => d.field === 'status');
      expect(statusDisc).toBeDefined();
      expect(statusDisc!.severity).toBe('critical');
    });

    it('escalates tentative status', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: { ...matchingPmsData, status: 'tentative' },
      });

      expect(result.escalationRequired).toBe(true);
      expect(result.escalationReasons).toContain('tentative_status');
    });

    it('does not escalate confirmed status', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: { ...matchingPmsData, status: 'confirmed' },
      });

      expect(result.escalationReasons).not.toContain('waitlist_status');
      expect(result.escalationReasons).not.toContain('tentative_status');
    });
  });

  describe('Multiple discrepancies', () => {
    it('escalates when 3+ discrepancies found', () => {
      const result = verifyBooking({
        ...baseInput,
        pmsData: {
          ...matchingPmsData,
          guestName: 'Jane Doe',
          checkIn: '2025-08-10',
          roomType: 'Standard Twin',
        },
      });

      expect(result.verified).toBe(false);
      expect(result.discrepancies.length).toBeGreaterThanOrEqual(3);
      expect(result.escalationReasons).toContain('multiple_discrepancies');
    });
  });

  describe('Agent operations', () => {
    it('verifies matching booking', async () => {
      const result = await agent.execute({ data: baseInput });

      expect(result.data.verified).toBe(true);
      expect(result.data.discrepancies).toHaveLength(0);
      expect(result.confidence).toBe(1.0);
    });

    it('returns lower confidence for failed verification', async () => {
      const result = await agent.execute({
        data: {
          ...baseInput,
          pmsData: undefined,
        },
      });

      expect(result.data.verified).toBe(false);
      expect(result.confidence).toBe(0.5);
      expect(result.metadata.escalation_required).toBe(true);
    });
  });

  describe('Input validation', () => {
    it('rejects missing booking ID', async () => {
      await expect(
        agent.execute({
          data: { ...baseInput, bookingId: '' },
        }),
      ).rejects.toThrow('bookingId');
    });

    it('rejects invalid operation', async () => {
      await expect(
        agent.execute({
          data: { ...baseInput, operation: 'invalid' as 'verify' },
        }),
      ).rejects.toThrow('operation');
    });

    it('rejects missing confirmation codes', async () => {
      await expect(
        agent.execute({
          data: { ...baseInput, confirmation: undefined as unknown as HotelConfirmation },
        }),
      ).rejects.toThrow('confirmation');
    });

    it('rejects missing CRS data', async () => {
      await expect(
        agent.execute({
          data: { ...baseInput, crsData: undefined as unknown as CrsBookingData },
        }),
      ).rejects.toThrow('crsData');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('20.7');
      expect(agent.name).toBe('Confirmation Verification');
      expect(agent.version).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninit = new ConfirmationVerificationAgent();
      await expect(
        uninit.execute({ data: baseInput }),
      ).rejects.toThrow('not been initialized');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });
  });
});
