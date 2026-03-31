/**
 * ARC Reconciliation — Unit Tests
 *
 * Agent 7.2: IAR parsing + reconciliation matching + ADM dispute windows.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARCReconciliation } from '../index.js';
import { IARParser } from '../iar-parser.js';
import type { ARCReconciliationInput, ARCAgencyRecord, IARRecord, AirlineContract } from '../types.js';

let agent: ARCReconciliation;

beforeAll(async () => {
  agent = new ARCReconciliation();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
}

function makeAgency(overrides: Partial<ARCAgencyRecord> = {}): ARCAgencyRecord {
  return {
    ticket_number: '1251234567890',
    passenger_name: 'SMITH/JOHN',
    origin: 'LHR',
    destination: 'JFK',
    airline_code: 'BA',
    issue_date: '2026-03-15',
    base_fare: '450.00',
    tax_amount: '120.00',
    total_amount: '570.00',
    commission_amount: '31.50',
    transaction_type: 'SALE',
    currency: 'USD',
    ...overrides,
  };
}

function makeIar(overrides: Partial<IARRecord> = {}): IARRecord {
  return {
    document_number: '1251234567890',
    passenger_name: 'SMITH/JOHN',
    origin: 'LHR',
    destination: 'JFK',
    airline_code: 'BA',
    issue_date: '2026-03-15',
    base_fare: '450.00',
    tax_amount: '120.00',
    total_amount: '570.00',
    commission_amount: '31.50',
    transaction_type: 'SALE',
    currency: 'USD',
    settlement_week: '2026-W13',
    ...overrides,
  };
}

function makeInput(overrides: Partial<ARCReconciliationInput> = {}): ARCReconciliationInput {
  return {
    agency_records: [makeAgency()],
    iar_records: [makeIar()],
    settlement_week: '2026-W13',
    current_datetime: '2026-04-01T12:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// IAR Parser
// ---------------------------------------------------------------------------
describe('IAR Parser', () => {
  it('auto-detects CSV format', () => {
    const content = loadFixture('iar-csv.csv');
    expect(IARParser.detectFormat(content)).toBe('CSV');
  });

  it('auto-detects EDI X12 format', () => {
    const content = loadFixture('iar-edi-x12.txt');
    expect(IARParser.detectFormat(content)).toBe('EDI_X12');
  });

  it('auto-detects XML format', () => {
    const content = loadFixture('iar-xml.xml');
    expect(IARParser.detectFormat(content)).toBe('XML');
  });

  it('parses CSV records', () => {
    const content = loadFixture('iar-csv.csv');
    const parser = new IARParser();
    const records = parser.parse(content);
    expect(records.length).toBe(6);
    expect(records[0]!.document_number).toBe('1251234567890');
    expect(records[0]!.total_amount).toBe('570.00');
    expect(records[0]!.transaction_type).toBe('SALE');
  });

  it('parses EDI X12 records', () => {
    const content = loadFixture('iar-edi-x12.txt');
    const parser = new IARParser();
    const records = parser.parse(content);
    expect(records.length).toBe(3);
    expect(records[0]!.document_number).toBe('1251234567890');
  });

  it('parses XML records', () => {
    const content = loadFixture('iar-xml.xml');
    const parser = new IARParser();
    const records = parser.parse(content);
    expect(records.length).toBe(2);
    expect(records[0]!.document_number).toBe('1251234567890');
    expect(records[1]!.airline_code).toBe('AF');
  });

  it('parses ADM records with issue date from CSV', () => {
    const content = loadFixture('iar-csv.csv');
    const parser = new IARParser();
    const records = parser.parse(content);
    const adm = records.find((r) => r.transaction_type === 'ADM');
    expect(adm).toBeDefined();
    expect(adm!.adm_issue_date).toBe('2026-03-25');
  });

  it('returns empty for empty content', () => {
    const parser = new IARParser();
    expect(parser.parse('')).toEqual([]);
  });

  it('handles forced format override', () => {
    const content = loadFixture('iar-csv.csv');
    const parser = new IARParser('CSV');
    const records = parser.parse(content);
    expect(records.length).toBe(6);
  });

  it('skips CSV header row', () => {
    const parser = new IARParser('CSV');
    const records = parser.parse('document_number,passenger_name,origin\n');
    expect(records).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ARC Reconciliation
// ---------------------------------------------------------------------------
describe('ARC Reconciliation', () => {
  describe('Matching', () => {
    it('matches identical records with no discrepancies', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.discrepancies).toHaveLength(0);
      expect(result.data.passed).toBe(true);
      expect(result.data.summary.matched_count).toBe(1);
    });

    it('detects missing in IAR', async () => {
      const input = makeInput({ iar_records: [] });
      const result = await agent.execute({ data: input });
      const missing = result.data.discrepancies.find((d) => d.type === 'MISSING_IN_IAR');
      expect(missing).toBeDefined();
      expect(missing!.severity).toBe('critical');
    });

    it('detects missing in agency', async () => {
      const input = makeInput({
        agency_records: [],
        iar_records: [makeIar()],
      });
      const result = await agent.execute({ data: input });
      const missing = result.data.discrepancies.find((d) => d.type === 'MISSING_IN_AGENCY');
      expect(missing).toBeDefined();
    });
  });

  describe('Amount discrepancies', () => {
    it('detects amount mismatch', async () => {
      const input = makeInput({
        iar_records: [makeIar({ total_amount: '620.00' })],
      });
      const result = await agent.execute({ data: input });
      const mismatch = result.data.discrepancies.find((d) => d.type === 'AMOUNT_MISMATCH');
      expect(mismatch).toBeDefined();
      expect(mismatch!.difference).toBe('50.00');
    });

    it('ignores amount below threshold', async () => {
      const input = makeInput({
        iar_records: [makeIar({ total_amount: '575.00' })],
        min_threshold: '10.00',
      });
      const result = await agent.execute({ data: input });
      const mismatch = result.data.discrepancies.find((d) => d.type === 'AMOUNT_MISMATCH');
      expect(mismatch).toBeUndefined();
    });
  });

  describe('Commission validation', () => {
    it('detects commission mismatch', async () => {
      const input = makeInput({
        iar_records: [makeIar({ commission_amount: '50.00' })],
      });
      const result = await agent.execute({ data: input });
      const comm = result.data.discrepancies.find((d) => d.type === 'COMMISSION_MISMATCH');
      expect(comm).toBeDefined();
    });

    it('flags commission exceeding contracted rate', async () => {
      const contracts: AirlineContract[] = [
        { airline_code: 'BA', contracted_rate: 5, effective_from: '2026-01-01' },
      ];
      const input = makeInput({
        iar_records: [makeIar({ commission_rate: 7 })],
        contracts,
      });
      const result = await agent.execute({ data: input });
      const overComm = result.data.discrepancies.find(
        (d) => d.type === 'COMMISSION_MISMATCH' && d.description.includes('contracted rate'),
      );
      expect(overComm).toBeDefined();
    });

    it('passes when commission within contracted rate', async () => {
      const contracts: AirlineContract[] = [
        { airline_code: 'BA', contracted_rate: 10, effective_from: '2026-01-01' },
      ];
      const input = makeInput({
        iar_records: [makeIar({ commission_rate: 7 })],
        contracts,
      });
      const result = await agent.execute({ data: input });
      const overComm = result.data.discrepancies.find(
        (d) => d.description.includes('contracted rate'),
      );
      expect(overComm).toBeUndefined();
    });

    it('ignores expired contract', async () => {
      const contracts: AirlineContract[] = [
        { airline_code: 'BA', contracted_rate: 5, effective_from: '2025-01-01', effective_to: '2025-12-31' },
      ];
      const input = makeInput({
        iar_records: [makeIar({ commission_rate: 7 })],
        contracts,
      });
      const result = await agent.execute({ data: input });
      const overComm = result.data.discrepancies.find(
        (d) => d.description.includes('contracted rate'),
      );
      expect(overComm).toBeUndefined();
    });
  });

  describe('Currency discrepancies', () => {
    it('detects currency mismatch', async () => {
      const input = makeInput({
        iar_records: [makeIar({ currency: 'EUR' })],
      });
      const result = await agent.execute({ data: input });
      expect(result.data.discrepancies.some((d) => d.type === 'CURRENCY_MISMATCH')).toBe(true);
    });
  });

  describe('ADM/ACM handling', () => {
    it('detects unmatched ADM', async () => {
      const input = makeInput({
        agency_records: [],
        iar_records: [makeIar({ transaction_type: 'ADM' })],
      });
      const result = await agent.execute({ data: input });
      expect(result.data.discrepancies.some((d) => d.type === 'UNMATCHED_ADM')).toBe(true);
      expect(result.data.summary.adm_count).toBe(1);
    });

    it('detects unmatched ACM', async () => {
      const input = makeInput({
        agency_records: [],
        iar_records: [makeIar({ transaction_type: 'ACM' })],
      });
      const result = await agent.execute({ data: input });
      expect(result.data.discrepancies.some((d) => d.type === 'UNMATCHED_ACM')).toBe(true);
      expect(result.data.summary.acm_count).toBe(1);
    });

    it('warns when ADM dispute window is expiring (<=5 days)', async () => {
      const input = makeInput({
        iar_records: [makeIar({
          transaction_type: 'ADM',
          adm_issue_date: '2026-03-22', // 10 days ago, 5 days left in 15-day window
        })],
        adm_dispute_window_days: 15,
        current_datetime: '2026-04-01T12:00:00Z',
      });
      const result = await agent.execute({ data: input });
      const expiring = result.data.discrepancies.find((d) => d.type === 'ADM_DISPUTE_WINDOW_EXPIRING');
      expect(expiring).toBeDefined();
      expect(expiring!.dispute_days_remaining).toBeGreaterThan(0);
      expect(expiring!.dispute_days_remaining).toBeLessThanOrEqual(5);
    });

    it('no dispute warning when ADM is old (window already closed)', async () => {
      const input = makeInput({
        iar_records: [makeIar({
          transaction_type: 'ADM',
          adm_issue_date: '2026-03-01', // 31 days ago
        })],
        current_datetime: '2026-04-01T12:00:00Z',
      });
      const result = await agent.execute({ data: input });
      const expiring = result.data.discrepancies.find((d) => d.type === 'ADM_DISPUTE_WINDOW_EXPIRING');
      expect(expiring).toBeUndefined();
    });
  });

  describe('Duplicate detection', () => {
    it('detects duplicate SALE in IAR', async () => {
      const input = makeInput({
        iar_records: [makeIar(), makeIar()],
      });
      const result = await agent.execute({ data: input });
      expect(result.data.discrepancies.some((d) => d.type === 'DUPLICATE_TRANSACTION')).toBe(true);
    });
  });

  describe('Net remittance', () => {
    it('calculates net remittance from IAR', async () => {
      const input = makeInput({
        iar_records: [
          makeIar({ total_amount: '570.00', commission_amount: '31.50' }),
        ],
      });
      const result = await agent.execute({ data: input });
      // 570 - 31.50 = 538.50
      expect(result.data.summary.net_remittance).toBe('538.50');
    });

    it('uses net_remittance field when present', async () => {
      const input = makeInput({
        iar_records: [makeIar({ net_remittance: '540.00' })],
      });
      const result = await agent.execute({ data: input });
      expect(result.data.summary.net_remittance).toBe('540.00');
    });
  });

  describe('Pattern detection', () => {
    it('detects patterns with 10+ discrepancies', async () => {
      const agencies: ARCAgencyRecord[] = [];
      const iars: IARRecord[] = [];
      for (let i = 0; i < 12; i++) {
        const num = `125123456${String(7890 + i).padStart(4, '0')}`;
        agencies.push(makeAgency({ ticket_number: num, commission_amount: '31.50' }));
        iars.push(makeIar({ document_number: num, commission_amount: '50.00' }));
      }
      const result = await agent.execute({ data: makeInput({ agency_records: agencies, iar_records: iars }) });
      expect(result.data.summary.patterns.length).toBeGreaterThan(0);
    });

    it('no patterns with fewer than 10 discrepancies', async () => {
      const result = await agent.execute({ data: makeInput({
        agency_records: [makeAgency()],
        iar_records: [makeIar({ commission_amount: '50.00' })],
      }) });
      expect(result.data.summary.patterns).toHaveLength(0);
    });
  });

  describe('Input validation', () => {
    it('rejects invalid ticket number', async () => {
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

    it('rejects invalid IAR document number', async () => {
      const input = makeInput({
        iar_records: [makeIar({ document_number: 'BAD' })],
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });

    it('rejects empty settlement week', async () => {
      await expect(agent.execute({ data: makeInput({ settlement_week: '' }) })).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('7.2');
      expect(agent.name).toBe('ARC Reconciliation');
    });

    it('reports healthy', async () => {
      expect((await agent.health()).status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('7.2');
      expect(result.metadata!['settlement_week']).toBe('2026-W13');
      expect(result.metadata!['net_remittance']).toBeDefined();
    });

    it('warns on critical discrepancies', async () => {
      const input = makeInput({ iar_records: [] });
      const result = await agent.execute({ data: input });
      expect(result.warnings!.some((w) => w.includes('critical'))).toBe(true);
    });

    it('warns on expiring ADM disputes', async () => {
      const input = makeInput({
        iar_records: [makeIar({
          transaction_type: 'ADM',
          adm_issue_date: '2026-03-22',
        })],
        current_datetime: '2026-04-01T12:00:00Z',
      });
      const result = await agent.execute({ data: input });
      expect(result.warnings!.some((w) => w.includes('ADM dispute'))).toBe(true);
    });

    it('throws when not initialized', async () => {
      const uninit = new ARCReconciliation();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });
  });
});
