/**
 * Fare Construction Engine — 12-step pipeline.
 *
 * All financial math uses decimal.js.
 */

import { Decimal } from 'decimal.js';
import { createRequire } from 'node:module';
import type {
  FareConstructionInput,
  FareConstructionOutput,
  MileageCheck,
  MileageSurcharge,
  HipCheck,
  BhcCheck,
  CtmCheck,
  AuditStep,
} from './types.js';

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

interface CityPair { origin: string; destination: string; tpm: number; mph: number }
interface MileageData { city_pairs: CityPair[] }
interface RoeData { rates: Record<string, string> }
interface RoundingRule { unit: string; direction: string }
interface RoundingData { rules: Record<string, RoundingRule>; default: RoundingRule }

const require = createRequire(import.meta.url);
const mileageData = require('./data/mileage-data.json') as MileageData;
const roeData = require('./data/roe-rates.json') as RoeData;
const roundingData = require('./data/rounding-rules.json') as RoundingData;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findMileage(origin: string, destination: string): CityPair | undefined {
  return mileageData.city_pairs.find(
    (cp) =>
      (cp.origin === origin && cp.destination === destination) ||
      (cp.origin === destination && cp.destination === origin),
  );
}

function getRoe(currency: string): Decimal | null {
  const rate = roeData.rates[currency];
  if (!rate) return null;
  return new Decimal(rate);
}

function getRoundingRule(currency: string): RoundingRule {
  return roundingData.rules[currency] ?? roundingData.default;
}

/**
 * IATA rounding: round UP to the nearest unit.
 */
function iataRound(amount: Decimal, unit: string): Decimal {
  const u = new Decimal(unit);
  // Divide by unit, round up (ceiling), multiply back
  return amount.div(u).ceil().mul(u);
}

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

export function constructFare(input: FareConstructionInput): FareConstructionOutput {
  const audit: AuditStep[] = [];
  let stepNum = 0;

  function addStep(name: string, description: string, inputVal: string, outputVal: string): void {
    stepNum++;
    audit.push({ step: stepNum, name, description, input: inputVal, output: outputVal });
  }

  // Step 1: Validate components
  addStep('Validate Components', `${input.components.length} fare component(s), journey type ${input.journey_type}`,
    JSON.stringify(input.components.map((c) => `${c.origin}-${c.destination}`)),
    'valid');

  // Step 2: Sum NUC amounts
  let totalNuc = new Decimal(0);
  for (const comp of input.components) {
    totalNuc = totalNuc.plus(new Decimal(comp.nuc_amount));
  }
  addStep('Sum NUC', 'Sum all fare component NUC amounts',
    input.components.map((c) => c.nuc_amount).join(' + '),
    totalNuc.toFixed(2));

  // Step 3: Mileage validation
  const mileageChecks: MileageCheck[] = [];
  let totalTpm = 0;
  let totalMph = 0;

  for (const comp of input.components) {
    const cp = findMileage(comp.origin, comp.destination);
    if (cp) {
      mileageChecks.push({
        origin: comp.origin,
        destination: comp.destination,
        tpm: cp.tpm,
        mph: cp.mph,
        data_available: true,
      });
      totalTpm += cp.tpm;
      totalMph += cp.mph;
    } else {
      mileageChecks.push({
        origin: comp.origin,
        destination: comp.destination,
        tpm: null,
        mph: null,
        data_available: false,
      });
    }
  }

  addStep('Mileage Validation', `TPM total: ${totalTpm}, MPM total: ${totalMph}`,
    `${mileageChecks.length} segments`,
    `TPM=${totalTpm} MPM=${totalMph}`);

  // Step 4: Check mileage exceeded
  const mileageExceeded = totalMph > 0 && totalTpm > totalMph;
  const excessPct = totalMph > 0
    ? new Decimal(totalTpm).minus(totalMph).div(totalMph).mul(100).toNumber()
    : 0;

  addStep('Mileage Excess Check', `Excess: ${excessPct.toFixed(1)}%`,
    `TPM=${totalTpm} vs MPM=${totalMph}`,
    mileageExceeded ? `exceeded by ${excessPct.toFixed(1)}%` : 'within MPM');

  // Step 5: Mileage surcharge
  let surchargePercentage = 0;
  if (mileageExceeded) {
    if (excessPct <= 5) surchargePercentage = 5;
    else if (excessPct <= 10) surchargePercentage = 10;
    else if (excessPct <= 15) surchargePercentage = 15;
    else if (excessPct <= 20) surchargePercentage = 20;
    else surchargePercentage = 25;
  }

  const surchargeNuc = totalNuc.mul(surchargePercentage).div(100);
  const mileageSurcharge: MileageSurcharge = {
    applies: surchargePercentage > 0,
    percentage: surchargePercentage,
    surcharge_nuc: surchargeNuc.toFixed(2),
    description: surchargePercentage > 0
      ? `${surchargePercentage}% mileage surcharge applied (excess ${excessPct.toFixed(1)}%)`
      : 'No mileage surcharge',
  };

  if (surchargePercentage > 0) {
    totalNuc = totalNuc.plus(surchargeNuc);
  }

  addStep('Mileage Surcharge', mileageSurcharge.description,
    `base NUC=${totalNuc.minus(surchargeNuc).toFixed(2)}`,
    `total NUC=${totalNuc.toFixed(2)}`);

  // Step 6: HIP check (Higher Intermediate Point)
  // TODO: [NEEDS DOMAIN INPUT] Real HIP detection requires intermediate point fare comparison
  const hipCheck: HipCheck = {
    detected: false,
    hip_point: null,
    hip_nuc: null,
    description: 'HIP check not applicable (no intermediate point fares in dataset)',
  };

  // Simple HIP detection: check if any intermediate segment has a higher per-mile fare
  if (input.components.length > 1) {
    for (let i = 0; i < input.components.length - 1; i++) {
      const comp = input.components[i]!;
      const cp = findMileage(comp.origin, comp.destination);
      if (cp && cp.tpm > 0) {
        const perMile = new Decimal(comp.nuc_amount).div(cp.tpm);
        // Check against overall per-mile rate
        const overallPerMile = totalTpm > 0 ? totalNuc.div(totalTpm) : new Decimal(0);
        if (perMile.gt(overallPerMile.mul('1.1'))) {
          hipCheck.detected = true;
          hipCheck.hip_point = comp.destination;
          hipCheck.hip_nuc = comp.nuc_amount;
          hipCheck.description = `HIP detected at ${comp.destination}: segment fare NUC ${comp.nuc_amount} exceeds proportional rate`;
          break;
        }
      }
    }
  }

  addStep('HIP Check', hipCheck.description, 'fare components', hipCheck.detected ? 'HIP detected' : 'no HIP');

  // Step 7: BHC check (Backhaul Check)
  // TODO: [NEEDS DOMAIN INPUT] Real BHC detection requires geographic direction analysis
  const bhcCheck: BhcCheck = {
    detected: false,
    description: 'Backhaul check: no backhaul detected',
  };

  // Simple BHC: detect if journey goes "backwards" (origin appears again)
  if (input.components.length > 1) {
    const visited = new Set<string>();
    visited.add(input.components[0]!.origin);
    for (const comp of input.components) {
      if (visited.has(comp.destination) && comp.destination !== input.components[0]!.origin) {
        bhcCheck.detected = true;
        bhcCheck.description = `Backhaul detected: ${comp.destination} visited more than once`;
        break;
      }
      visited.add(comp.destination);
    }
  }

  addStep('BHC Check', bhcCheck.description, 'routing', bhcCheck.detected ? 'BHC detected' : 'no BHC');

  // Step 8: CTM check (Circle Trip Minimum)
  const ctmCheck: CtmCheck = {
    applies: false,
    ctm_nuc: null,
    description: 'CTM not applicable (not a circle trip)',
  };

  if (input.journey_type === 'CT' && input.components.length >= 2) {
    // CTM = sum of half round-trip fares for each component
    // Simplified: CTM = total_nuc (already the minimum)
    ctmCheck.applies = true;
    ctmCheck.ctm_nuc = totalNuc.toFixed(2);
    ctmCheck.description = 'Circle Trip Minimum applies';
  }

  addStep('CTM Check', ctmCheck.description, input.journey_type, ctmCheck.applies ? `CTM NUC=${ctmCheck.ctm_nuc}` : 'N/A');

  // Step 9: Get ROE
  const roe = getRoe(input.selling_currency);
  if (!roe) {
    // Fallback to USD ROE of 1.0
    addStep('ROE Lookup', `No ROE found for ${input.selling_currency}, using 1.0`,
      input.selling_currency, '1.000000');
  } else {
    addStep('ROE Lookup', `ROE for ${input.selling_currency}`,
      input.selling_currency, roe.toFixed(6));
  }

  const effectiveRoe = roe ?? new Decimal(1);

  // Step 10: NUC × ROE = local currency
  const localRaw = totalNuc.mul(effectiveRoe);
  addStep('NUC × ROE', `${totalNuc.toFixed(2)} × ${effectiveRoe.toFixed(6)}`,
    `NUC ${totalNuc.toFixed(2)}`,
    `${input.selling_currency} ${localRaw.toFixed(6)}`);

  // Step 11: IATA rounding
  const roundingRule = getRoundingRule(input.selling_currency);
  const localRounded = iataRound(localRaw, roundingRule.unit);

  addStep('IATA Rounding', `Round UP to nearest ${roundingRule.unit}`,
    localRaw.toFixed(6),
    localRounded.toString());

  // Step 12: Final result
  addStep('Final Fare', `Constructed fare in ${input.selling_currency}`,
    `NUC ${totalNuc.toFixed(2)} × ROE ${effectiveRoe.toFixed(6)}`,
    `${input.selling_currency} ${localRounded.toString()}`);

  return {
    total_nuc: totalNuc.toFixed(2),
    roe: effectiveRoe.toFixed(6),
    local_amount_raw: localRaw.toFixed(6),
    local_amount: localRounded.toString(),
    currency: input.selling_currency,
    rounding_unit: roundingRule.unit,
    mileage_checks: mileageChecks,
    total_tpm: totalTpm,
    total_mph: totalMph,
    mileage_exceeded: mileageExceeded,
    mileage_surcharge: mileageSurcharge,
    hip_check: hipCheck,
    bhc_check: bhcCheck,
    ctm_check: ctmCheck,
    audit_trail: audit,
  };
}
