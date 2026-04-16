/**
 * @otaip/agents-ticketing — Stage 4 ticketing & fulfillment agents.
 *
 * Re-exports all Stage 4 agent classes.
 */

export { TicketIssuance } from './ticket-issuance/index.js';
export type {
  TicketIssuanceInput,
  TicketIssuanceOutput,
  TicketRecord,
  TicketSegment,
  CouponStatus,
  FormOfPayment,
  FormOfPaymentType,
  TaxBreakdownItem,
  CommissionData,
  BspReportingFields,
} from './ticket-issuance/index.js';
export { ticketIssuanceContract } from './ticket-issuance/contract.js';
export {
  ticketIssuanceInputSchema,
  ticketIssuanceOutputSchema,
} from './ticket-issuance/schema.js';

export { EmdManagement, RFIC_DESCRIPTIONS } from './emd-management/index.js';
export type {
  EmdManagementInput,
  EmdManagementOutput,
  EmdRecord,
  EmdCoupon,
  EmdType,
  RficCode,
} from './emd-management/index.js';

export { VoidAgent } from './void-agent/index.js';
export type {
  VoidAgentInput,
  VoidAgentOutput,
  VoidResult,
  VoidRejectionReason,
  VoidSettlementSystem,
  VoidCouponInput,
  CarrierVoidWindow,
} from './void-agent/index.js';

export { ItineraryDelivery } from './itinerary-delivery/index.js';
export type {
  ItineraryDeliveryInput,
  ItineraryDeliveryOutput,
  ItineraryFlight,
  ItineraryPassenger,
  ContactDetails,
  RenderedContent,
  DeliveryChannel,
} from './itinerary-delivery/index.js';

export { DocumentVerification } from './document-verification/index.js';
export type {
  DocumentVerificationInput,
  DocumentVerificationOutput,
  PassengerDocument,
  PassengerVerificationResult,
  DocumentCheck,
  TravelSegment,
  VerificationSeverity,
  VisaRequirement,
  CountryRegulatoryResolver,
} from './document-verification/index.js';
