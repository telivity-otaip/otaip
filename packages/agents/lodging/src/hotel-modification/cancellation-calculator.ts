/**
 * Cancellation penalty calculator.
 *
 * Domain rules:
 * - Deadline-based: 24hr, 48hr, 72hr before arrival
 * - Penalty structure: percentage of booking OR per-night room cost
 * - Multiple conditions possible (more restrictive closer to arrival)
 * - Non-refundable: full charge, no exceptions (except California 24hr)
 * - California law (July 2024+): free cancellation for 24 hours after booking confirmation
 * - No-show: typically 1-night charge, different from cancellation
 *
 * Domain source: OTAIP Lodging Knowledge Base §4 (Cancellation Policies), §11 (No-Show)
 */

import type { CancellationPolicy, MonetaryAmount } from '../types/hotel-common.js';
import type { PenaltyCalculation } from './types.js';

/**
 * Calculate cancellation penalty based on policy, timing, and California rule.
 *
 * @param policy - The cancellation policy for this booking
 * @param checkInDate - Check-in date (ISO string)
 * @param cancellationTime - When the cancellation is being made (ISO string)
 * @param bookedAt - When the booking was originally made (ISO string)
 * @param nightlyRate - Nightly room rate (for penalty calculation)
 */
export function calculateCancellationPenalty(
  policy: CancellationPolicy,
  checkInDate: string,
  cancellationTime: string,
  bookedAt: string,
  nightlyRate: MonetaryAmount,
): PenaltyCalculation {
  const cancelDate = new Date(cancellationTime);
  const bookDate = new Date(bookedAt);
  const checkIn = new Date(checkInDate);

  // California law: free cancellation within 24 hours of booking, regardless of policy
  const hoursSinceBooking = (cancelDate.getTime() - bookDate.getTime()) / (1000 * 60 * 60);
  if (policy.freeCancel24hrBooking && hoursSinceBooking <= 24) {
    return {
      penaltyAmount: { amount: '0.00', currency: nightlyRate.currency },
      penaltyType: 'none',
      deadline: new Date(bookDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      isWithinFreeWindow: true,
      californiaRuleApplies: true,
    };
  }

  // Non-refundable: full charge, no exceptions (except California 24hr above)
  if (!policy.refundable) {
    return {
      penaltyAmount: nightlyRate, // Full booking charge
      penaltyType: 'full_charge',
      deadline: bookedAt, // Was never free to cancel
      isWithinFreeWindow: false,
      californiaRuleApplies: false,
    };
  }

  // Check against deadline-based cancellation policy
  const hoursBeforeCheckin = (checkIn.getTime() - cancelDate.getTime()) / (1000 * 60 * 60);

  // Sort deadlines by hours (most restrictive first — closest to check-in)
  const sortedDeadlines = [...policy.deadlines].sort(
    (a, b) => a.hoursBeforeCheckin - b.hoursBeforeCheckin,
  );

  // Find the applicable deadline
  for (const deadline of sortedDeadlines) {
    if (hoursBeforeCheckin < deadline.hoursBeforeCheckin) {
      // We're past this deadline — penalty applies
      const penaltyAmount = calculatePenaltyAmount(deadline.penaltyType, deadline.penaltyValue, nightlyRate);
      const deadlineDate = new Date(checkIn.getTime() - deadline.hoursBeforeCheckin * 60 * 60 * 1000);

      return {
        penaltyAmount,
        penaltyType: deadline.penaltyType,
        deadline: deadlineDate.toISOString(),
        isWithinFreeWindow: false,
        californiaRuleApplies: false,
      };
    }
  }

  // Before all deadlines — free cancellation
  const earliestDeadline = sortedDeadlines[sortedDeadlines.length - 1];
  const deadlineDate = earliestDeadline
    ? new Date(checkIn.getTime() - earliestDeadline.hoursBeforeCheckin * 60 * 60 * 1000)
    : checkIn;

  return {
    penaltyAmount: { amount: '0.00', currency: nightlyRate.currency },
    penaltyType: 'none',
    deadline: deadlineDate.toISOString(),
    isWithinFreeWindow: true,
    californiaRuleApplies: false,
  };
}

/**
 * Calculate no-show penalty.
 * Standard: 1 night's room rate ($50-$300 depending on property class).
 * No-show window: 18-24 hours after scheduled check-in.
 */
export function calculateNoShowPenalty(nightlyRate: MonetaryAmount): PenaltyCalculation {
  return {
    penaltyAmount: nightlyRate,
    penaltyType: 'one_night',
    deadline: '',
    isWithinFreeWindow: false,
    californiaRuleApplies: false,
  };
}

function calculatePenaltyAmount(
  penaltyType: string,
  penaltyValue: number,
  nightlyRate: MonetaryAmount,
): MonetaryAmount {
  const rate = parseFloat(nightlyRate.amount);

  switch (penaltyType) {
    case 'percentage': {
      const penalty = (rate * penaltyValue) / 100;
      return { amount: penalty.toFixed(2), currency: nightlyRate.currency };
    }
    case 'nights': {
      const penalty = rate * penaltyValue;
      return { amount: penalty.toFixed(2), currency: nightlyRate.currency };
    }
    case 'fixed': {
      return { amount: penaltyValue.toFixed(2), currency: nightlyRate.currency };
    }
    default:
      return nightlyRate;
  }
}
