/**
 * IAR (Interactive Agent Report) Parser
 *
 * Parses ARC weekly billing files in EDI X12, CSV, or XML format.
 * Auto-detects format based on content.
 */

import type { IARRecord, IARFormat } from './types.js';

function detectFormat(content: string): IARFormat {
  const trimmed = content.trim();
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<IAR') || trimmed.startsWith('<iar')) {
    return 'XML';
  }
  if (trimmed.includes('~') && (trimmed.startsWith('ISA') || trimmed.startsWith('ST'))) {
    return 'EDI_X12';
  }
  return 'CSV';
}

function parseTransactionType(code: string): 'SALE' | 'REFUND' | 'ADM' | 'ACM' {
  switch (code.trim().toUpperCase()) {
    case 'SALE': case 'S': return 'SALE';
    case 'REFUND': case 'R': case 'RFND': return 'REFUND';
    case 'ADM': case 'D': return 'ADM';
    case 'ACM': case 'C': return 'ACM';
    default: return 'SALE';
  }
}

function parseEdiX12(content: string): IARRecord[] {
  const records: IARRecord[] = [];
  const segments = content.split('~').map((s) => s.trim()).filter(Boolean);

  for (const segment of segments) {
    const fields = segment.split('*');
    const segType = fields[0]?.trim();

    // IAR transaction segment
    if (segType === 'TXN' && fields.length >= 14) {
      records.push({
        document_number: fields[1]?.trim() ?? '',
        passenger_name: fields[2]?.trim() ?? '',
        origin: fields[3]?.trim() ?? '',
        destination: fields[4]?.trim() ?? '',
        airline_code: fields[5]?.trim() ?? '',
        issue_date: fields[6]?.trim() ?? '',
        base_fare: fields[7]?.trim() ?? '0.00',
        tax_amount: fields[8]?.trim() ?? '0.00',
        total_amount: fields[9]?.trim() ?? '0.00',
        commission_amount: fields[10]?.trim() ?? '0.00',
        transaction_type: parseTransactionType(fields[11]?.trim() ?? 'SALE'),
        adm_issue_date: fields[12]?.trim() || undefined,
        currency: fields[13]?.trim() ?? 'USD',
        settlement_week: fields[14]?.trim() || undefined,
      });
    }
  }

  return records;
}

function parseCsv(content: string): IARRecord[] {
  const records: IARRecord[] = [];
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  // Skip header line
  const startIdx = lines.length > 0 && lines[0]!.toLowerCase().includes('document') ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const fields = lines[i]!.split(',').map((f) => f.trim().replace(/^"|"$/g, ''));

    if (fields.length < 13) continue;

    records.push({
      document_number: fields[0] ?? '',
      passenger_name: fields[1] ?? '',
      origin: fields[2] ?? '',
      destination: fields[3] ?? '',
      airline_code: fields[4] ?? '',
      issue_date: fields[5] ?? '',
      base_fare: fields[6] ?? '0.00',
      tax_amount: fields[7] ?? '0.00',
      total_amount: fields[8] ?? '0.00',
      commission_amount: fields[9] ?? '0.00',
      transaction_type: parseTransactionType(fields[10] ?? 'SALE'),
      adm_issue_date: fields[11] || undefined,
      currency: fields[12] ?? 'USD',
      settlement_week: fields[13] || undefined,
    });
  }

  return records;
}

function parseXml(content: string): IARRecord[] {
  const records: IARRecord[] = [];

  // Simple XML extraction — match <transaction> elements
  const txnRegex = /<transaction>([\s\S]*?)<\/transaction>/gi;
  let match: RegExpExecArray | null;

  while ((match = txnRegex.exec(content)) !== null) {
    const block = match[1] ?? '';

    const getField = (tag: string): string => {
      const fieldMatch = new RegExp(`<${tag}>(.*?)</${tag}>`, 'i').exec(block);
      return fieldMatch?.[1]?.trim() ?? '';
    };

    records.push({
      document_number: getField('document_number'),
      passenger_name: getField('passenger_name'),
      origin: getField('origin'),
      destination: getField('destination'),
      airline_code: getField('airline_code'),
      issue_date: getField('issue_date'),
      base_fare: getField('base_fare') || '0.00',
      tax_amount: getField('tax_amount') || '0.00',
      total_amount: getField('total_amount') || '0.00',
      commission_amount: getField('commission_amount') || '0.00',
      transaction_type: parseTransactionType(getField('transaction_type') || 'SALE'),
      adm_issue_date: getField('adm_issue_date') || undefined,
      currency: getField('currency') || 'USD',
      settlement_week: getField('settlement_week') || undefined,
    });
  }

  return records;
}

export class IARParser {
  private format: IARFormat | undefined;

  constructor(format?: IARFormat) {
    this.format = format;
  }

  parse(content: string): IARRecord[] {
    if (content.trim().length === 0) return [];

    const format = this.format ?? detectFormat(content);

    switch (format) {
      case 'EDI_X12':
        return parseEdiX12(content);
      case 'CSV':
        return parseCsv(content);
      case 'XML':
        return parseXml(content);
    }
  }

  static detectFormat(content: string): IARFormat {
    return detectFormat(content);
  }
}
