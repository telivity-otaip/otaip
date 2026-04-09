/**
 * HOT (Hand-Off Tape) File Parser
 *
 * Parses BSP billing files in EDI X12 or fixed-width ASCII format.
 * Auto-detects format based on content.
 */

import type { HOTFileRecord, HOTFileFormat } from './types.js';

const EDI_DELIMITER = '*';
const EDI_SEGMENT_TERMINATOR = '~';

function detectFormat(content: string): HOTFileFormat {
  const firstLine = content.split('\n')[0] ?? '';
  // EDI X12 files typically start with ISA or ST segment
  if (
    firstLine.includes(EDI_SEGMENT_TERMINATOR) ||
    firstLine.startsWith('ISA') ||
    firstLine.startsWith('ST')
  ) {
    return 'EDI_X12';
  }
  return 'FIXED_WIDTH';
}

function parseTransactionType(code: string): 'SALE' | 'REFUND' | 'ADM' | 'ACM' {
  switch (code.trim().toUpperCase()) {
    case 'SALE':
    case 'S':
    case 'TKTT':
      return 'SALE';
    case 'REFUND':
    case 'R':
    case 'RFND':
      return 'REFUND';
    case 'ADM':
    case 'D':
      return 'ADM';
    case 'ACM':
    case 'C':
      return 'ACM';
    default:
      return 'SALE';
  }
}

function parseEdiX12(content: string): HOTFileRecord[] {
  const records: HOTFileRecord[] = [];
  // Split by segment terminator, filter to transaction segments
  const segments = content
    .split(EDI_SEGMENT_TERMINATOR)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const fields = segment.split(EDI_DELIMITER);
    const segType = fields[0]?.trim();

    // BHT = transaction detail in HOT files
    // We look for segments with ticket data — format: TKT*ticketnum*paxname*origin*dest*airline*date*amount*commission*tax*refund*txntype*seq*payment*currency*period
    if (segType === 'TKT' && fields.length >= 15) {
      records.push({
        ticket_number: fields[1]?.trim() ?? '',
        passenger_name: fields[2]?.trim() ?? '',
        origin: fields[3]?.trim() ?? '',
        destination: fields[4]?.trim() ?? '',
        airline_code: fields[5]?.trim() ?? '',
        issue_date: fields[6]?.trim() ?? '',
        ticket_amount: fields[7]?.trim() ?? '0.00',
        commission_amount: fields[8]?.trim() ?? '0.00',
        tax_amount: fields[9]?.trim() ?? '0.00',
        refund_amount: fields[10]?.trim() || undefined,
        transaction_type: parseTransactionType(fields[11]?.trim() ?? 'SALE'),
        issue_sequence: fields[12]?.trim() || undefined,
        payment_type: fields[13]?.trim() || undefined,
        currency: fields[14]?.trim() ?? 'USD',
        billing_period: fields[15]?.trim() || undefined,
      });
    }
  }

  return records;
}

function parseFixedWidth(content: string): HOTFileRecord[] {
  const records: HOTFileRecord[] = [];
  const lines = content.split('\n').filter((line) => line.trim().length > 0);

  for (const line of lines) {
    // Skip header/trailer lines
    if (line.startsWith('HDR') || line.startsWith('TRL') || line.startsWith('#')) {
      continue;
    }

    // Fixed-width layout:
    // Cols  1-13:  ticket_number
    // Cols 14-43:  passenger_name
    // Cols 44-46:  origin
    // Cols 47-49:  destination
    // Cols 50-51:  airline_code
    // Cols 52-61:  issue_date (YYYY-MM-DD)
    // Cols 62-73:  ticket_amount (right-aligned, 2 decimals)
    // Cols 74-85:  commission_amount
    // Cols 86-97:  tax_amount
    // Cols 98-109: refund_amount
    // Cols 110-113: transaction_type
    // Cols 114-123: issue_sequence
    // Cols 124-128: payment_type
    // Cols 129-131: currency
    // Cols 132-139: billing_period

    if (line.length < 131) continue;

    const ticketNumber = line.slice(0, 13).trim();
    if (!/^\d{13}$/.test(ticketNumber)) continue;

    records.push({
      ticket_number: ticketNumber,
      passenger_name: line.slice(13, 43).trim(),
      origin: line.slice(43, 46).trim(),
      destination: line.slice(46, 49).trim(),
      airline_code: line.slice(49, 51).trim(),
      issue_date: line.slice(51, 61).trim(),
      ticket_amount: line.slice(61, 73).trim(),
      commission_amount: line.slice(73, 85).trim(),
      tax_amount: line.slice(85, 97).trim(),
      refund_amount: line.slice(97, 109).trim() || undefined,
      transaction_type: parseTransactionType(line.slice(109, 113).trim()),
      issue_sequence: line.slice(113, 123).trim() || undefined,
      payment_type: line.slice(123, 128).trim() || undefined,
      currency: line.slice(128, 131).trim() || 'USD',
      billing_period: line.length >= 139 ? line.slice(131, 139).trim() || undefined : undefined,
    });
  }

  return records;
}

export class HOTFileParser {
  private format: HOTFileFormat | undefined;

  constructor(format?: HOTFileFormat) {
    this.format = format;
  }

  parse(content: string): HOTFileRecord[] {
    if (content.trim().length === 0) return [];

    const format = this.format ?? detectFormat(content);

    switch (format) {
      case 'EDI_X12':
        return parseEdiX12(content);
      case 'FIXED_WIDTH':
        return parseFixedWidth(content);
    }
  }

  static detectFormat(content: string): HOTFileFormat {
    return detectFormat(content);
  }
}
