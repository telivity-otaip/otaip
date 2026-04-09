/**
 * Payment Processing — Unit Tests
 *
 * Agent 3.7: PCI-safe payment instruction builder and recorder.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaymentProcessing } from '../index.js';
import type { PaymentProcessingInput, FormOfPayment } from '../types.js';

let agent: PaymentProcessing;

beforeEach(async () => {
  agent = new PaymentProcessing();
  await agent.initialize();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ccFOP(overrides: Partial<FormOfPayment> = {}): FormOfPayment {
  return {
    type: 'CC_TOKEN',
    cardToken: 'TOK_abc123xyz',
    cardBrand: 'VI',
    expiryMonth: 12,
    expiryYear: 2028,
    cardholderName: 'John Doe',
    ...overrides,
  };
}

function cashFOP(): FormOfPayment {
  return { type: 'BSP_CASH' };
}

function creditFOP(overrides: Partial<FormOfPayment> = {}): FormOfPayment {
  return {
    type: 'AIRLINE_CREDIT',
    creditReference: 'CRED-98765',
    ...overrides,
  };
}

function voucherFOP(overrides: Partial<FormOfPayment> = {}): FormOfPayment {
  return {
    type: 'VOUCHER',
    voucherCode: 'VCH-ABCDE',
    ...overrides,
  };
}

function uatpFOP(overrides: Partial<FormOfPayment> = {}): FormOfPayment {
  return {
    type: 'UATP',
    uatpNumber: '123456789012345',
    expiryMonth: 6,
    expiryYear: 2029,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateFOP — CC_TOKEN
// ---------------------------------------------------------------------------
describe('Payment Processing', () => {
  describe('validateFOP — CC_TOKEN', () => {
    it('validates a valid CC_TOKEN', async () => {
      const result = await agent.execute({
        data: { operation: 'validateFOP', validateFOP: { fop: ccFOP() } },
      });
      expect(result.data.success).toBe(true);
      expect(result.data.validation!.valid).toBe(true);
    });

    it('rejects raw card number (13 digits)', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: ccFOP({ cardToken: '4111111111111' }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.validation!.errorCode).toBe('RAW_CARD_DETECTED');
      expect(result.data.validation!.errorMessage).toContain('Raw card numbers are not permitted');
    });

    it('rejects raw card number (16 digits)', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: ccFOP({ cardToken: '4111111111111111' }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('RAW_CARD_DETECTED');
    });

    it('rejects raw card number (19 digits)', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: ccFOP({ cardToken: '4111111111111111234' }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('RAW_CARD_DETECTED');
    });

    it('accepts alphanumeric token (not raw)', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: ccFOP({ cardToken: 'tok_1234abcd5678' }) },
        },
      });
      expect(result.data.success).toBe(true);
    });

    it('rejects missing cardToken', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: ccFOP({ cardToken: undefined }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('MISSING_REQUIRED_FIELD');
    });

    it('rejects missing cardBrand', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: ccFOP({ cardBrand: undefined }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('MISSING_REQUIRED_FIELD');
    });

    it('rejects invalid cardBrand', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: ccFOP({ cardBrand: 'XX' as 'VI' }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('MISSING_REQUIRED_FIELD');
    });

    it('rejects missing expiry', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: ccFOP({ expiryMonth: undefined, expiryYear: undefined }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('MISSING_REQUIRED_FIELD');
    });

    it('rejects expired card', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: {
            fop: ccFOP({ expiryMonth: 1, expiryYear: 2020 }),
            referenceDate: '2025-06-01T00:00:00Z',
          },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('EXPIRED_CARD');
    });

    it('accepts card expiring in current month', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: {
            fop: ccFOP({ expiryMonth: 6, expiryYear: 2025 }),
            referenceDate: '2025-06-15T00:00:00Z',
          },
        },
      });
      expect(result.data.success).toBe(true);
    });

    it('rejects expiryMonth out of range', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: ccFOP({ expiryMonth: 13 }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('MISSING_REQUIRED_FIELD');
    });
  });

  // ---------------------------------------------------------------------------
  // validateFOP — other types
  // ---------------------------------------------------------------------------
  describe('validateFOP — BSP_CASH', () => {
    it('validates BSP_CASH (no extra fields needed)', async () => {
      const result = await agent.execute({
        data: { operation: 'validateFOP', validateFOP: { fop: cashFOP() } },
      });
      expect(result.data.success).toBe(true);
    });
  });

  describe('validateFOP — AIRLINE_CREDIT', () => {
    it('validates valid airline credit', async () => {
      const result = await agent.execute({
        data: { operation: 'validateFOP', validateFOP: { fop: creditFOP() } },
      });
      expect(result.data.success).toBe(true);
    });

    it('rejects missing creditReference', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: creditFOP({ creditReference: undefined }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('MISSING_REQUIRED_FIELD');
    });
  });

  describe('validateFOP — VOUCHER', () => {
    it('validates valid voucher', async () => {
      const result = await agent.execute({
        data: { operation: 'validateFOP', validateFOP: { fop: voucherFOP() } },
      });
      expect(result.data.success).toBe(true);
    });

    it('rejects missing voucherCode', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: voucherFOP({ voucherCode: undefined }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('MISSING_REQUIRED_FIELD');
    });
  });

  describe('validateFOP — UATP', () => {
    it('validates valid UATP', async () => {
      const result = await agent.execute({
        data: { operation: 'validateFOP', validateFOP: { fop: uatpFOP() } },
      });
      expect(result.data.success).toBe(true);
    });

    it('rejects missing uatpNumber', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: uatpFOP({ uatpNumber: undefined }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('MISSING_REQUIRED_FIELD');
    });

    it('rejects uatpNumber with wrong length', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: uatpFOP({ uatpNumber: '12345' }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('MISSING_REQUIRED_FIELD');
    });

    it('rejects expired UATP', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: {
            fop: uatpFOP({ expiryMonth: 1, expiryYear: 2020 }),
            referenceDate: '2025-06-01T00:00:00Z',
          },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('EXPIRED_CARD');
    });
  });

  describe('validateFOP — invalid type', () => {
    it('rejects unknown FOP type', async () => {
      const result = await agent.execute({
        data: {
          operation: 'validateFOP',
          validateFOP: { fop: { type: 'BITCOIN' as 'CC_TOKEN' } },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('INVALID_FOP_TYPE');
    });
  });

  // ---------------------------------------------------------------------------
  // buildGDSFOPString
  // ---------------------------------------------------------------------------
  describe('buildGDSFOPString', () => {
    it('builds CC_TOKEN GDS string', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildGDSFOPString',
          buildGDSFOPString: {
            fop: ccFOP({ cardToken: 'TOK999', expiryMonth: 3, expiryYear: 2027 }),
          },
        },
      });
      expect(result.data.success).toBe(true);
      expect(result.data.gdsString).toBe('VITOK999/0327');
    });

    it('builds BSP_CASH GDS string', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildGDSFOPString',
          buildGDSFOPString: { fop: cashFOP() },
        },
      });
      expect(result.data.success).toBe(true);
      expect(result.data.gdsString).toBe('CA');
    });

    it('builds AIRLINE_CREDIT GDS string', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildGDSFOPString',
          buildGDSFOPString: { fop: creditFOP({ creditReference: 'REF123' }) },
        },
      });
      expect(result.data.success).toBe(true);
      expect(result.data.gdsString).toBe('RA/REF123');
    });

    it('builds VOUCHER GDS string', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildGDSFOPString',
          buildGDSFOPString: { fop: voucherFOP({ voucherCode: 'V999' }) },
        },
      });
      expect(result.data.success).toBe(true);
      expect(result.data.gdsString).toBe('VU/V999');
    });

    it('builds UATP GDS string', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildGDSFOPString',
          buildGDSFOPString: { fop: uatpFOP({ expiryMonth: 11, expiryYear: 2029 }) },
        },
      });
      expect(result.data.success).toBe(true);
      expect(result.data.gdsString).toBe('TP123456789012345/1129');
    });

    it('rejects invalid FOP in buildGDSFOPString', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildGDSFOPString',
          buildGDSFOPString: { fop: ccFOP({ cardToken: undefined }) },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('MISSING_REQUIRED_FIELD');
    });
  });

  // ---------------------------------------------------------------------------
  // buildPaymentInstruction
  // ---------------------------------------------------------------------------
  describe('buildPaymentInstruction', () => {
    it('builds a payment instruction from valid CC_TOKEN', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildPaymentInstruction',
          buildPaymentInstruction: {
            fop: ccFOP(),
            amount: '1250.50',
            currency: 'USD',
          },
        },
      });
      expect(result.data.success).toBe(true);
      expect(result.data.instruction).toBeDefined();
      expect(result.data.instruction!.amount).toBe('1250.50');
      expect(result.data.instruction!.currency).toBe('USD');
      expect(result.data.instruction!.pciSafe).toBe(true);
      expect(result.data.instruction!.gdsString).toContain('VI');
      expect(result.data.instruction!.instructionId).toMatch(/^PI\d{8}$/);
    });

    it('generates sequential instruction IDs', async () => {
      const r1 = await agent.execute({
        data: {
          operation: 'buildPaymentInstruction',
          buildPaymentInstruction: { fop: cashFOP(), amount: '100.00', currency: 'USD' },
        },
      });
      const r2 = await agent.execute({
        data: {
          operation: 'buildPaymentInstruction',
          buildPaymentInstruction: { fop: cashFOP(), amount: '200.00', currency: 'EUR' },
        },
      });
      expect(r1.data.instruction!.instructionId).toBe('PI00000001');
      expect(r2.data.instruction!.instructionId).toBe('PI00000002');
    });

    it('rejects invalid FOP', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildPaymentInstruction',
          buildPaymentInstruction: {
            fop: ccFOP({ cardToken: '4111111111111111' }),
            amount: '100.00',
            currency: 'USD',
          },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('RAW_CARD_DETECTED');
    });

    it('rejects zero amount', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildPaymentInstruction',
          buildPaymentInstruction: {
            fop: cashFOP(),
            amount: '0.00',
            currency: 'USD',
          },
        },
      });
      expect(result.data.success).toBe(false);
    });

    it('rejects negative amount', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildPaymentInstruction',
          buildPaymentInstruction: {
            fop: cashFOP(),
            amount: '-50.00',
            currency: 'USD',
          },
        },
      });
      expect(result.data.success).toBe(false);
    });

    it('formats amount to 2 decimal places', async () => {
      const result = await agent.execute({
        data: {
          operation: 'buildPaymentInstruction',
          buildPaymentInstruction: {
            fop: cashFOP(),
            amount: '99.9',
            currency: 'GBP',
          },
        },
      });
      expect(result.data.instruction!.amount).toBe('99.90');
    });
  });

  // ---------------------------------------------------------------------------
  // recordPayment
  // ---------------------------------------------------------------------------
  describe('recordPayment', () => {
    it('records a payment transaction', async () => {
      const result = await agent.execute({
        data: {
          operation: 'recordPayment',
          recordPayment: {
            instructionId: 'PI00000001',
            status: 'AUTHORISED',
            amount: '500.00',
            currency: 'USD',
            gatewayReference: 'GW-12345',
            notes: 'Approved',
          },
        },
      });
      expect(result.data.success).toBe(true);
      expect(result.data.record).toBeDefined();
      expect(result.data.record!.transactionId).toMatch(/^TXN\d{8}$/);
      expect(result.data.record!.status).toBe('AUTHORISED');
      expect(result.data.record!.gatewayReference).toBe('GW-12345');
    });

    it('generates sequential transaction IDs', async () => {
      const r1 = await agent.execute({
        data: {
          operation: 'recordPayment',
          recordPayment: {
            instructionId: 'PI00000001',
            status: 'AUTHORISED',
            amount: '100.00',
            currency: 'USD',
          },
        },
      });
      const r2 = await agent.execute({
        data: {
          operation: 'recordPayment',
          recordPayment: {
            instructionId: 'PI00000002',
            status: 'DECLINED',
            amount: '200.00',
            currency: 'EUR',
          },
        },
      });
      expect(r1.data.record!.transactionId).toBe('TXN00000001');
      expect(r2.data.record!.transactionId).toBe('TXN00000002');
    });

    it('records DECLINED status', async () => {
      const result = await agent.execute({
        data: {
          operation: 'recordPayment',
          recordPayment: {
            instructionId: 'PI00000001',
            status: 'DECLINED',
            amount: '100.00',
            currency: 'USD',
          },
        },
      });
      expect(result.data.record!.status).toBe('DECLINED');
    });

    it('records REFUNDED status', async () => {
      const result = await agent.execute({
        data: {
          operation: 'recordPayment',
          recordPayment: {
            instructionId: 'PI00000001',
            status: 'REFUNDED',
            amount: '100.00',
            currency: 'USD',
          },
        },
      });
      expect(result.data.record!.status).toBe('REFUNDED');
    });

    it('formats amount to 2 decimals', async () => {
      const result = await agent.execute({
        data: {
          operation: 'recordPayment',
          recordPayment: {
            instructionId: 'PI00000001',
            status: 'SETTLED',
            amount: '99.9',
            currency: 'GBP',
          },
        },
      });
      expect(result.data.record!.amount).toBe('99.90');
    });
  });

  // ---------------------------------------------------------------------------
  // getPaymentRecord
  // ---------------------------------------------------------------------------
  describe('getPaymentRecord', () => {
    it('retrieves a recorded payment', async () => {
      const createResult = await agent.execute({
        data: {
          operation: 'recordPayment',
          recordPayment: {
            instructionId: 'PI00000001',
            status: 'AUTHORISED',
            amount: '500.00',
            currency: 'USD',
          },
        },
      });
      const txnId = createResult.data.record!.transactionId;
      const getResult = await agent.execute({
        data: {
          operation: 'getPaymentRecord',
          getPaymentRecord: { transactionId: txnId },
        },
      });
      expect(getResult.data.success).toBe(true);
      expect(getResult.data.record!.transactionId).toBe(txnId);
    });

    it('returns TRANSACTION_NOT_FOUND for missing record', async () => {
      const result = await agent.execute({
        data: {
          operation: 'getPaymentRecord',
          getPaymentRecord: { transactionId: 'TXN99999999' },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('TRANSACTION_NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // Input validation
  // ---------------------------------------------------------------------------
  describe('Input validation', () => {
    it('rejects unknown operation', async () => {
      await expect(
        agent.execute({ data: { operation: 'unknown' as 'validateFOP' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects validateFOP without data', async () => {
      await expect(agent.execute({ data: { operation: 'validateFOP' } })).rejects.toThrow(
        'Invalid input',
      );
    });

    it('rejects buildPaymentInstruction without amount', async () => {
      await expect(
        agent.execute({
          data: {
            operation: 'buildPaymentInstruction',
            buildPaymentInstruction: {
              fop: cashFOP(),
              amount: '',
              currency: 'USD',
            },
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects recordPayment with invalid status', async () => {
      await expect(
        agent.execute({
          data: {
            operation: 'recordPayment',
            recordPayment: {
              instructionId: 'PI00000001',
              status: 'UNKNOWN' as 'AUTHORISED',
              amount: '100.00',
              currency: 'USD',
            },
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects getPaymentRecord without transactionId', async () => {
      await expect(
        agent.execute({
          data: {
            operation: 'getPaymentRecord',
            getPaymentRecord: { transactionId: '' },
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects buildGDSFOPString without data', async () => {
      await expect(agent.execute({ data: { operation: 'buildGDSFOPString' } })).rejects.toThrow(
        'Invalid input',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Agent interface compliance
  // ---------------------------------------------------------------------------
  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('3.7');
      expect(agent.name).toBe('Payment Processing');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy after init', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('reports unhealthy before init', async () => {
      const uninit = new PaymentProcessing();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });

    it('throws when not initialized', async () => {
      const uninit = new PaymentProcessing();
      await expect(
        uninit.execute({
          data: { operation: 'validateFOP', validateFOP: { fop: cashFOP() } },
        }),
      ).rejects.toThrow('not been initialized');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({
        data: { operation: 'validateFOP', validateFOP: { fop: cashFOP() } },
      });
      expect(result.metadata!['agent_id']).toBe('3.7');
      expect(result.metadata!['operation']).toBe('validateFOP');
    });

    it('destroy clears state', async () => {
      await agent.execute({
        data: {
          operation: 'recordPayment',
          recordPayment: {
            instructionId: 'PI00000001',
            status: 'AUTHORISED',
            amount: '100.00',
            currency: 'USD',
          },
        },
      });
      agent.destroy();
      await expect(
        agent.execute({
          data: { operation: 'validateFOP', validateFOP: { fop: cashFOP() } },
        }),
      ).rejects.toThrow('not been initialized');
    });

    it('re-initializes cleanly after destroy', async () => {
      await agent.execute({
        data: {
          operation: 'recordPayment',
          recordPayment: {
            instructionId: 'PI00000001',
            status: 'AUTHORISED',
            amount: '100.00',
            currency: 'USD',
          },
        },
      });
      agent.destroy();
      await agent.initialize();
      const result = await agent.execute({
        data: {
          operation: 'getPaymentRecord',
          getPaymentRecord: { transactionId: 'TXN00000001' },
        },
      });
      expect(result.data.success).toBe(false);
      expect(result.data.errorCode).toBe('TRANSACTION_NOT_FOUND');
    });
  });
});
