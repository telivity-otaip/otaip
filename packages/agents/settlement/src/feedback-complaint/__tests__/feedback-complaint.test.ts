/**
 * Feedback & Complaint — Unit Tests
 *
 * Agent 6.5: Complaint submission, EU261/US DOT compensation,
 * case management, DOT record generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FeedbackComplaintAgent } from '../index.js';

let agent: FeedbackComplaintAgent;

beforeEach(async () => {
  agent = new FeedbackComplaintAgent();
  await agent.initialize();
});

async function submitTestComplaint(overrides?: Record<string, unknown>) {
  const defaults = {
    operation: 'submitComplaint' as const,
    complaintType: 'DELAY' as const,
    passengerName: 'SMITH/JOHN',
    bookingReference: 'ABC123',
    airline: 'BA',
    flightNumber: 'BA123',
    flightDate: '2025-03-15',
    description: 'Flight was delayed by 5 hours.',
    currentDate: '2025-03-16',
  };
  return agent.execute({ data: { ...defaults, ...overrides } });
}

describe('Feedback & Complaint Agent', () => {
  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('6.5');
      expect(agent.name).toBe('Feedback & Complaint');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('reports unhealthy before initialization', async () => {
      const uninit = new FeedbackComplaintAgent();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });

    it('throws when not initialized', async () => {
      const uninit = new FeedbackComplaintAgent();
      await expect(uninit.execute({ data: { operation: 'listCases' } })).rejects.toThrow(
        'not been initialized',
      );
    });

    it('returns metadata in output', async () => {
      const result = await submitTestComplaint();
      expect(result.metadata!['agent_id']).toBe('6.5');
    });
  });

  describe('submitComplaint', () => {
    it('creates a complaint case with SUBMITTED status', async () => {
      const result = await submitTestComplaint();
      expect(result.data.complaintCase).toBeDefined();
      expect(result.data.complaintCase!.status).toBe('SUBMITTED');
      expect(result.data.complaintCase!.complaintType).toBe('DELAY');
    });

    it('generates a UUID caseId', async () => {
      const result = await submitTestComplaint();
      expect(result.data.complaintCase!.caseId).toMatch(/^[0-9a-f]{8}-/);
    });

    it('stores all complaint fields', async () => {
      const result = await submitTestComplaint();
      const cc = result.data.complaintCase!;
      expect(cc.passengerName).toBe('SMITH/JOHN');
      expect(cc.bookingReference).toBe('ABC123');
      expect(cc.airline).toBe('BA');
      expect(cc.flightNumber).toBe('BA123');
      expect(cc.flightDate).toBe('2025-03-15');
    });
  });

  describe('Priority assignment', () => {
    it('assigns HIGH priority to DENIED_BOARDING', async () => {
      const result = await submitTestComplaint({ complaintType: 'DENIED_BOARDING' });
      expect(result.data.complaintCase!.priority).toBe('HIGH');
    });

    it('assigns HIGH priority to ACCESSIBILITY', async () => {
      const result = await submitTestComplaint({ complaintType: 'ACCESSIBILITY' });
      expect(result.data.complaintCase!.priority).toBe('HIGH');
    });

    it('assigns HIGH priority to CANCELLATION', async () => {
      const result = await submitTestComplaint({ complaintType: 'CANCELLATION' });
      expect(result.data.complaintCase!.priority).toBe('HIGH');
    });

    it('assigns HIGH priority to DELAY with EU261', async () => {
      const result = await submitTestComplaint({ complaintType: 'DELAY', regulation: 'EU261' });
      expect(result.data.complaintCase!.priority).toBe('HIGH');
    });

    it('assigns NORMAL priority to SERVICE_QUALITY', async () => {
      const result = await submitTestComplaint({ complaintType: 'SERVICE_QUALITY' });
      expect(result.data.complaintCase!.priority).toBe('NORMAL');
    });

    it('assigns NORMAL priority to BAGGAGE', async () => {
      const result = await submitTestComplaint({ complaintType: 'BAGGAGE' });
      expect(result.data.complaintCase!.priority).toBe('NORMAL');
    });

    it('assigns NORMAL priority to DELAY without EU261', async () => {
      const result = await submitTestComplaint({ complaintType: 'DELAY' });
      expect(result.data.complaintCase!.priority).toBe('NORMAL');
    });
  });

  describe('updateStatus', () => {
    it('updates case status', async () => {
      const submitted = await submitTestComplaint();
      const caseId = submitted.data.complaintCase!.caseId;

      const result = await agent.execute({
        data: { operation: 'updateStatus', caseId, newStatus: 'UNDER_REVIEW' },
      });

      expect(result.data.complaintCase!.status).toBe('UNDER_REVIEW');
    });

    it('records status history', async () => {
      const submitted = await submitTestComplaint();
      const caseId = submitted.data.complaintCase!.caseId;

      await agent.execute({
        data: { operation: 'updateStatus', caseId, newStatus: 'UNDER_REVIEW' },
      });
      await agent.execute({
        data: { operation: 'updateStatus', caseId, newStatus: 'RESOLVED' },
      });

      const get = await agent.execute({ data: { operation: 'getCase', caseId } });
      expect(get.data.complaintCase!.statusHistory.length).toBe(2);
      expect(get.data.complaintCase!.statusHistory[0].from).toBe('SUBMITTED');
      expect(get.data.complaintCase!.statusHistory[0].to).toBe('UNDER_REVIEW');
    });

    it('returns error for unknown case', async () => {
      const result = await agent.execute({
        data: { operation: 'updateStatus', caseId: 'unknown', newStatus: 'RESOLVED' },
      });
      expect(result.data.errorMessage).toContain('not found');
    });
  });

  describe('getCase', () => {
    it('retrieves a case by ID', async () => {
      const submitted = await submitTestComplaint();
      const caseId = submitted.data.complaintCase!.caseId;

      const result = await agent.execute({ data: { operation: 'getCase', caseId } });
      expect(result.data.complaintCase!.caseId).toBe(caseId);
    });

    it('returns error for unknown case', async () => {
      const result = await agent.execute({
        data: { operation: 'getCase', caseId: 'does-not-exist' },
      });
      expect(result.data.errorMessage).toContain('not found');
    });
  });

  describe('listCases', () => {
    it('lists all cases', async () => {
      await submitTestComplaint();
      await submitTestComplaint({ complaintType: 'CANCELLATION' });

      const result = await agent.execute({ data: { operation: 'listCases' } });
      expect(result.data.cases!.length).toBe(2);
    });

    it('filters by status', async () => {
      const submitted = await submitTestComplaint();
      await agent.execute({
        data: {
          operation: 'updateStatus',
          caseId: submitted.data.complaintCase!.caseId,
          newStatus: 'RESOLVED',
        },
      });
      await submitTestComplaint();

      const result = await agent.execute({
        data: { operation: 'listCases', filterStatus: 'SUBMITTED' },
      });
      expect(result.data.cases!.length).toBe(1);
    });

    it('filters by complaint type', async () => {
      await submitTestComplaint({ complaintType: 'DELAY' });
      await submitTestComplaint({ complaintType: 'BAGGAGE' });

      const result = await agent.execute({
        data: { operation: 'listCases', filterType: 'BAGGAGE' },
      });
      expect(result.data.cases!.length).toBe(1);
      expect(result.data.cases![0].complaintType).toBe('BAGGAGE');
    });
  });

  describe('US DOT compensation — DENIED_BOARDING (primary)', () => {
    it('domestic 1-2h late: 200% capped at $1075', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DENIED_BOARDING',
          fareAmount: '300.00',
          delayMinutes: 90,
          isDomestic: true,
        },
      });
      expect(result.data.compensation!.eligible).toBe(true);
      expect(result.data.compensation!.finalAmount).toBe('600.00');
      expect(result.data.compensation!.currency).toBe('USD');
    });

    it('domestic 1-2h late: caps at $1075', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DENIED_BOARDING',
          fareAmount: '700.00',
          delayMinutes: 90,
          isDomestic: true,
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('1075.00');
    });

    it('domestic >2h late: 400% capped at $2150', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DENIED_BOARDING',
          fareAmount: '300.00',
          delayMinutes: 150,
          isDomestic: true,
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('1200.00');
    });

    it('domestic >2h late: caps at $2150', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DENIED_BOARDING',
          fareAmount: '800.00',
          delayMinutes: 180,
          isDomestic: true,
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('2150.00');
    });

    it('international 1-4h late: 200% capped at $1075', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DENIED_BOARDING',
          fareAmount: '300.00',
          delayMinutes: 180,
          isDomestic: false,
        },
      });
      expect(result.data.compensation!.eligible).toBe(true);
      expect(result.data.compensation!.finalAmount).toBe('600.00');
    });

    it('international 1-4h late: caps at $1075', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DENIED_BOARDING',
          fareAmount: '600.00',
          delayMinutes: 200,
          isDomestic: false,
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('1075.00');
    });

    it('international >4h late: 400% capped at $2150', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DENIED_BOARDING',
          fareAmount: '300.00',
          delayMinutes: 250,
          isDomestic: false,
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('1200.00');
    });

    it('international >4h late: caps at $2150', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DENIED_BOARDING',
          fareAmount: '1000.00',
          delayMinutes: 300,
          isDomestic: false,
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('2150.00');
    });

    it('defaults to domestic when isDomestic not specified', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DENIED_BOARDING',
          fareAmount: '300.00',
          delayMinutes: 90,
        },
      });
      // domestic <2h -> 200% -> 600
      expect(result.data.compensation!.finalAmount).toBe('600.00');
    });

    it('supports legacy delayHours field', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DENIED_BOARDING',
          fareAmount: '300.00',
          delayHours: 1.5,
          isDomestic: true,
        },
      });
      // 1.5h = 90min, domestic <2h -> 200% -> 600
      expect(result.data.compensation!.finalAmount).toBe('600.00');
    });
  });

  describe('US DOT compensation — DELAY', () => {
    it('returns not eligible for delay', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DELAY',
        },
      });
      expect(result.data.compensation!.eligible).toBe(false);
      expect(result.data.compensation!.notes).toContain('does not mandate delay compensation');
    });
  });

  describe('US DOT compensation — CANCELLATION', () => {
    it('returns not eligible for cancellation', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'CANCELLATION',
        },
      });
      expect(result.data.compensation!.eligible).toBe(false);
      expect(result.data.compensation!.notes).toContain('full refund or rebooking');
    });
  });

  describe('US DOT compensation — DOWNGRADE', () => {
    it('returns full fare refund for involuntary downgrade', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'US_DOT',
          complaintType: 'DOWNGRADE',
          fareAmount: '850.00',
        },
      });
      expect(result.data.compensation!.eligible).toBe(true);
      expect(result.data.compensation!.finalAmount).toBe('850.00');
      expect(result.data.compensation!.currency).toBe('USD');
      expect(result.data.compensation!.notes).toContain('Full refund');
    });
  });

  describe('EU261 compensation — DELAY (secondary)', () => {
    it('returns not eligible for delay < 180 minutes', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DELAY',
          distanceKm: 2000,
          delayMinutes: 170,
        },
      });
      expect(result.data.compensation!.eligible).toBe(false);
    });

    it('returns EUR 250 for <1500km delay >=180min', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DELAY',
          distanceKm: 1000,
          delayMinutes: 200,
        },
      });
      expect(result.data.compensation!.eligible).toBe(true);
      expect(result.data.compensation!.baseAmount).toBe('250.00');
      expect(result.data.compensation!.finalAmount).toBe('250.00');
      expect(result.data.compensation!.currency).toBe('EUR');
    });

    it('returns EUR 400 for 1500-3500km delay', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DELAY',
          distanceKm: 2500,
          delayMinutes: 300,
        },
      });
      expect(result.data.compensation!.baseAmount).toBe('400.00');
      expect(result.data.compensation!.finalAmount).toBe('400.00');
    });

    it('returns EUR 600 for >3500km delay', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DELAY',
          distanceKm: 5000,
          delayMinutes: 360,
        },
      });
      expect(result.data.compensation!.baseAmount).toBe('600.00');
      expect(result.data.compensation!.finalAmount).toBe('600.00');
    });

    it('supports legacy delayHours field for EU261', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DELAY',
          distanceKm: 1000,
          delayHours: 4,
        },
      });
      expect(result.data.compensation!.eligible).toBe(true);
      expect(result.data.compensation!.baseAmount).toBe('250.00');
    });

    it('applies 50% reduction when alternative offered and within threshold (<1500km, <=2h)', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DELAY',
          distanceKm: 1000,
          delayMinutes: 240,
          alternativeOffered: true,
          alternativeArrivalDelayHours: 1.5,
        },
      });
      expect(result.data.compensation!.baseAmount).toBe('250.00');
      expect(result.data.compensation!.finalAmount).toBe('125.00');
      expect(result.data.compensation!.reductionPercent).toBe(50);
    });

    it('no reduction when alternative arrival exceeds threshold (<1500km, >2h)', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DELAY',
          distanceKm: 1000,
          delayMinutes: 240,
          alternativeOffered: true,
          alternativeArrivalDelayHours: 2.5,
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('250.00');
      expect(result.data.compensation!.reductionPercent).toBe(0);
    });

    it('applies 50% reduction for 1500-3500km when arrival <=3h', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DELAY',
          distanceKm: 2500,
          delayMinutes: 240,
          alternativeOffered: true,
          alternativeArrivalDelayHours: 2.5,
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('200.00');
      expect(result.data.compensation!.reductionPercent).toBe(50);
    });

    it('applies 50% reduction for >3500km when arrival <=4h', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DELAY',
          distanceKm: 5000,
          delayMinutes: 360,
          alternativeOffered: true,
          alternativeArrivalDelayHours: 3.5,
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('300.00');
      expect(result.data.compensation!.reductionPercent).toBe(50);
    });
  });

  describe('EU261 compensation — CANCELLATION', () => {
    it('returns EUR 250 for <1500km cancellation', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'CANCELLATION',
          distanceKm: 800,
        },
      });
      expect(result.data.compensation!.eligible).toBe(true);
      expect(result.data.compensation!.baseAmount).toBe('250.00');
    });

    it('returns EUR 600 for >3500km cancellation', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'CANCELLATION',
          distanceKm: 5000,
        },
      });
      expect(result.data.compensation!.baseAmount).toBe('600.00');
    });
  });

  describe('EU261 compensation — DOWNGRADE', () => {
    it('returns 30% of fare for <=1500km downgrade', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DOWNGRADE',
          distanceKm: 1000,
          farePaid: '500.00',
        },
      });
      expect(result.data.compensation!.eligible).toBe(true);
      expect(result.data.compensation!.finalAmount).toBe('150.00');
      expect(result.data.compensation!.currency).toBe('EUR');
    });

    it('returns 50% of fare for 1500-3500km downgrade', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DOWNGRADE',
          distanceKm: 2000,
          farePaid: '800.00',
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('400.00');
    });

    it('returns 75% of fare for >3500km downgrade', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DOWNGRADE',
          distanceKm: 5000,
          farePaid: '1200.00',
        },
      });
      expect(result.data.compensation!.finalAmount).toBe('900.00');
    });
  });

  describe('EU261 compensation — DENIED_BOARDING', () => {
    it('returns EUR 400 for 1500-3500km denied boarding', async () => {
      const result = await agent.execute({
        data: {
          operation: 'calculateCompensation',
          regulation: 'EU261',
          complaintType: 'DENIED_BOARDING',
          distanceKm: 2000,
        },
      });
      expect(result.data.compensation!.eligible).toBe(true);
      expect(result.data.compensation!.baseAmount).toBe('400.00');
    });
  });

  describe('generateDOTRecord', () => {
    it('generates a DOT record from a complaint case', async () => {
      const submitted = await submitTestComplaint({ complaintType: 'DELAY' });
      const caseId = submitted.data.complaintCase!.caseId;

      const result = await agent.execute({
        data: { operation: 'generateDOTRecord', caseId },
      });

      expect(result.data.dotRecord).toBeDefined();
      expect(result.data.dotRecord!.dotCategory).toBe('Flight Problems');
      expect(result.data.dotRecord!.airline).toBe('BA');
    });

    it('maps DENIED_BOARDING to Oversales', async () => {
      const submitted = await submitTestComplaint({ complaintType: 'DENIED_BOARDING' });
      const caseId = submitted.data.complaintCase!.caseId;

      const result = await agent.execute({
        data: { operation: 'generateDOTRecord', caseId },
      });
      expect(result.data.dotRecord!.dotCategory).toBe('Oversales');
    });

    it('maps BAGGAGE to Baggage', async () => {
      const submitted = await submitTestComplaint({ complaintType: 'BAGGAGE' });
      const caseId = submitted.data.complaintCase!.caseId;

      const result = await agent.execute({
        data: { operation: 'generateDOTRecord', caseId },
      });
      expect(result.data.dotRecord!.dotCategory).toBe('Baggage');
    });

    it('maps ACCESSIBILITY to Disability', async () => {
      const submitted = await submitTestComplaint({ complaintType: 'ACCESSIBILITY' });
      const caseId = submitted.data.complaintCase!.caseId;

      const result = await agent.execute({
        data: { operation: 'generateDOTRecord', caseId },
      });
      expect(result.data.dotRecord!.dotCategory).toBe('Disability');
    });

    it('maps CANCELLATION to Flight Problems', async () => {
      const submitted = await submitTestComplaint({ complaintType: 'CANCELLATION' });
      const caseId = submitted.data.complaintCase!.caseId;

      const result = await agent.execute({
        data: { operation: 'generateDOTRecord', caseId },
      });
      expect(result.data.dotRecord!.dotCategory).toBe('Flight Problems');
    });

    it('returns error for unknown case', async () => {
      const result = await agent.execute({
        data: { operation: 'generateDOTRecord', caseId: 'unknown' },
      });
      expect(result.data.errorMessage).toContain('not found');
    });
  });

  describe('Input validation', () => {
    it('rejects invalid operation', async () => {
      await expect(
        agent.execute({ data: { operation: 'invalidOp' as 'getCase' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects submitComplaint without passengerName', async () => {
      await expect(submitTestComplaint({ passengerName: '' })).rejects.toThrow('Invalid input');
    });

    it('rejects submitComplaint with invalid airline', async () => {
      await expect(submitTestComplaint({ airline: 'TOOLONG' })).rejects.toThrow('Invalid input');
    });

    it('rejects updateStatus without caseId', async () => {
      await expect(
        agent.execute({ data: { operation: 'updateStatus', newStatus: 'RESOLVED' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects calculateCompensation without regulation', async () => {
      await expect(
        agent.execute({
          data: { operation: 'calculateCompensation', complaintType: 'DELAY' },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('destroy', () => {
    it('clears store and sets unhealthy', async () => {
      await submitTestComplaint();
      agent.destroy();
      const health = await agent.health();
      expect(health.status).toBe('unhealthy');
    });
  });
});
