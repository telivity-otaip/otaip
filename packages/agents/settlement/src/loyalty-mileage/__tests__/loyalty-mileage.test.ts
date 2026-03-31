/**
 * Loyalty & Mileage — Unit Tests
 *
 * Agent 6.6: Mileage accrual, redemption eligibility,
 * status benefits, and cross-airline status matching.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LoyaltyMileageAgent } from '../index.js';

let agent: LoyaltyMileageAgent;

beforeEach(async () => {
  agent = new LoyaltyMileageAgent();
  await agent.initialize();
});

describe('Loyalty Mileage Agent', () => {
  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('6.6');
      expect(agent.name).toBe('Loyalty Mileage');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('reports unhealthy before initialization', async () => {
      const uninit = new LoyaltyMileageAgent();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });

    it('throws when not initialized', async () => {
      const uninit = new LoyaltyMileageAgent();
      await expect(
        uninit.execute({
          data: {
            operation: 'calculateAccrual',
            operatingCarrier: 'BA',
            bookingClass: 'Y',
            distanceMiles: 1000,
          },
        }),
      ).rejects.toThrow('not been initialized');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateAccrual',
          operatingCarrier: 'BA',
          bookingClass: 'Y',
          distanceMiles: 1000,
        },
      });
      expect(result.metadata!['agent_id']).toBe('6.6');
      expect(result.metadata!['operation']).toBe('calculateAccrual');
    });
  });

  describe('calculateAccrual — earn rates', () => {
    it('F class earns 150% of distance', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateAccrual',
          operatingCarrier: 'BA',
          bookingClass: 'F',
          distanceMiles: 1000,
        },
      });
      expect(result.data.accrual!.earnRatePercent).toBe(150);
      expect(result.data.accrual!.baseMiles).toBe(1500);
    });

    it('C class earns 125% of distance', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateAccrual',
          operatingCarrier: 'BA',
          bookingClass: 'C',
          distanceMiles: 1000,
        },
      });
      expect(result.data.accrual!.earnRatePercent).toBe(125);
      expect(result.data.accrual!.baseMiles).toBe(1250);
    });

    it('W class earns 100% of distance', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateAccrual',
          operatingCarrier: 'BA',
          bookingClass: 'W',
          distanceMiles: 1000,
        },
      });
      expect(result.data.accrual!.earnRatePercent).toBe(100);
      expect(result.data.accrual!.baseMiles).toBe(1000);
    });

    it('Y/B/M/H classes earn 100%', async () => {
      for (const cls of ['Y', 'B', 'M', 'H']) {
        const result = await agent.execute({
          data: {
            operation: 'calculateAccrual',
            operatingCarrier: 'BA',
            bookingClass: cls,
            distanceMiles: 1000,
          },
        });
        expect(result.data.accrual!.earnRatePercent).toBe(100);
        expect(result.data.accrual!.baseMiles).toBe(1000);
      }
    });

    it('K/L/Q/T/V/X classes earn 50%', async () => {
      for (const cls of ['K', 'L', 'Q', 'T', 'V', 'X']) {
        const result = await agent.execute({
          data: {
            operation: 'calculateAccrual',
            operatingCarrier: 'BA',
            bookingClass: cls,
            distanceMiles: 1000,
          },
        });
        expect(result.data.accrual!.earnRatePercent).toBe(50);
        expect(result.data.accrual!.baseMiles).toBe(500);
      }
    });

    it('O/G/I/E/N classes earn 0%', async () => {
      for (const cls of ['O', 'G', 'I', 'E', 'N']) {
        const result = await agent.execute({
          data: {
            operation: 'calculateAccrual',
            operatingCarrier: 'BA',
            bookingClass: cls,
            distanceMiles: 1000,
          },
        });
        expect(result.data.accrual!.earnRatePercent).toBe(0);
        expect(result.data.accrual!.baseMiles).toBe(0);
        expect(result.data.accrual!.totalMiles).toBe(0);
      }
    });
  });

  describe('calculateAccrual — status bonus', () => {
    it('MEMBER gets 0% bonus', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateAccrual',
          operatingCarrier: 'BA',
          bookingClass: 'Y',
          distanceMiles: 1000,
          loyaltyStatus: 'MEMBER',
        },
      });
      expect(result.data.accrual!.statusBonusPercent).toBe(0);
      expect(result.data.accrual!.bonusMiles).toBe(0);
      expect(result.data.accrual!.totalMiles).toBe(1000);
    });

    it('SILVER gets 25% bonus', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateAccrual',
          operatingCarrier: 'BA',
          bookingClass: 'Y',
          distanceMiles: 1000,
          loyaltyStatus: 'SILVER',
        },
      });
      expect(result.data.accrual!.statusBonusPercent).toBe(25);
      expect(result.data.accrual!.bonusMiles).toBe(250);
      expect(result.data.accrual!.totalMiles).toBe(1250);
    });

    it('GOLD gets 50% bonus', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateAccrual',
          operatingCarrier: 'BA',
          bookingClass: 'Y',
          distanceMiles: 1000,
          loyaltyStatus: 'GOLD',
        },
      });
      expect(result.data.accrual!.statusBonusPercent).toBe(50);
      expect(result.data.accrual!.bonusMiles).toBe(500);
      expect(result.data.accrual!.totalMiles).toBe(1500);
    });

    it('PLATINUM gets 100% bonus', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateAccrual',
          operatingCarrier: 'BA',
          bookingClass: 'Y',
          distanceMiles: 1000,
          loyaltyStatus: 'PLATINUM',
        },
      });
      expect(result.data.accrual!.statusBonusPercent).toBe(100);
      expect(result.data.accrual!.bonusMiles).toBe(1000);
      expect(result.data.accrual!.totalMiles).toBe(2000);
    });

    it('LIFETIME_GOLD gets 100% bonus', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateAccrual',
          operatingCarrier: 'BA',
          bookingClass: 'Y',
          distanceMiles: 1000,
          loyaltyStatus: 'LIFETIME_GOLD',
        },
      });
      expect(result.data.accrual!.statusBonusPercent).toBe(100);
      expect(result.data.accrual!.bonusMiles).toBe(1000);
      expect(result.data.accrual!.totalMiles).toBe(2000);
    });
  });

  describe('calculateAccrual — alliance detection', () => {
    it('detects ONEWORLD for BA', async () => {
      const result = await agent.execute({
        data: { operation: 'calculateAccrual', operatingCarrier: 'BA', bookingClass: 'Y', distanceMiles: 1000 },
      });
      expect(result.data.accrual!.alliance).toBe('ONEWORLD');
    });

    it('detects SKYTEAM for AF', async () => {
      const result = await agent.execute({
        data: { operation: 'calculateAccrual', operatingCarrier: 'AF', bookingClass: 'Y', distanceMiles: 1000 },
      });
      expect(result.data.accrual!.alliance).toBe('SKYTEAM');
    });

    it('detects STAR_ALLIANCE for LH', async () => {
      const result = await agent.execute({
        data: { operation: 'calculateAccrual', operatingCarrier: 'LH', bookingClass: 'Y', distanceMiles: 1000 },
      });
      expect(result.data.accrual!.alliance).toBe('STAR_ALLIANCE');
    });

    it('detects NONE for unknown carrier', async () => {
      const result = await agent.execute({
        data: { operation: 'calculateAccrual', operatingCarrier: 'ZZ', bookingClass: 'Y', distanceMiles: 1000 },
      });
      expect(result.data.accrual!.alliance).toBe('NONE');
    });
  });

  describe('calculateAccrual — partner earning', () => {
    it('marks partner earning for BA crediting to QF (same oneworld)', async () => {
      const result = await agent.execute({
        data: { operation: 'calculateAccrual', operatingCarrier: 'BA', creditingCarrier: 'QF', bookingClass: 'Y', distanceMiles: 1000 },
      });
      expect(result.data.accrual!.isPartnerEarning).toBe(true);
    });

    it('does not mark partner earning when crediting to same carrier', async () => {
      const result = await agent.execute({
        data: { operation: 'calculateAccrual', operatingCarrier: 'BA', creditingCarrier: 'BA', bookingClass: 'Y', distanceMiles: 1000 },
      });
      expect(result.data.accrual!.isPartnerEarning).toBe(false);
    });

    it('does not mark partner earning across different alliances', async () => {
      const result = await agent.execute({
        data: { operation: 'calculateAccrual', operatingCarrier: 'BA', creditingCarrier: 'LH', bookingClass: 'Y', distanceMiles: 1000 },
      });
      expect(result.data.accrual!.isPartnerEarning).toBe(false);
    });
  });

  describe('checkRedemptionEligibility — Y cabin', () => {
    it('requires 7500 miles for <1000km', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 800, redemptionCabin: 'Y', currentBalance: 10000 },
      });
      expect(result.data.redemption!.milesRequired).toBe(7500);
      expect(result.data.redemption!.eligible).toBe(true);
      expect(result.data.redemption!.distanceBracket).toBe('<1000km');
    });

    it('requires 12500 miles for 1000-3000km', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 2000, redemptionCabin: 'Y', currentBalance: 15000 },
      });
      expect(result.data.redemption!.milesRequired).toBe(12500);
    });

    it('requires 25000 miles for >3000km', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 5000, redemptionCabin: 'Y', currentBalance: 20000 },
      });
      expect(result.data.redemption!.milesRequired).toBe(25000);
      expect(result.data.redemption!.eligible).toBe(false);
      expect(result.data.redemption!.remainingBalance).toBe(-5000);
    });
  });

  describe('checkRedemptionEligibility — C cabin', () => {
    it('requires 15000 miles for <1000km', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 500, redemptionCabin: 'C', currentBalance: 20000 },
      });
      expect(result.data.redemption!.milesRequired).toBe(15000);
    });

    it('requires 30000 miles for 1000-3000km', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 2000, redemptionCabin: 'C', currentBalance: 30000 },
      });
      expect(result.data.redemption!.milesRequired).toBe(30000);
    });

    it('requires 55000 miles for >3000km', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 5000, redemptionCabin: 'C', currentBalance: 55000 },
      });
      expect(result.data.redemption!.milesRequired).toBe(55000);
    });
  });

  describe('checkRedemptionEligibility — F cabin', () => {
    it('requires 30000 miles for <1000km', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 500, redemptionCabin: 'F', currentBalance: 30000 },
      });
      expect(result.data.redemption!.milesRequired).toBe(30000);
    });

    it('requires 55000 miles for 1000-3000km', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 2000, redemptionCabin: 'F', currentBalance: 55000 },
      });
      expect(result.data.redemption!.milesRequired).toBe(55000);
    });

    it('requires 80000 miles for >3000km', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 5000, redemptionCabin: 'F', currentBalance: 80000 },
      });
      expect(result.data.redemption!.milesRequired).toBe(80000);
    });
  });

  describe('checkRedemptionEligibility — partner surcharge', () => {
    it('applies 1.25x for partner redemption', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 800, redemptionCabin: 'Y', isPartnerRedemption: true, currentBalance: 10000 },
      });
      expect(result.data.redemption!.milesRequired).toBe(9375);
      expect(result.data.redemption!.isPartnerRedemption).toBe(true);
    });
  });

  describe('checkRedemptionEligibility — balance checks', () => {
    it('returns eligible=true when balance equals required', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 800, redemptionCabin: 'Y', currentBalance: 7500 },
      });
      expect(result.data.redemption!.eligible).toBe(true);
      expect(result.data.redemption!.remainingBalance).toBe(0);
    });

    it('returns eligible=false with negative remainingBalance', async () => {
      const result = await agent.execute({
        data: { operation: 'checkRedemptionEligibility', distanceKm: 800, redemptionCabin: 'Y', currentBalance: 5000 },
      });
      expect(result.data.redemption!.eligible).toBe(false);
      expect(result.data.redemption!.remainingBalance).toBe(-2500);
    });
  });

  describe('getStatusBenefits', () => {
    it('returns benefits for BA GOLD', async () => {
      const result = await agent.execute({ data: { operation: 'getStatusBenefits', airline: 'BA', status: 'GOLD' } });
      expect(result.data.statusBenefits).toBeDefined();
      expect(result.data.statusBenefits!.airline).toBe('BA');
      const lounge = result.data.statusBenefits!.benefits.find((b) => b.benefit === 'Lounge access');
      expect(lounge?.included).toBe(true);
    });

    it('returns benefits for LH SILVER (no lounge)', async () => {
      const result = await agent.execute({ data: { operation: 'getStatusBenefits', airline: 'LH', status: 'SILVER' } });
      const lounge = result.data.statusBenefits!.benefits.find((b) => b.benefit === 'Lounge access');
      const prio = result.data.statusBenefits!.benefits.find((b) => b.benefit === 'Priority boarding');
      expect(lounge?.included).toBe(false);
      expect(prio?.included).toBe(true);
    });

    it('returns benefits for AF PLATINUM', async () => {
      const result = await agent.execute({ data: { operation: 'getStatusBenefits', airline: 'AF', status: 'PLATINUM' } });
      const lounge = result.data.statusBenefits!.benefits.find((b) => b.benefit === 'Lounge access');
      expect(lounge?.included).toBe(true);
    });

    it('returns benefits for QR GOLD', async () => {
      const result = await agent.execute({ data: { operation: 'getStatusBenefits', airline: 'QR', status: 'GOLD' } });
      const lounge = result.data.statusBenefits!.benefits.find((b) => b.benefit === 'Lounge access');
      expect(lounge?.included).toBe(true);
    });

    it('returns error for unsupported airline', async () => {
      const result = await agent.execute({ data: { operation: 'getStatusBenefits', airline: 'ZZ', status: 'GOLD' } });
      expect(result.data.errorMessage).toContain('No benefits data');
    });

    it('MEMBER tier gets no premium benefits', async () => {
      const result = await agent.execute({ data: { operation: 'getStatusBenefits', airline: 'BA', status: 'MEMBER' } });
      const included = result.data.statusBenefits!.benefits.filter((b) => b.included);
      expect(included.length).toBe(0);
    });
  });

  describe('matchStatus', () => {
    it('matches GOLD to GOLD', async () => {
      const result = await agent.execute({
        data: { operation: 'matchStatus', sourceAirline: 'BA', sourceStatus: 'GOLD', targetAirline: 'QF' },
      });
      expect(result.data.statusMatch!.matchGranted).toBe(true);
      expect(result.data.statusMatch!.matchedStatus).toBe('GOLD');
    });

    it('matches PLATINUM to GOLD (one level down)', async () => {
      const result = await agent.execute({
        data: { operation: 'matchStatus', sourceAirline: 'BA', sourceStatus: 'PLATINUM', targetAirline: 'QF' },
      });
      expect(result.data.statusMatch!.matchGranted).toBe(true);
      expect(result.data.statusMatch!.matchedStatus).toBe('GOLD');
    });

    it('matches SILVER to SILVER', async () => {
      const result = await agent.execute({
        data: { operation: 'matchStatus', sourceAirline: 'LH', sourceStatus: 'SILVER', targetAirline: 'UA' },
      });
      expect(result.data.statusMatch!.matchGranted).toBe(true);
      expect(result.data.statusMatch!.matchedStatus).toBe('SILVER');
    });

    it('does not match MEMBER', async () => {
      const result = await agent.execute({
        data: { operation: 'matchStatus', sourceAirline: 'BA', sourceStatus: 'MEMBER', targetAirline: 'QF' },
      });
      expect(result.data.statusMatch!.matchGranted).toBe(false);
      expect(result.data.statusMatch!.matchedStatus).toBe('MEMBER');
    });

    it('matches LIFETIME_GOLD to GOLD', async () => {
      const result = await agent.execute({
        data: { operation: 'matchStatus', sourceAirline: 'BA', sourceStatus: 'LIFETIME_GOLD', targetAirline: 'AA' },
      });
      expect(result.data.statusMatch!.matchGranted).toBe(true);
      expect(result.data.statusMatch!.matchedStatus).toBe('GOLD');
    });

    it('includes source and target airline in result', async () => {
      const result = await agent.execute({
        data: { operation: 'matchStatus', sourceAirline: 'AF', sourceStatus: 'GOLD', targetAirline: 'KL' },
      });
      expect(result.data.statusMatch!.sourceAirline).toBe('AF');
      expect(result.data.statusMatch!.targetAirline).toBe('KL');
    });
  });

  describe('Input validation', () => {
    it('rejects invalid operation', async () => {
      await expect(
        agent.execute({ data: { operation: 'invalidOp' as 'calculateAccrual' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects calculateAccrual without operatingCarrier', async () => {
      await expect(
        agent.execute({ data: { operation: 'calculateAccrual', bookingClass: 'Y', distanceMiles: 1000 } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects calculateAccrual with invalid bookingClass', async () => {
      await expect(
        agent.execute({ data: { operation: 'calculateAccrual', operatingCarrier: 'BA', bookingClass: '123', distanceMiles: 1000 } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects checkRedemptionEligibility without distanceKm', async () => {
      await expect(
        agent.execute({ data: { operation: 'checkRedemptionEligibility', redemptionCabin: 'Y', currentBalance: 10000 } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects checkRedemptionEligibility with invalid cabin', async () => {
      await expect(
        agent.execute({ data: { operation: 'checkRedemptionEligibility', distanceKm: 1000, redemptionCabin: 'W' as 'Y', currentBalance: 10000 } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects getStatusBenefits without airline', async () => {
      await expect(
        agent.execute({ data: { operation: 'getStatusBenefits', status: 'GOLD' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects matchStatus without sourceAirline', async () => {
      await expect(
        agent.execute({ data: { operation: 'matchStatus', sourceStatus: 'GOLD', targetAirline: 'QF' } }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('destroy', () => {
    it('sets unhealthy after destroy', async () => {
      agent.destroy();
      const health = await agent.health();
      expect(health.status).toBe('unhealthy');
    });
  });
});
