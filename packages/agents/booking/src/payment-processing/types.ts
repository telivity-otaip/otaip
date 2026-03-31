/**
 * Payment Processing — Types
 *
 * Agent 3.7: PCI-safe payment instruction builder and recorder.
 */

export type FOPType =
  | 'CC_TOKEN'
  | 'BSP_CASH'
  | 'AIRLINE_CREDIT'
  | 'VOUCHER'
  | 'UATP';

export type CardBrand = 'VI' | 'CA' | 'AX' | 'DC' | 'TP' | 'UP';

export type PaymentOperationType =
  | 'validateFOP'
  | 'buildPaymentInstruction'
  | 'recordPayment'
  | 'getPaymentRecord'
  | 'buildGDSFOPString';

export type PaymentRecordStatus =
  | 'AUTHORISED'
  | 'DECLINED'
  | 'ERROR'
  | 'SETTLED'
  | 'REFUNDED';

export type PaymentErrorCode =
  | 'INVALID_FOP_TYPE'
  | 'RAW_CARD_DETECTED'
  | 'EXPIRED_CARD'
  | 'MISSING_REQUIRED_FIELD'
  | 'TRANSACTION_NOT_FOUND';

export interface FormOfPayment {
  /** Form-of-payment type */
  type: FOPType;
  /** Tokenised card number (PCI-safe) */
  cardToken?: string;
  /** Card brand code */
  cardBrand?: CardBrand;
  /** Card expiry month (1-12) */
  expiryMonth?: number;
  /** Card expiry year (4-digit) */
  expiryYear?: number;
  /** Cardholder name */
  cardholderName?: string;
  /** Voucher code */
  voucherCode?: string;
  /** Airline credit reference */
  creditReference?: string;
  /** UATP account number */
  uatpNumber?: string;
}

export interface PaymentInstruction {
  /** Unique instruction ID */
  instructionId: string;
  /** FOP type */
  type: FOPType;
  /** Payment amount (decimal string) */
  amount: string;
  /** Currency code */
  currency: string;
  /** GDS-formatted FOP string */
  gdsString: string;
  /** Always true — confirms no raw card numbers present */
  pciSafe: true;
  /** Created timestamp (ISO) */
  createdAt: string;
}

export interface PaymentRecord {
  /** Transaction ID */
  transactionId: string;
  /** Related instruction ID */
  instructionId: string;
  /** Transaction status */
  status: PaymentRecordStatus;
  /** Amount (decimal string) */
  amount: string;
  /** Currency code */
  currency: string;
  /** Timestamp of recording (ISO) */
  recordedAt: string;
  /** External gateway reference */
  gatewayReference?: string;
  /** Freetext notes */
  notes?: string;
}

export interface ValidateFOPData {
  fop: FormOfPayment;
  /** Reference date for expiry check (ISO) — defaults to now */
  referenceDate?: string;
}

export interface BuildPaymentInstructionData {
  fop: FormOfPayment;
  amount: string;
  currency: string;
  /** Reference date for expiry check (ISO) — defaults to now */
  referenceDate?: string;
}

export interface RecordPaymentData {
  instructionId: string;
  status: PaymentRecordStatus;
  amount: string;
  currency: string;
  gatewayReference?: string;
  notes?: string;
}

export interface GetPaymentRecordData {
  transactionId: string;
}

export interface BuildGDSFOPStringData {
  fop: FormOfPayment;
  /** Reference date for expiry check (ISO) — defaults to now */
  referenceDate?: string;
}

export interface FOPValidationResult {
  valid: boolean;
  errorCode?: PaymentErrorCode;
  errorMessage?: string;
}

export interface PaymentProcessingInput {
  operation: PaymentOperationType;
  validateFOP?: ValidateFOPData;
  buildPaymentInstruction?: BuildPaymentInstructionData;
  recordPayment?: RecordPaymentData;
  getPaymentRecord?: GetPaymentRecordData;
  buildGDSFOPString?: BuildGDSFOPStringData;
}

export interface PaymentProcessingOutput {
  /** Operation performed */
  operation: PaymentOperationType;
  /** Whether the operation succeeded */
  success: boolean;
  /** FOP validation result (for validateFOP) */
  validation?: FOPValidationResult;
  /** Payment instruction (for buildPaymentInstruction) */
  instruction?: PaymentInstruction;
  /** Payment record (for recordPayment / getPaymentRecord) */
  record?: PaymentRecord;
  /** GDS FOP string (for buildGDSFOPString) */
  gdsString?: string;
  /** Error code */
  errorCode?: PaymentErrorCode;
  /** Error message */
  errorMessage?: string;
}
