/**
 * Country Regulatory Resolver — Types
 *
 * Agent 0.7: APIS requirements, visa requirements, restriction levels.
 */

export type RegulatoryOperation = 'getAPISRequirements' | 'getVisaRequirement' | 'getRestrictionLevel';

export type APISField =
  | 'passport_number' | 'nationality' | 'dob' | 'gender'
  | 'expiry_date' | 'given_name' | 'surname' | 'country_of_birth'
  | 'place_of_birth' | 'resident_address' | 'visa_number';

export type VisaRequirementType =
  | 'visa_free' | 'visa_on_arrival' | 'eta_required' | 'visa_required' | 'not_permitted';

export type RestrictionLevel = 1 | 2 | 3 | 4;

export interface APISRequirements {
  countryCode: string;
  requiresAPIS: boolean;
  requiredFields: APISField[];
  advanceSubmissionHours: number;
  notes: string;
}

export interface VisaRequirement {
  nationality: string;
  destination: string;
  requirement: VisaRequirementType;
  maxStayDays?: number;
  notes: string;
}

export interface RestrictionInfo {
  countryCode: string;
  level: RestrictionLevel;
  lastUpdated: string;
  summary: string;
}

export interface CountryRegulatoryInput {
  operation: RegulatoryOperation;
  countryCode?: string;
  nationalityCode?: string;
  destinationCode?: string;
}

export interface CountryRegulatoryOutput {
  apis?: APISRequirements;
  visa?: VisaRequirement;
  restriction?: RestrictionInfo;
}
