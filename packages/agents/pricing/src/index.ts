/**
 * @otaip/agents-pricing — Stage 2 pricing agents.
 *
 * Re-exports all Stage 2 agent classes.
 */

export { FareRuleAgent } from './fare-rule-agent/index.js';
export type {
  FareRuleInput,
  FareRuleOutput,
  FareRuleResult,
  FareRuleCategory,
  PenaltyRule,
  AdvancePurchaseRule,
  MinimumStayRule,
  MaximumStayRule,
  SeasonalityRule,
  BlackoutPeriod,
  MoneyAmount,
} from './fare-rule-agent/index.js';

export { FareConstruction } from './fare-construction/index.js';
export type {
  FareConstructionInput,
  FareConstructionOutput,
  FareComponent,
  JourneyType,
  MileageCheck,
  MileageSurcharge,
  HipCheck,
  BhcCheck,
  CtmCheck,
  AuditStep,
} from './fare-construction/index.js';

export { TaxCalculation } from './tax-calculation/index.js';
export type {
  TaxCalculationInput,
  TaxCalculationOutput,
  TaxSegment,
  AppliedTax,
  TaxBreakdown,
  CountryTaxSummary,
  CabinClass,
  PassengerType,
  ExemptionType,
} from './tax-calculation/index.js';
