export type AgreementType = 'OVERRIDE' | 'INCENTIVE' | 'BACKEND' | 'NET_FARE' | 'STANDARD';
export type CommissionBasis = 'PERCENT_OF_FARE' | 'FLAT_PER_TICKET' | 'FLAT_PER_SEGMENT';
export type ValidationStatus = 'MATCH' | 'OVERSTATED' | 'UNDERSTATED' | 'NO_AGREEMENT';
export type CommissionOperation = 'registerAgreement' | 'getRate' | 'validateCommission' | 'calculateIncentive' | 'listAgreements';

export interface CommissionAgreement {
  agreementId: string; agentId: string; airline: string; type: AgreementType; rate: string;
  basis: CommissionBasis; fareBasisPatterns?: string[]; effectiveFrom: string; effectiveTo?: string;
  minimumTickets?: number; currencyCode: string;
}

export interface CommissionRate { agreementId: string; rate: string; basis: CommissionBasis; type: AgreementType; }

export interface CommissionValidationResult { valid: boolean; expectedRate: string; claimedRate: string; variance: string; variancePercent: string; status: ValidationStatus; }

export interface IncentiveResult { agentId: string; airline: string; period: { from: string; to: string }; ticketCount: number; totalFareAmount: string; incentiveEarned: string; currency: string; thresholdMet: boolean; notes: string; }

export interface CommissionManagementInput {
  operation: CommissionOperation;
  agreement?: Omit<CommissionAgreement, 'agreementId'>;
  airline?: string; fareBasis?: string; agentId?: string; ticketDate?: string;
  ticketNumber?: string; claimedCommission?: string; fareAmount?: string;
  period?: { from: string; to: string };
  tickets?: Array<{ fareAmount: string; ticketDate: string }>;
  filter?: { airline?: string; agentId?: string; type?: AgreementType };
}

export interface CommissionManagementOutput {
  agreement?: CommissionAgreement; agreements?: CommissionAgreement[];
  rate?: CommissionRate; validation?: CommissionValidationResult;
  incentive?: IncentiveResult; message?: string;
}
