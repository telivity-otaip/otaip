/**
 * Document Verification — Unit Tests
 *
 * Agent 4.5: APIS validation, passport, visa checks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DocumentVerification } from '../index.js';
import type { DocumentVerificationInput, PassengerDocument, TravelSegment } from '../types.js';

let agent: DocumentVerification;

beforeAll(async () => {
  agent = new DocumentVerification();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function makePax(overrides: Partial<PassengerDocument> = {}): PassengerDocument {
  return {
    ticket_name: 'SMITH/JOHN',
    passport_name: 'SMITH/JOHN',
    passport_number: 'P12345678',
    nationality: 'US',
    date_of_birth: '1985-03-15',
    passport_expiry: '2030-01-01',
    gender: 'M',
    ...overrides,
  };
}

function makeSeg(overrides: Partial<TravelSegment> = {}): TravelSegment {
  return {
    destination_country: 'GB',
    travel_date: '2026-06-15',
    ...overrides,
  };
}

function makeInput(overrides: Partial<DocumentVerificationInput> = {}): DocumentVerificationInput {
  return {
    passengers: [makePax()],
    segments: [makeSeg()],
    validation_date: '2026-04-01',
    ...overrides,
  };
}

describe('Document Verification', () => {
  describe('Name match', () => {
    it('passes when ticket name matches passport', async () => {
      const result = await agent.execute({ data: makeInput() });
      const nameCheck = result.data.results[0]!.checks.find((c) => c.name === 'Name Match')!;
      expect(nameCheck.passed).toBe(true);
    });

    it('fails when names differ', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ ticket_name: 'SMITH/JOHN', passport_name: 'JONES/JOHN' })],
      }) });
      const nameCheck = result.data.results[0]!.checks.find((c) => c.name === 'Name Match')!;
      expect(nameCheck.passed).toBe(false);
      expect(nameCheck.severity).toBe('blocking');
    });

    it('passes with minor differences (middle name)', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ ticket_name: 'SMITH/JOHN', passport_name: 'SMITH/JOHN WILLIAM' })],
      }) });
      const nameCheck = result.data.results[0]!.checks.find((c) => c.name === 'Name Match')!;
      expect(nameCheck.passed).toBe(true);
    });
  });

  describe('Date of birth', () => {
    it('passes when DOB present', async () => {
      const result = await agent.execute({ data: makeInput() });
      const dobCheck = result.data.results[0]!.checks.find((c) => c.name === 'DOB Present')!;
      expect(dobCheck.passed).toBe(true);
    });

    it('fails when DOB missing', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ date_of_birth: undefined })],
      }) });
      const dobCheck = result.data.results[0]!.checks.find((c) => c.name === 'DOB Present')!;
      expect(dobCheck.passed).toBe(false);
      expect(dobCheck.severity).toBe('blocking');
    });

    it('fails with invalid DOB format', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ date_of_birth: 'not-a-date' })],
      }) });
      const dobCheck = result.data.results[0]!.checks.find((c) => c.name === 'DOB Present')!;
      expect(dobCheck.passed).toBe(false);
    });
  });

  describe('Passport format', () => {
    it('passes with valid US passport format', async () => {
      const result = await agent.execute({ data: makeInput() });
      const ppCheck = result.data.results[0]!.checks.find((c) => c.name === 'Passport Format')!;
      expect(ppCheck.passed).toBe(true);
    });

    it('flags invalid passport format (advisory)', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ passport_number: 'AB' })], // too short
      }) });
      const ppCheck = result.data.results[0]!.checks.find((c) => c.name === 'Passport Format')!;
      expect(ppCheck.passed).toBe(false);
      expect(ppCheck.severity).toBe('advisory');
    });

    it('validates GB passport format', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ nationality: 'GB', passport_number: 'AB1234567' })],
      }) });
      const ppCheck = result.data.results[0]!.checks.find((c) => c.name === 'Passport Format')!;
      expect(ppCheck.passed).toBe(true);
    });
  });

  describe('Passport validity', () => {
    it('passes when passport valid 6+ months beyond travel', async () => {
      const result = await agent.execute({ data: makeInput() });
      const valCheck = result.data.results[0]!.checks.find((c) => c.name === 'Passport Validity')!;
      expect(valCheck.passed).toBe(true);
    });

    it('fails when passport expires within 6 months of travel', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ passport_expiry: '2026-09-01' })],
        segments: [makeSeg({ travel_date: '2026-06-15' })],
      }) });
      const valCheck = result.data.results[0]!.checks.find((c) => c.name === 'Passport Validity')!;
      expect(valCheck.passed).toBe(false);
      expect(valCheck.severity).toBe('blocking');
    });

    it('uses latest travel date for validity check', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ passport_expiry: '2026-11-01' })],
        segments: [
          makeSeg({ travel_date: '2026-06-01' }),
          makeSeg({ travel_date: '2026-06-15', destination_country: 'FR' }),
        ],
      }) });
      const valCheck = result.data.results[0]!.checks.find((c) => c.name === 'Passport Validity')!;
      // Needs valid until 2026-12-15 (6 months after Jun 15), but expires Nov 1
      expect(valCheck.passed).toBe(false);
    });

    it('respects configurable validity months', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ passport_expiry: '2026-09-01' })],
        segments: [makeSeg({ travel_date: '2026-06-15' })],
        passport_validity_months: 3, // only 3 months required
      }) });
      const valCheck = result.data.results[0]!.checks.find((c) => c.name === 'Passport Validity')!;
      // Expires Sep 1, travel Jun 15, +3 months = Sep 15, fails
      expect(valCheck.passed).toBe(false);
    });

    it('passes when expiry matches exactly the required date', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ passport_expiry: '2027-06-15' })],
        segments: [makeSeg({ travel_date: '2026-06-15' })],
        passport_validity_months: 12,
      }) });
      const valCheck = result.data.results[0]!.checks.find((c) => c.name === 'Passport Validity')!;
      expect(valCheck.passed).toBe(true);
    });
  });

  describe('Gender check', () => {
    it('passes when gender present', async () => {
      const result = await agent.execute({ data: makeInput() });
      const gCheck = result.data.results[0]!.checks.find((c) => c.name === 'Gender Present')!;
      expect(gCheck.passed).toBe(true);
    });

    it('warns when gender missing (advisory)', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ gender: undefined })],
      }) });
      const gCheck = result.data.results[0]!.checks.find((c) => c.name === 'Gender Present')!;
      expect(gCheck.passed).toBe(false);
      expect(gCheck.severity).toBe('advisory');
    });
  });

  describe('Visa check (stub)', () => {
    it('passes for US→GB (visa free)', async () => {
      const result = await agent.execute({ data: makeInput() });
      const visaCheck = result.data.results[0]!.checks.find((c) => c.name.startsWith('Visa Check'))!;
      expect(visaCheck.passed).toBe(true);
    });

    it('flags potential visa requirement for unknown pair', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ nationality: 'NG' })],
        segments: [makeSeg({ destination_country: 'US' })],
      }) });
      const visaCheck = result.data.results[0]!.checks.find((c) => c.name.startsWith('Visa Check'))!;
      expect(visaCheck.passed).toBe(false);
      expect(visaCheck.severity).toBe('advisory');
    });

    it('checks visa for each unique destination', async () => {
      const result = await agent.execute({ data: makeInput({
        segments: [
          makeSeg({ destination_country: 'GB' }),
          makeSeg({ destination_country: 'FR' }),
        ],
      }) });
      const visaChecks = result.data.results[0]!.checks.filter((c) => c.name.startsWith('Visa Check'));
      expect(visaChecks).toHaveLength(2);
    });
  });

  describe('Overall result', () => {
    it('all_passed is true when no blocking failures', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.all_passed).toBe(true);
      expect(result.data.blocking_failures).toBe(0);
    });

    it('all_passed is false with blocking failure', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ date_of_birth: undefined })],
      }) });
      expect(result.data.all_passed).toBe(false);
      expect(result.data.blocking_failures).toBeGreaterThan(0);
    });

    it('counts advisory warnings separately', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ gender: undefined })],
      }) });
      expect(result.data.advisory_warnings).toBeGreaterThan(0);
    });

    it('per-passenger result has correct name', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.results[0]!.passenger_name).toBe('SMITH/JOHN');
    });

    it('handles multiple passengers', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [
          makePax(),
          makePax({ ticket_name: 'DOE/JANE', passport_name: 'DOE/JANE', passport_number: 'Q87654321' }),
        ],
      }) });
      expect(result.data.results).toHaveLength(2);
    });
  });

  describe('Input validation', () => {
    it('rejects empty passengers', async () => {
      await expect(agent.execute({ data: makeInput({ passengers: [] }) })).rejects.toThrow('Invalid input');
    });

    it('rejects empty segments', async () => {
      await expect(agent.execute({ data: makeInput({ segments: [] }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid passenger name format', async () => {
      await expect(agent.execute({ data: makeInput({
        passengers: [makePax({ ticket_name: 'bad name' })],
      }) })).rejects.toThrow('Invalid input');
    });

    it('rejects missing passport number', async () => {
      await expect(agent.execute({ data: makeInput({
        passengers: [makePax({ passport_number: '' })],
      }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid nationality', async () => {
      await expect(agent.execute({ data: makeInput({
        passengers: [makePax({ nationality: 'USA' })],
      }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid destination country', async () => {
      await expect(agent.execute({ data: makeInput({
        segments: [makeSeg({ destination_country: 'United Kingdom' })],
      }) })).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('4.5');
      expect(agent.name).toBe('Document Verification');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('4.5');
      expect(result.metadata!['all_passed']).toBe(true);
    });

    it('warns on blocking failures', async () => {
      const result = await agent.execute({ data: makeInput({
        passengers: [makePax({ date_of_birth: undefined })],
      }) });
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('blocking');
    });

    it('throws when not initialized', async () => {
      const uninit = new DocumentVerification();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });
  });
});
