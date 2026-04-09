/**
 * BSP Reconciliation — Unit Tests
 *
 * Agent 7.1: HOT file parsing + reconciliation matching.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BSPReconciliation } from '../index.js';
import { HOTFileParser } from '../hot-file-parser.js';
import type { BSPReconciliationInput, AgencyRecord, HOTFileRecord } from '../types.js';

let agent: BSPReconciliation;

beforeAll(async () => {
  agent = new BSPReconciliation();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
}

function makeAgency(overrides: Partial<AgencyRecord> = {}): AgencyRecord {
  return {
    ticket_number: '1251234567890',
    passenger_name: 'SMITH/JOHN',
    origin: 'LHR',
    destination: 'JFK',
    airline_code: 'BA',
    issue_date: '2026-03-15',
    ticket_amount: '550.00',
    commission_amount: '38.50',
    tax_amount: '120.00',
    transaction_type: 'SALE',
    currency: 'USD',
    ...overrides,
  };
}

function makeHot(overrides: Partial<HOTFileRecord> = {}): HOTFileRecord {
  return {
    ticket_number: '1251234567890',
    passenger_name: 'SMITH/JOHN',
    origin: 'LHR',
    destination: 'JFK',
    airline_code: 'BA',
    issue_date: '2026-03-15',
    ticket_amount: '550.00',
    commission_amount: '38.50',
    tax_amount: '120.00',
    transaction_type: 'SALE',
    currency: 'USD',
    billing_period: '2026-P03',
    ...overrides,
  };
}

function makeInput(overrides: Partial<BSPReconciliationInput> = {}): BSPReconciliationInput {
  return {
    agency_records: [makeAgency()],
    hot_records: [makeHot()],
    billing_period: '2026-P03',
    current_datetime: '2026-04-01T12:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// HOT File Parser
// ---------------------------------------------------------------------------
describe('HOT File Parser', () => {
  it('auto-detects EDI X12 format', () => {
    const content = loadFixture('hot-edi-x12.txt');
    expect(HOTFileParser.detectFormat(content)).toBe('EDI_X12');
  });

  it('auto-detects fixed-width format', () => {
    const content = loadFixture('hot-fixed-width.txt');
    expect(HOTFileParser.detectFormat(content)).toBe('FIXED_WIDTH');
  });

  it('parses EDI X12 records', () => {
    const content = loadFixture('hot-edi-x12.txt');
    const parser = new HOTFileParser();
    const records = parser.parse(content);
    expect(records.length).toBe(6);
    expect(records[0]!.ticket_number).toBe('1251234567890');
    expect(records[0]!.passenger_name).toBe('SMITH/JOHN');
    expect(records[0]!.ticket_amount).toBe('550.00');
    expect(records[0]!.transaction_type).toBe('SALE');
  });

  it('parses fixed-width records', () => {
    const content = loadFixture('hot-fixed-width.txt');
    const parser = new HOTFileParser('FIXED_WIDTH');
    const records = parser.parse(content);
    expect(records.length).toBe(3);
    expect(records[0]!.ticket_number).toBe('1251234567890');
    expect(records[0]!.airline_code).toBe('BA');
  });

  it('parses refund records in EDI', () => {
    const content = loadFixture('hot-edi-x12.txt');
    const parser = new HOTFileParser();
    const records = parser.parse(content);
    const refund = records.find((r) => r.transaction_type === 'REFUND');
    expect(refund).toBeDefined();
    expect(refund!.refund_amount).toBe('450.00');
  });

  it('parses ADM records in EDI', () => {
    const content = loadFixture('hot-edi-x12.txt');
    const parser = new HOTFileParser();
    const records = parser.parse(content);
    const adm = records.find((r) => r.transaction_type === 'ADM');
    expect(adm).toBeDefined();
    expect(adm!.airline_code).toBe('NH');
  });

  it('returns empty for empty content', () => {
    const parser = new HOTFileParser();
    expect(parser.parse('')).toEqual([]);
  });

  it('skips header/trailer in fixed-width', () => {
    const parser = new HOTFileParser('FIXED_WIDTH');
    const records = parser.parse('HDR TEST HEADER\nTRL FOOTER');
    expect(records).toEqual([]);
  });

  it('handles forced format override', () => {
    const parser = new HOTFileParser('EDI_X12');
    const records = parser.parse(
      'TKT*1234567890123*PAX*LHR*JFK*BA*2026-01-01*100.00*7.00*20.00**SALE*001*CC*USD*P01~',
    );
    expect(records.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Reconciliation matching
// ---------------------------------------------------------------------------
describe('BSP Reconciliation', () => {
  describe('Matching', () => {
    it('matches identical records with no discrepancies', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.discrepancies).toHaveLength(0);
      expect(result.data.passed).toBe(true);
      expect(result.data.summary.matched_count).toBe(1);
    });

    it('detects missing in HOT', async () => {
      const input = makeInput({ hot_records: [] });
      const result = await agent.execute({ data: input });
      const missing = result.data.discrepancies.find((d) => d.type === 'MISSING_IN_HOT');
      expect(missing).toBeDefined();
      expect(missing!.severity).toBe('critical');
    });

    it('detects missing in agency', async () => {
      const input = makeInput({
        agency_records: [],
        hot_records: [makeHot()],
      });
      const result = await agent.execute({ data: input });
      const missing = result.data.discrepancies.find((d) => d.type === 'MISSING_IN_AGENCY');
      expect(missing).toBeDefined();
    });
  });

  describe('Amount discrepancies', () => {
    it('detects amount mismatch above threshold', async () => {
      const input = makeInput({
        hot_records: [makeHot({ ticket_amount: '600.00' })],
      });
      const result = await agent.execute({ data: input });
      const mismatch = result.data.discrepancies.find((d) => d.type === 'AMOUNT_MISMATCH');
      expect(mismatch).toBeDefined();
      expect(mismatch!.difference).toBe('50.00');
    });

    it('ignores amount difference below threshold', async () => {
      const input = makeInput({
        hot_records: [makeHot({ ticket_amount: '555.00' })],
        min_threshold: '10.00',
      });
      const result = await agent.execute({ data: input });
      const mismatch = result.data.discrepancies.find((d) => d.type === 'AMOUNT_MISMATCH');
      expect(mismatch).toBeUndefined();
    });

    it('respects custom threshold', async () => {
      const input = makeInput({
        hot_records: [makeHot({ ticket_amount: '555.00' })],
        min_threshold: '3.00',
      });
      const result = await agent.execute({ data: input });
      expect(result.data.discrepancies.some((d) => d.type === 'AMOUNT_MISMATCH')).toBe(true);
    });
  });

  describe('Commission discrepancies', () => {
    it('detects commission mismatch', async () => {
      const input = makeInput({
        hot_records: [makeHot({ commission_amount: '55.00' })],
      });
      const result = await agent.execute({ data: input });
      const comm = result.data.discrepancies.find((d) => d.type === 'COMMISSION_MISMATCH');
      expect(comm).toBeDefined();
      expect(comm!.difference).toBe('16.50');
    });
  });

  describe('Currency discrepancies', () => {
    it('detects currency mismatch', async () => {
      const input = makeInput({
        hot_records: [makeHot({ currency: 'EUR' })],
      });
      const result = await agent.execute({ data: input });
      const curr = result.data.discrepancies.find((d) => d.type === 'CURRENCY_MISMATCH');
      expect(curr).toBeDefined();
    });
  });

  describe('ADM/ACM handling', () => {
    it('detects unmatched ADM', async () => {
      const input = makeInput({
        agency_records: [],
        hot_records: [makeHot({ transaction_type: 'ADM' })],
      });
      const result = await agent.execute({ data: input });
      const adm = result.data.discrepancies.find((d) => d.type === 'UNMATCHED_ADM');
      expect(adm).toBeDefined();
      expect(adm!.severity).toBe('high');
    });

    it('detects unmatched ACM', async () => {
      const input = makeInput({
        agency_records: [],
        hot_records: [makeHot({ transaction_type: 'ACM' })],
      });
      const result = await agent.execute({ data: input });
      const acm = result.data.discrepancies.find((d) => d.type === 'UNMATCHED_ACM');
      expect(acm).toBeDefined();
    });
  });

  describe('Duplicate detection', () => {
    it('detects duplicate SALE in HOT', async () => {
      const input = makeInput({
        agency_records: [makeAgency()],
        hot_records: [makeHot(), makeHot()],
      });
      const result = await agent.execute({ data: input });
      const dup = result.data.discrepancies.find((d) => d.type === 'DUPLICATE_TRANSACTION');
      expect(dup).toBeDefined();
    });
  });

  describe('Pattern detection', () => {
    it('detects recurring commission mismatch pattern with 10+ discrepancies', async () => {
      // Build 12 records with commission mismatches for same airline
      const agencies: AgencyRecord[] = [];
      const hots: HOTFileRecord[] = [];
      for (let i = 0; i < 12; i++) {
        const ticketNum = `125123456${String(7890 + i).padStart(4, '0')}`;
        agencies.push(makeAgency({ ticket_number: ticketNum, commission_amount: '38.50' }));
        hots.push(makeHot({ ticket_number: ticketNum, commission_amount: '55.00' }));
      }
      const input = makeInput({ agency_records: agencies, hot_records: hots });
      const result = await agent.execute({ data: input });
      expect(result.data.summary.patterns.length).toBeGreaterThan(0);
      expect(result.data.summary.patterns[0]!.pattern).toBe('RECURRING_COMMISSION_MISMATCH');
    });

    it('no pattern detection with fewer than 10 discrepancies', async () => {
      const agencies: AgencyRecord[] = [];
      const hots: HOTFileRecord[] = [];
      for (let i = 0; i < 5; i++) {
        const ticketNum = `125123456${String(7890 + i).padStart(4, '0')}`;
        agencies.push(makeAgency({ ticket_number: ticketNum, commission_amount: '38.50' }));
        hots.push(makeHot({ ticket_number: ticketNum, commission_amount: '55.00' }));
      }
      const input = makeInput({ agency_records: agencies, hot_records: hots });
      const result = await agent.execute({ data: input });
      expect(result.data.summary.patterns).toHaveLength(0);
    });
  });

  describe('Summary', () => {
    it('generates correct summary counts', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.summary.total_agency_records).toBe(1);
      expect(result.data.summary.total_hot_records).toBe(1);
      expect(result.data.summary.matched_count).toBe(1);
    });

    it('reports critical count', async () => {
      const input = makeInput({ hot_records: [] });
      const result = await agent.execute({ data: input });
      expect(result.data.summary.critical_count).toBeGreaterThan(0);
      expect(result.data.passed).toBe(false);
    });
  });

  describe('Remittance deadline warning', () => {
    it('warns when deadline is within 48 hours', async () => {
      const input = makeInput({
        remittance_deadline: '2026-04-02T12:00:00Z',
        current_datetime: '2026-04-01T12:00:00Z',
        hot_records: [], // cause a discrepancy
      });
      const result = await agent.execute({ data: input });
      expect(result.warnings!.some((w) => w.includes('Remittance deadline'))).toBe(true);
    });
  });

  describe('Input validation', () => {
    it('rejects invalid agency ticket number', async () => {
      const input = makeInput({
        agency_records: [makeAgency({ ticket_number: 'BAD' })],
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid airline code', async () => {
      const input = makeInput({
        agency_records: [makeAgency({ airline_code: 'X' })],
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid HOT ticket number', async () => {
      const input = makeInput({
        hot_records: [makeHot({ ticket_number: 'BAD' })],
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });

    it('rejects empty billing period', async () => {
      await expect(agent.execute({ data: makeInput({ billing_period: '' }) })).rejects.toThrow(
        'Invalid input',
      );
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('7.1');
      expect(agent.name).toBe('BSP Reconciliation');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy', async () => {
      expect((await agent.health()).status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('7.1');
      expect(result.metadata!['billing_period']).toBe('2026-P03');
    });

    it('throws when not initialized', async () => {
      const uninit = new BSPReconciliation();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });

    it('reports unhealthy when not initialized', async () => {
      const uninit = new BSPReconciliation();
      expect((await uninit.health()).status).toBe('unhealthy');
    });
  });
});
