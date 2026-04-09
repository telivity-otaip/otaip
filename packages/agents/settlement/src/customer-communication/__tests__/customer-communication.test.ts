/**
 * Customer Communication — Unit Tests
 *
 * Agent 6.4: Multi-channel notification generation for
 * 8 notification types across 4 channels.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CustomerCommunicationAgent } from '../index.js';
import type { NotificationType, Channel } from '../types.js';

let agent: CustomerCommunicationAgent;

beforeEach(async () => {
  agent = new CustomerCommunicationAgent();
  await agent.initialize();
});

const ALL_TYPES: NotificationType[] = [
  'FLIGHT_CANCELLED',
  'FLIGHT_DELAYED',
  'GATE_CHANGE',
  'REBOOKING_CONFIRMED',
  'REFUND_PROCESSED',
  'SCHEDULE_CHANGE',
  'WAITLIST_CLEARED',
  'ADM_RECEIVED',
];

const ALL_CHANNELS: Channel[] = ['EMAIL_HTML', 'EMAIL_TEXT', 'SMS', 'WHATSAPP'];

const fullVariables = {
  passengerName: 'John Smith',
  flightNumber: 'BA123',
  origin: 'LHR',
  destination: 'JFK',
  originalDeparture: '2025-03-15 10:00',
  newDeparture: '2025-03-15 14:00',
  gate: 'B42',
  previousGate: 'A12',
  delayDuration: '4 hours',
  refundAmount: '350.00',
  currency: 'GBP',
  bookingReference: 'ABC123',
  newFlightNumber: 'BA456',
  admAmount: '150.00',
  airlineName: 'British Airways',
  reason: 'Fare difference',
  ticketNumber: '1234567890123',
  seatAssignment: '12A',
  newSchedule: '2025-03-16 09:00',
};

describe('Customer Communication Agent', () => {
  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('6.4');
      expect(agent.name).toBe('Customer Communication');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy status after initialization', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('reports unhealthy before initialization', async () => {
      const uninit = new CustomerCommunicationAgent();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });

    it('throws when not initialized', async () => {
      const uninit = new CustomerCommunicationAgent();
      await expect(
        uninit.execute({
          data: {
            operation: 'generateNotification',
            notificationType: 'FLIGHT_CANCELLED',
            channel: 'SMS',
            variables: fullVariables,
          },
        }),
      ).rejects.toThrow('not been initialized');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'SMS',
          variables: fullVariables,
        },
      });
      expect(result.metadata!['agent_id']).toBe('6.4');
      expect(result.metadata!['operation']).toBe('generateNotification');
    });
  });

  describe('generateNotification — all 8 types x 4 channels', () => {
    for (const type of ALL_TYPES) {
      for (const channel of ALL_CHANNELS) {
        it(`generates ${type} on ${channel}`, async () => {
          const result = await agent.execute({
            data: {
              operation: 'generateNotification',
              notificationType: type,
              channel,
              variables: fullVariables,
            },
          });

          expect(result.data.notification).toBeDefined();
          expect(result.data.notification!.type).toBe(type);
          expect(result.data.notification!.channel).toBe(channel);
          expect(result.data.notification!.body.length).toBeGreaterThan(0);

          // No missing variables when all are provided
          expect(result.data.notification!.variablesMissing.length).toBe(0);
          expect(result.data.notification!.variablesUsed.length).toBeGreaterThan(0);
        });
      }
    }
  });

  describe('EMAIL_HTML formatting', () => {
    it('contains <p> tags', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'EMAIL_HTML',
          variables: fullVariables,
        },
      });
      expect(result.data.notification!.body).toContain('<p>');
      expect(result.data.notification!.body).toContain('</p>');
    });

    it('contains bold key info', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'EMAIL_HTML',
          variables: fullVariables,
        },
      });
      expect(result.data.notification!.body).toContain('<b>');
    });

    it('has a subject line', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'EMAIL_HTML',
          variables: fullVariables,
        },
      });
      expect(result.data.notification!.subject).toBeDefined();
      expect(result.data.notification!.subject!).toContain('BA123');
    });
  });

  describe('EMAIL_TEXT formatting', () => {
    it('has no HTML tags', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_DELAYED',
          channel: 'EMAIL_TEXT',
          variables: fullVariables,
        },
      });
      expect(result.data.notification!.body).not.toContain('<p>');
      expect(result.data.notification!.body).not.toContain('<b>');
    });

    it('has a subject line', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_DELAYED',
          channel: 'EMAIL_TEXT',
          variables: fullVariables,
        },
      });
      expect(result.data.notification!.subject).toBeDefined();
    });
  });

  describe('SMS formatting', () => {
    it('calculates smsSegments', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'GATE_CHANGE',
          channel: 'SMS',
          variables: fullVariables,
        },
      });
      expect(result.data.notification!.smsSegments).toBeDefined();
      expect(result.data.notification!.smsSegments!).toBeGreaterThanOrEqual(1);
    });

    it('computes smsSegments based on 160 char limit', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'SMS',
          variables: fullVariables,
        },
      });
      const expectedSegments = Math.ceil(result.data.notification!.body.length / 160);
      expect(result.data.notification!.smsSegments).toBe(expectedSegments);
    });

    it('does not have smsSegments for non-SMS channels', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'EMAIL_HTML',
          variables: fullVariables,
        },
      });
      expect(result.data.notification!.smsSegments).toBeUndefined();
    });

    it('has no subject line', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'SMS',
          variables: fullVariables,
        },
      });
      expect(result.data.notification!.subject).toBeUndefined();
    });
  });

  describe('WhatsApp formatting', () => {
    it('uses *asterisks* for bold', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'WHATSAPP',
          variables: fullVariables,
        },
      });
      expect(result.data.notification!.body).toContain('*');
      // Should contain bold markers around key info
      expect(result.data.notification!.body).toContain('*BA123*');
    });

    it('has no subject line', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'WHATSAPP',
          variables: fullVariables,
        },
      });
      expect(result.data.notification!.subject).toBeUndefined();
    });
  });

  describe('Missing variable handling', () => {
    it('leaves {variableName} as-is when variable is missing', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'SMS',
          variables: { flightNumber: 'BA123' },
        },
      });
      const body = result.data.notification!.body;
      expect(body).toContain('BA123');
      expect(body).toContain('{origin}');
      expect(body).toContain('{destination}');
    });

    it('tracks missing variables in variablesMissing', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'SMS',
          variables: { flightNumber: 'BA123', bookingReference: 'XYZ789' },
        },
      });
      expect(result.data.notification!.variablesMissing.length).toBeGreaterThan(0);
      expect(result.data.notification!.variablesMissing).toContain('origin');
    });

    it('tracks used variables in variablesUsed', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateNotification',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'SMS',
          variables: { flightNumber: 'BA123', bookingReference: 'XYZ789' },
        },
      });
      expect(result.data.notification!.variablesUsed).toContain('flightNumber');
      expect(result.data.notification!.variablesUsed).toContain('bookingReference');
    });
  });

  describe('generateBatch', () => {
    it('generates multiple notifications in a batch', async () => {
      const result = await agent.execute({
        data: {
          operation: 'generateBatch',
          batchRequests: [
            { notificationType: 'FLIGHT_CANCELLED', channel: 'SMS', variables: fullVariables },
            { notificationType: 'GATE_CHANGE', channel: 'WHATSAPP', variables: fullVariables },
            {
              notificationType: 'REFUND_PROCESSED',
              channel: 'EMAIL_HTML',
              variables: fullVariables,
            },
          ],
        },
      });
      expect(result.data.notifications).toBeDefined();
      expect(result.data.notifications!.length).toBe(3);
      expect(result.data.notifications![0].type).toBe('FLIGHT_CANCELLED');
      expect(result.data.notifications![1].type).toBe('GATE_CHANGE');
      expect(result.data.notifications![2].type).toBe('REFUND_PROCESSED');
    });
  });

  describe('getTemplate', () => {
    it('returns template info with required variables', async () => {
      const result = await agent.execute({
        data: {
          operation: 'getTemplate',
          notificationType: 'FLIGHT_CANCELLED',
          channel: 'EMAIL_HTML',
        },
      });
      expect(result.data.template).toBeDefined();
      expect(result.data.template!.type).toBe('FLIGHT_CANCELLED');
      expect(result.data.template!.channel).toBe('EMAIL_HTML');
      expect(result.data.template!.template).toContain('{passengerName}');
      expect(result.data.template!.requiredVariables.length).toBeGreaterThan(0);
      expect(result.data.template!.subjectTemplate).toBeDefined();
    });

    it('returns required variables list', async () => {
      const result = await agent.execute({
        data: {
          operation: 'getTemplate',
          notificationType: 'REFUND_PROCESSED',
          channel: 'SMS',
        },
      });
      expect(result.data.template!.requiredVariables).toContain('refundAmount');
      expect(result.data.template!.requiredVariables).toContain('currency');
    });
  });

  describe('Input validation', () => {
    it('rejects invalid operation', async () => {
      await expect(
        agent.execute({ data: { operation: 'invalidOp' as 'getTemplate' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid notificationType', async () => {
      await expect(
        agent.execute({
          data: {
            operation: 'generateNotification',
            notificationType: 'INVALID' as NotificationType,
            channel: 'SMS',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid channel', async () => {
      await expect(
        agent.execute({
          data: {
            operation: 'generateNotification',
            notificationType: 'FLIGHT_CANCELLED',
            channel: 'PIGEON' as Channel,
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects empty batch requests', async () => {
      await expect(
        agent.execute({ data: { operation: 'generateBatch', batchRequests: [] } }),
      ).rejects.toThrow('Invalid input');
    });
  });
});
