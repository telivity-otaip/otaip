/**
 * @otaip/agents-tmc — Stage 8 TMC & agency operations agents.
 *
 * Re-exports all Stage 8 agent classes.
 */

export { TravelerProfileAgent, VALID_MEAL_CODES } from './traveler-profile/index.js';
export type {
  TravelerProfileInput, TravelerProfileOutput, TravelerProfile,
  SsrInjection, PnrSegmentRef, MealCode, SeatPreference, ProfileOperation,
} from './traveler-profile/index.js';

export { CorporateAccountAgent } from './corporate-account/index.js';
export type {
  CorporateAccountInput, CorporateAccountOutput, CorporateAccount,
  TravelPolicy, NegotiatedFare, BookingValidationResult, PolicyViolation,
  BookingValidationSegment, CabinClass, ViolationSeverity, CorporateOperation,
} from './corporate-account/index.js';

export { MidOfficeAgent } from './mid-office/index.js';
export type {
  MidOfficeInput, MidOfficeOutput,
  MockPnr, PnrCheckResult, PnrIssue,
  PnrSegment, TriggerType, IssueSeverity, IssueCode,
} from './mid-office/index.js';

export { ReportingAgent } from './reporting/index.js';
export type {
  ReportingInput, ReportingOutput,
  Transaction, ReportType, ReportRow, ReportSummary, ReportFilters,
} from './reporting/index.js';

export { DutyCareAgent } from './duty-of-care/index.js';
export type {
  DutyCareInput, DutyCareOutput,
  TravelerItinerary, LocatedTraveler, DestinationRisk,
  RiskLevel, TravelerStatus, DutyCareOperation,
} from './duty-of-care/index.js';
