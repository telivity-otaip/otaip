/**
 * Payment Processing — Agent 3.7
 *
 * PCI-safe payment instruction builder and transaction recorder.
 * Validates forms of payment, builds GDS FOP strings, and records
 * payment transactions — never handles raw card numbers.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import Decimal from 'decimal.js';
import type {
  PaymentProcessingInput,
  PaymentProcessingOutput,
  FormOfPayment,
  PaymentInstruction,
  PaymentRecord,
  FOPValidationResult,
  ValidateFOPData,
  BuildPaymentInstructionData,
  RecordPaymentData,
  GetPaymentRecordData,
  BuildGDSFOPStringData,
} from './types.js';

const VALID_OPERATIONS = new Set([
  'validateFOP',
  'buildPaymentInstruction',
  'recordPayment',
  'getPaymentRecord',
  'buildGDSFOPString',
]);

const VALID_FOP_TYPES = new Set(['CC_TOKEN', 'BSP_CASH', 'AIRLINE_CREDIT', 'VOUCHER', 'UATP']);
const VALID_CARD_BRANDS = new Set(['VI', 'CA', 'AX', 'DC', 'TP', 'UP']);
const VALID_STATUSES = new Set(['AUTHORISED', 'DECLINED', 'ERROR', 'SETTLED', 'REFUNDED']);

const RAW_CARD_RE = /^[0-9]{13,19}$/;
const UATP_RE = /^[0-9]{15}$/;

export class PaymentProcessing
  implements Agent<PaymentProcessingInput, PaymentProcessingOutput>
{
  readonly id = '3.7';
  readonly name = 'Payment Processing';
  readonly version = '0.1.0';

  private initialized = false;
  private instructions: Map<string, PaymentInstruction> = new Map();
  private records: Map<string, PaymentRecord> = new Map();
  private instructionCounter = 0;
  private transactionCounter = 0;

  async initialize(): Promise<void> {
    this.instructions.clear();
    this.records.clear();
    this.instructionCounter = 0;
    this.transactionCounter = 0;
    this.initialized = true;
  }

  async execute(
    input: AgentInput<PaymentProcessingInput>,
  ): Promise<AgentOutput<PaymentProcessingOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const { operation } = input.data;
    let result: PaymentProcessingOutput;

    switch (operation) {
      case 'validateFOP':
        result = this.handleValidateFOP(input.data.validateFOP!);
        break;
      case 'buildPaymentInstruction':
        result = this.handleBuildInstruction(input.data.buildPaymentInstruction!);
        break;
      case 'recordPayment':
        result = this.handleRecordPayment(input.data.recordPayment!);
        break;
      case 'getPaymentRecord':
        result = this.handleGetPaymentRecord(input.data.getPaymentRecord!);
        break;
      case 'buildGDSFOPString':
        result = this.handleBuildGDSFOPString(input.data.buildGDSFOPString!);
        break;
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Unknown operation.');
    }

    const warnings: string[] = [];
    if (!result.success && result.errorMessage) {
      warnings.push(result.errorMessage);
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation,
        success: result.success,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.instructions.clear();
    this.records.clear();
    this.instructionCounter = 0;
    this.transactionCounter = 0;
    this.initialized = false;
  }

  // ---------------------------------------------------------------------------
  // FOP validation logic
  // ---------------------------------------------------------------------------

  private validateFOP(fop: FormOfPayment, referenceDate?: string): FOPValidationResult {
    if (!fop.type || !VALID_FOP_TYPES.has(fop.type)) {
      return {
        valid: false,
        errorCode: 'INVALID_FOP_TYPE',
        errorMessage: `Invalid FOP type: ${fop.type ?? 'missing'}. Must be one of: ${[...VALID_FOP_TYPES].join(', ')}`,
      };
    }

    switch (fop.type) {
      case 'CC_TOKEN':
        return this.validateCCToken(fop, referenceDate);
      case 'BSP_CASH':
        return { valid: true };
      case 'AIRLINE_CREDIT':
        return this.validateAirlineCredit(fop);
      case 'VOUCHER':
        return this.validateVoucher(fop);
      case 'UATP':
        return this.validateUATP(fop, referenceDate);
    }
  }

  private validateCCToken(fop: FormOfPayment, referenceDate?: string): FOPValidationResult {
    if (!fop.cardToken) {
      return {
        valid: false,
        errorCode: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'CC_TOKEN requires cardToken.',
      };
    }

    if (RAW_CARD_RE.test(fop.cardToken)) {
      return {
        valid: false,
        errorCode: 'RAW_CARD_DETECTED',
        errorMessage: 'Raw card numbers are not permitted. Use a PCI-compliant token.',
      };
    }

    if (!fop.cardBrand || !VALID_CARD_BRANDS.has(fop.cardBrand)) {
      return {
        valid: false,
        errorCode: 'MISSING_REQUIRED_FIELD',
        errorMessage: `CC_TOKEN requires a valid cardBrand. Got: ${fop.cardBrand ?? 'missing'}`,
      };
    }

    if (fop.expiryMonth == null || fop.expiryYear == null) {
      return {
        valid: false,
        errorCode: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'CC_TOKEN requires expiryMonth and expiryYear.',
      };
    }

    if (fop.expiryMonth < 1 || fop.expiryMonth > 12) {
      return {
        valid: false,
        errorCode: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'expiryMonth must be between 1 and 12.',
      };
    }

    if (this.isExpired(fop.expiryMonth, fop.expiryYear, referenceDate)) {
      return {
        valid: false,
        errorCode: 'EXPIRED_CARD',
        errorMessage: `Card expired: ${String(fop.expiryMonth).padStart(2, '0')}/${fop.expiryYear}.`,
      };
    }

    return { valid: true };
  }

  private validateAirlineCredit(fop: FormOfPayment): FOPValidationResult {
    if (!fop.creditReference) {
      return {
        valid: false,
        errorCode: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'AIRLINE_CREDIT requires creditReference.',
      };
    }
    return { valid: true };
  }

  private validateVoucher(fop: FormOfPayment): FOPValidationResult {
    if (!fop.voucherCode) {
      return {
        valid: false,
        errorCode: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'VOUCHER requires voucherCode.',
      };
    }
    return { valid: true };
  }

  private validateUATP(fop: FormOfPayment, referenceDate?: string): FOPValidationResult {
    if (!fop.uatpNumber) {
      return {
        valid: false,
        errorCode: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'UATP requires uatpNumber.',
      };
    }
    if (!UATP_RE.test(fop.uatpNumber)) {
      return {
        valid: false,
        errorCode: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'UATP uatpNumber must be exactly 15 digits.',
      };
    }
    if (fop.expiryMonth != null && fop.expiryYear != null) {
      if (this.isExpired(fop.expiryMonth, fop.expiryYear, referenceDate)) {
        return {
          valid: false,
          errorCode: 'EXPIRED_CARD',
          errorMessage: `UATP expired: ${String(fop.expiryMonth).padStart(2, '0')}/${fop.expiryYear}.`,
        };
      }
    }
    return { valid: true };
  }

  private isExpired(month: number, year: number, referenceDate?: string): boolean {
    const ref = referenceDate ? new Date(referenceDate) : new Date();
    const refYear = ref.getUTCFullYear();
    const refMonth = ref.getUTCMonth() + 1; // 1-based
    if (year < refYear) return true;
    if (year === refYear && month < refMonth) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // GDS FOP string builder
  // ---------------------------------------------------------------------------

  private buildGDSString(fop: FormOfPayment): string {
    const mmyy = (fop.expiryMonth != null && fop.expiryYear != null)
      ? `${String(fop.expiryMonth).padStart(2, '0')}${String(fop.expiryYear).slice(-2)}`
      : '';

    switch (fop.type) {
      case 'CC_TOKEN':
        return `${fop.cardBrand!}${fop.cardToken!}/${mmyy}`;
      case 'BSP_CASH':
        return 'CA';
      case 'AIRLINE_CREDIT':
        return `RA/${fop.creditReference!}`;
      case 'VOUCHER':
        return `VU/${fop.voucherCode!}`;
      case 'UATP':
        return `TP${fop.uatpNumber!}/${mmyy}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Operation handlers
  // ---------------------------------------------------------------------------

  private handleValidateFOP(data: ValidateFOPData): PaymentProcessingOutput {
    const validation = this.validateFOP(data.fop, data.referenceDate);
    return {
      operation: 'validateFOP',
      success: validation.valid,
      validation,
      errorCode: validation.errorCode,
      errorMessage: validation.errorMessage,
    };
  }

  private handleBuildInstruction(data: BuildPaymentInstructionData): PaymentProcessingOutput {
    const validation = this.validateFOP(data.fop, data.referenceDate);
    if (!validation.valid) {
      return {
        operation: 'buildPaymentInstruction',
        success: false,
        validation,
        errorCode: validation.errorCode,
        errorMessage: validation.errorMessage,
      };
    }

    // Validate amount
    let amount: Decimal;
    try {
      amount = new Decimal(data.amount);
      if (amount.isNegative() || amount.isZero()) {
        return {
          operation: 'buildPaymentInstruction',
          success: false,
          errorCode: 'MISSING_REQUIRED_FIELD',
          errorMessage: 'Amount must be a positive number.',
        };
      }
    } catch {
      return {
        operation: 'buildPaymentInstruction',
        success: false,
        errorCode: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'Amount must be a valid decimal number.',
      };
    }

    this.instructionCounter++;
    const instructionId = `PI${String(this.instructionCounter).padStart(8, '0')}`;
    const gdsString = this.buildGDSString(data.fop);

    const instruction: PaymentInstruction = {
      instructionId,
      type: data.fop.type,
      amount: amount.toFixed(2),
      currency: data.currency,
      gdsString,
      pciSafe: true,
      createdAt: new Date().toISOString(),
    };

    this.instructions.set(instructionId, instruction);

    return {
      operation: 'buildPaymentInstruction',
      success: true,
      instruction: { ...instruction },
    };
  }

  private handleRecordPayment(data: RecordPaymentData): PaymentProcessingOutput {
    this.transactionCounter++;
    const transactionId = `TXN${String(this.transactionCounter).padStart(8, '0')}`;

    let amount: Decimal;
    try {
      amount = new Decimal(data.amount);
    } catch {
      return {
        operation: 'recordPayment',
        success: false,
        errorCode: 'MISSING_REQUIRED_FIELD',
        errorMessage: 'Amount must be a valid decimal number.',
      };
    }

    const record: PaymentRecord = {
      transactionId,
      instructionId: data.instructionId,
      status: data.status,
      amount: amount.toFixed(2),
      currency: data.currency,
      recordedAt: new Date().toISOString(),
      gatewayReference: data.gatewayReference,
      notes: data.notes,
    };

    this.records.set(transactionId, record);

    return {
      operation: 'recordPayment',
      success: true,
      record: { ...record },
    };
  }

  private handleGetPaymentRecord(data: GetPaymentRecordData): PaymentProcessingOutput {
    const record = this.records.get(data.transactionId);
    if (!record) {
      return {
        operation: 'getPaymentRecord',
        success: false,
        errorCode: 'TRANSACTION_NOT_FOUND',
        errorMessage: `Transaction ${data.transactionId} not found.`,
      };
    }
    return {
      operation: 'getPaymentRecord',
      success: true,
      record: { ...record },
    };
  }

  private handleBuildGDSFOPString(data: BuildGDSFOPStringData): PaymentProcessingOutput {
    const validation = this.validateFOP(data.fop, data.referenceDate);
    if (!validation.valid) {
      return {
        operation: 'buildGDSFOPString',
        success: false,
        validation,
        errorCode: validation.errorCode,
        errorMessage: validation.errorMessage,
      };
    }
    const gdsString = this.buildGDSString(data.fop);
    return {
      operation: 'buildGDSFOPString',
      success: true,
      gdsString,
    };
  }

  // ---------------------------------------------------------------------------
  // Input validation (structural)
  // ---------------------------------------------------------------------------

  private validateInput(data: PaymentProcessingInput): void {
    if (!data.operation || !VALID_OPERATIONS.has(data.operation)) {
      throw new AgentInputValidationError(
        this.id,
        'operation',
        `Must be one of: ${[...VALID_OPERATIONS].join(', ')}`,
      );
    }

    switch (data.operation) {
      case 'validateFOP':
        if (!data.validateFOP) {
          throw new AgentInputValidationError(this.id, 'validateFOP', 'validateFOP data is required.');
        }
        if (!data.validateFOP.fop) {
          throw new AgentInputValidationError(this.id, 'fop', 'FormOfPayment object is required.');
        }
        break;
      case 'buildPaymentInstruction':
        if (!data.buildPaymentInstruction) {
          throw new AgentInputValidationError(this.id, 'buildPaymentInstruction', 'buildPaymentInstruction data is required.');
        }
        if (!data.buildPaymentInstruction.fop) {
          throw new AgentInputValidationError(this.id, 'fop', 'FormOfPayment object is required.');
        }
        if (!data.buildPaymentInstruction.amount) {
          throw new AgentInputValidationError(this.id, 'amount', 'Amount is required.');
        }
        if (!data.buildPaymentInstruction.currency) {
          throw new AgentInputValidationError(this.id, 'currency', 'Currency is required.');
        }
        break;
      case 'recordPayment':
        if (!data.recordPayment) {
          throw new AgentInputValidationError(this.id, 'recordPayment', 'recordPayment data is required.');
        }
        if (!data.recordPayment.instructionId) {
          throw new AgentInputValidationError(this.id, 'instructionId', 'Instruction ID is required.');
        }
        if (!data.recordPayment.status || !VALID_STATUSES.has(data.recordPayment.status)) {
          throw new AgentInputValidationError(this.id, 'status', `Status must be one of: ${[...VALID_STATUSES].join(', ')}`);
        }
        if (!data.recordPayment.amount) {
          throw new AgentInputValidationError(this.id, 'amount', 'Amount is required.');
        }
        if (!data.recordPayment.currency) {
          throw new AgentInputValidationError(this.id, 'currency', 'Currency is required.');
        }
        break;
      case 'getPaymentRecord':
        if (!data.getPaymentRecord) {
          throw new AgentInputValidationError(this.id, 'getPaymentRecord', 'getPaymentRecord data is required.');
        }
        if (!data.getPaymentRecord.transactionId) {
          throw new AgentInputValidationError(this.id, 'transactionId', 'Transaction ID is required.');
        }
        break;
      case 'buildGDSFOPString':
        if (!data.buildGDSFOPString) {
          throw new AgentInputValidationError(this.id, 'buildGDSFOPString', 'buildGDSFOPString data is required.');
        }
        if (!data.buildGDSFOPString.fop) {
          throw new AgentInputValidationError(this.id, 'fop', 'FormOfPayment object is required.');
        }
        break;
    }
  }
}

export type {
  PaymentProcessingInput,
  PaymentProcessingOutput,
  FormOfPayment,
  FOPType,
  CardBrand,
  PaymentOperationType,
  PaymentRecordStatus,
  PaymentErrorCode,
  PaymentInstruction,
  PaymentRecord,
  FOPValidationResult,
  ValidateFOPData,
  BuildPaymentInstructionData,
  RecordPaymentData,
  GetPaymentRecordData,
  BuildGDSFOPStringData,
} from './types.js';
