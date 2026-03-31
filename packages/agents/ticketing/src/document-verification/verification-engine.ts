/**
 * Document Verification Engine — APIS validation, passport, visa checks.
 */

import type {
  DocumentVerificationInput,
  DocumentVerificationOutput,
  PassengerDocument,
  PassengerVerificationResult,
  DocumentCheck,
  TravelSegment,
  VerificationSeverity,
  VisaRequirement,
  CountryRegulatoryResolver,
} from './types.js';

const DEFAULT_VALIDITY_MONTHS = 6;

// Basic passport number patterns per nationality (simplified)
const PASSPORT_PATTERNS: Record<string, RegExp> = {
  US: /^[A-Z0-9]{6,9}$/,
  GB: /^[A-Z0-9]{9}$/,
  DE: /^[A-Z0-9]{9,10}$/,
  FR: /^[A-Z0-9]{9}$/,
  JP: /^[A-Z]{2}\d{7}$/,
  AU: /^[A-Z]{1,2}\d{7}$/,
  CA: /^[A-Z]{2}\d{6}$/,
  // Default fallback — most passports are 6-12 alphanumeric chars
};
const DEFAULT_PASSPORT_RE = /^[A-Z0-9]{5,12}$/;

/**
 * Stub implementation of CountryRegulatoryResolver.
 * TODO: [NEEDS DOMAIN INPUT] Replace with Agent 0.7 when built.
 * Returns mock data for common destination pairs.
 */
class StubRegulatoryResolver implements CountryRegulatoryResolver {
  async getVisaRequirements(passport: string, destination: string): Promise<VisaRequirement> {
    // Common visa-free combinations (simplified)
    const visaFree = new Set([
      'US-GB', 'US-DE', 'US-FR', 'US-JP', 'US-AU', 'US-CA',
      'GB-US', 'GB-DE', 'GB-FR', 'GB-JP', 'GB-AU', 'GB-CA',
      'DE-US', 'DE-GB', 'DE-FR', 'DE-JP', 'DE-AU', 'DE-CA',
      'FR-US', 'FR-GB', 'FR-DE', 'FR-JP', 'FR-AU', 'FR-CA',
      'CA-US', 'CA-GB', 'CA-DE', 'CA-FR', 'CA-JP', 'CA-AU',
      'AU-US', 'AU-GB', 'AU-DE', 'AU-FR', 'AU-JP', 'AU-CA',
      'JP-US', 'JP-GB', 'JP-DE', 'JP-FR', 'JP-AU', 'JP-CA',
    ]);

    const key = `${passport}-${destination}`;
    if (visaFree.has(key)) {
      return { required: false, notes: 'Visa-free travel (stub data)' };
    }

    // Default: visa required (conservative)
    return {
      required: true,
      visa_type: 'Tourist',
      notes: 'Visa requirement assumed (stub data — verify with Agent 0.7)',
    };
  }
}

const stubResolver = new StubRegulatoryResolver();

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkNameMatch(pax: PassengerDocument): DocumentCheck {
  const ticketNorm = pax.ticket_name.toUpperCase().trim();
  const passportNorm = pax.passport_name.toUpperCase().trim();

  if (ticketNorm === passportNorm) {
    return { name: 'Name Match', passed: true, severity: 'blocking', message: 'Ticket name matches passport.' };
  }

  // Check for minor differences (middle name, spacing)
  const ticketParts = ticketNorm.split('/');
  const passportParts = passportNorm.split('/');
  if (ticketParts[0] === passportParts[0] && ticketParts[1]?.startsWith(passportParts[1]?.split(' ')[0] ?? '')) {
    return { name: 'Name Match', passed: true, severity: 'advisory', message: 'Ticket name approximately matches passport (minor differences).' };
  }

  return { name: 'Name Match', passed: false, severity: 'blocking', message: `Name mismatch: ticket "${pax.ticket_name}" vs passport "${pax.passport_name}".` };
}

function checkDob(pax: PassengerDocument): DocumentCheck {
  if (!pax.date_of_birth) {
    return { name: 'DOB Present', passed: false, severity: 'blocking', message: 'Date of birth is missing — required for APIS.' };
  }
  // Basic format check
  const dobDate = new Date(pax.date_of_birth);
  if (isNaN(dobDate.getTime())) {
    return { name: 'DOB Present', passed: false, severity: 'blocking', message: `Invalid date of birth format: ${pax.date_of_birth}` };
  }
  return { name: 'DOB Present', passed: true, severity: 'blocking', message: 'Date of birth present and valid.' };
}

function checkPassportFormat(pax: PassengerDocument): DocumentCheck {
  const pattern = PASSPORT_PATTERNS[pax.nationality] ?? DEFAULT_PASSPORT_RE;
  if (pattern.test(pax.passport_number.toUpperCase())) {
    return { name: 'Passport Format', passed: true, severity: 'advisory', message: 'Passport number format is valid.' };
  }
  return {
    name: 'Passport Format',
    passed: false,
    severity: 'advisory',
    message: `Passport number "${pax.passport_number}" may not match expected format for ${pax.nationality} nationality.`,
  };
}

function checkPassportValidity(
  pax: PassengerDocument,
  segments: TravelSegment[],
  validityMonths: number,
): DocumentCheck {
  const expiry = new Date(pax.passport_expiry);
  if (isNaN(expiry.getTime())) {
    return { name: 'Passport Validity', passed: false, severity: 'blocking', message: `Invalid passport expiry date: ${pax.passport_expiry}` };
  }

  // Find latest travel date
  let latestTravel = new Date(0);
  for (const seg of segments) {
    const d = new Date(seg.travel_date);
    if (d > latestTravel) latestTravel = d;
  }

  // Passport must be valid for N months beyond latest travel date
  const requiredValidity = new Date(latestTravel);
  requiredValidity.setMonth(requiredValidity.getMonth() + validityMonths);

  if (expiry >= requiredValidity) {
    return { name: 'Passport Validity', passed: true, severity: 'blocking', message: `Passport valid until ${pax.passport_expiry} — meets ${validityMonths}-month requirement.` };
  }

  return {
    name: 'Passport Validity',
    passed: false,
    severity: 'blocking',
    message: `Passport expires ${pax.passport_expiry} — must be valid until ${requiredValidity.toISOString().slice(0, 10)} (${validityMonths} months beyond travel).`,
  };
}

function checkGender(pax: PassengerDocument): DocumentCheck {
  if (!pax.gender) {
    return { name: 'Gender Present', passed: false, severity: 'advisory', message: 'Gender not specified — may be required for APIS.' };
  }
  return { name: 'Gender Present', passed: true, severity: 'advisory', message: 'Gender present.' };
}

async function checkVisa(
  pax: PassengerDocument,
  segments: TravelSegment[],
  resolver: CountryRegulatoryResolver,
): Promise<DocumentCheck[]> {
  const checks: DocumentCheck[] = [];
  const checkedDestinations = new Set<string>();

  for (const seg of segments) {
    if (checkedDestinations.has(seg.destination_country)) continue;
    checkedDestinations.add(seg.destination_country);

    // TODO: [NEEDS DOMAIN INPUT] Replace stub with Agent 0.7 when built
    const visa = await resolver.getVisaRequirements(pax.nationality, seg.destination_country);

    if (visa.required) {
      checks.push({
        name: `Visa Check (${seg.destination_country})`,
        passed: false,
        severity: 'advisory' as VerificationSeverity,
        message: `Visa may be required for ${pax.nationality} passport holders entering ${seg.destination_country}. ${visa.visa_type ? `Type: ${visa.visa_type}. ` : ''}${visa.notes ?? ''}`,
      });
    } else {
      checks.push({
        name: `Visa Check (${seg.destination_country})`,
        passed: true,
        severity: 'advisory' as VerificationSeverity,
        message: `No visa required for ${pax.nationality} passport holders entering ${seg.destination_country}.`,
      });
    }
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Main verification
// ---------------------------------------------------------------------------

export async function verifyDocuments(
  input: DocumentVerificationInput,
  resolver: CountryRegulatoryResolver = stubResolver,
): Promise<DocumentVerificationOutput> {
  const validityMonths = input.passport_validity_months ?? DEFAULT_VALIDITY_MONTHS;

  const results: PassengerVerificationResult[] = [];
  let blockingFailures = 0;
  let advisoryWarnings = 0;

  for (const pax of input.passengers) {
    const checks: DocumentCheck[] = [
      checkNameMatch(pax),
      checkDob(pax),
      checkPassportFormat(pax),
      checkPassportValidity(pax, input.segments, validityMonths),
      checkGender(pax),
    ];

    const visaChecks = await checkVisa(pax, input.segments, resolver);
    checks.push(...visaChecks);

    const passed = checks.every((c) => c.passed || c.severity !== 'blocking');

    for (const c of checks) {
      if (!c.passed) {
        if (c.severity === 'blocking') blockingFailures++;
        else advisoryWarnings++;
      }
    }

    results.push({
      passenger_name: pax.ticket_name,
      passed,
      checks,
    });
  }

  return {
    results,
    all_passed: blockingFailures === 0,
    blocking_failures: blockingFailures,
    advisory_warnings: advisoryWarnings,
  };
}
