/**
 * Itinerary Delivery — Unit Tests
 *
 * Agent 4.4: Multi-channel itinerary rendering.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ItineraryDelivery } from '../index.js';
import type { ItineraryDeliveryInput } from '../types.js';

let agent: ItineraryDelivery;

beforeAll(async () => {
  agent = new ItineraryDelivery();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function makeInput(overrides: Partial<ItineraryDeliveryInput> = {}): ItineraryDeliveryInput {
  return {
    record_locator: 'ABC123',
    passengers: [
      { name: 'SMITH/JOHN', ticket_number: '1251234567890', frequent_flyer: 'BA12345' },
    ],
    flights: [
      {
        flight: 'BA115', origin: 'LHR', destination: 'JFK',
        departure_date: '2026-06-15', departure_time: '09:00', arrival_time: '12:30',
        terminal: 'T5', cabin_class: 'Economy', booking_class: 'Y',
        baggage_allowance: '2PC', seat: '24A',
      },
      {
        flight: 'BA116', origin: 'JFK', destination: 'LHR',
        departure_date: '2026-06-22', departure_time: '19:00', arrival_time: '07:30',
        booking_class: 'Y', baggage_allowance: '2PC',
      },
    ],
    total_fare: '705.00',
    fare_currency: 'GBP',
    contact: { email: 'john@example.com', phone: '+44-7911-123456' },
    channels: ['EMAIL'],
    agency_name: 'Telivity Travel',
    ...overrides,
  };
}

describe('Itinerary Delivery', () => {
  describe('Email rendering', () => {
    it('renders HTML email', async () => {
      const result = await agent.execute({ data: makeInput() });
      const email = result.data.rendered.find((r) => r.channel === 'EMAIL');
      expect(email).toBeDefined();
      expect(email!.content).toContain('<!DOCTYPE html>');
      expect(email!.content).toContain('ABC123');
    });

    it('includes plain text alternative', async () => {
      const result = await agent.execute({ data: makeInput() });
      const email = result.data.rendered.find((r) => r.channel === 'EMAIL');
      expect(email!.plain_text).toBeDefined();
      expect(email!.plain_text).toContain('ABC123');
    });

    it('sets email subject with record locator', async () => {
      const result = await agent.execute({ data: makeInput() });
      const email = result.data.rendered.find((r) => r.channel === 'EMAIL');
      expect(email!.subject).toContain('ABC123');
    });

    it('includes passenger details in HTML', async () => {
      const result = await agent.execute({ data: makeInput() });
      const email = result.data.rendered.find((r) => r.channel === 'EMAIL');
      expect(email!.content).toContain('SMITH/JOHN');
      expect(email!.content).toContain('1251234567890');
    });

    it('includes flight details in HTML', async () => {
      const result = await agent.execute({ data: makeInput() });
      const email = result.data.rendered.find((r) => r.channel === 'EMAIL');
      expect(email!.content).toContain('BA115');
      expect(email!.content).toContain('LHR');
      expect(email!.content).toContain('JFK');
    });

    it('includes fare in HTML', async () => {
      const result = await agent.execute({ data: makeInput() });
      const email = result.data.rendered.find((r) => r.channel === 'EMAIL');
      expect(email!.content).toContain('705.00');
    });

    it('includes agency name in HTML', async () => {
      const result = await agent.execute({ data: makeInput() });
      const email = result.data.rendered.find((r) => r.channel === 'EMAIL');
      expect(email!.content).toContain('Telivity Travel');
    });

    it('includes frequent flyer in HTML', async () => {
      const result = await agent.execute({ data: makeInput() });
      const email = result.data.rendered.find((r) => r.channel === 'EMAIL');
      expect(email!.content).toContain('BA12345');
    });

    it('includes terminal and baggage in HTML', async () => {
      const result = await agent.execute({ data: makeInput() });
      const email = result.data.rendered.find((r) => r.channel === 'EMAIL');
      expect(email!.content).toContain('T5');
      expect(email!.content).toContain('2PC');
    });
  });

  describe('SMS rendering', () => {
    it('renders SMS content', async () => {
      const result = await agent.execute({ data: makeInput({ channels: ['SMS'] }) });
      const sms = result.data.rendered.find((r) => r.channel === 'SMS');
      expect(sms).toBeDefined();
      expect(sms!.content).toContain('ABC123');
    });

    it('includes flight info in SMS', async () => {
      const result = await agent.execute({ data: makeInput({ channels: ['SMS'] }) });
      const sms = result.data.rendered.find((r) => r.channel === 'SMS');
      expect(sms!.content).toContain('BA115');
      expect(sms!.content).toContain('LHR');
    });

    it('calculates SMS segment count', async () => {
      const result = await agent.execute({ data: makeInput({ channels: ['SMS'] }) });
      const sms = result.data.rendered.find((r) => r.channel === 'SMS');
      expect(sms!.sms_segments).toBeGreaterThanOrEqual(1);
    });

    it('keeps SMS concise', async () => {
      const result = await agent.execute({ data: makeInput({ channels: ['SMS'] }) });
      const sms = result.data.rendered.find((r) => r.channel === 'SMS');
      // SMS should not contain HTML
      expect(sms!.content).not.toContain('<html');
    });
  });

  describe('WhatsApp rendering', () => {
    it('renders WhatsApp content', async () => {
      const result = await agent.execute({ data: makeInput({ channels: ['WHATSAPP'] }) });
      const wa = result.data.rendered.find((r) => r.channel === 'WHATSAPP');
      expect(wa).toBeDefined();
      expect(wa!.content).toContain('ABC123');
    });

    it('uses bold formatting for WhatsApp', async () => {
      const result = await agent.execute({ data: makeInput({ channels: ['WHATSAPP'] }) });
      const wa = result.data.rendered.find((r) => r.channel === 'WHATSAPP');
      expect(wa!.content).toContain('*BA115*');
    });

    it('includes passenger name', async () => {
      const result = await agent.execute({ data: makeInput({ channels: ['WHATSAPP'] }) });
      const wa = result.data.rendered.find((r) => r.channel === 'WHATSAPP');
      expect(wa!.content).toContain('SMITH/JOHN');
    });

    it('includes fare amount', async () => {
      const result = await agent.execute({ data: makeInput({ channels: ['WHATSAPP'] }) });
      const wa = result.data.rendered.find((r) => r.channel === 'WHATSAPP');
      expect(wa!.content).toContain('705.00');
    });
  });

  describe('Multi-channel rendering', () => {
    it('renders all three channels', async () => {
      const input = makeInput({
        channels: ['EMAIL', 'SMS', 'WHATSAPP'],
        contact: { email: 'a@b.com', phone: '+1234', whatsapp: '+1234' },
      });
      const result = await agent.execute({ data: input });
      expect(result.data.rendered).toHaveLength(3);
      expect(result.data.channels_rendered).toEqual(['EMAIL', 'SMS', 'WHATSAPP']);
    });

    it('renders email and SMS', async () => {
      const input = makeInput({
        channels: ['EMAIL', 'SMS'],
        contact: { email: 'a@b.com', phone: '+1234' },
      });
      const result = await agent.execute({ data: input });
      expect(result.data.rendered).toHaveLength(2);
    });
  });

  describe('No agency branding', () => {
    it('works without agency name', async () => {
      const input = makeInput({ agency_name: undefined });
      const result = await agent.execute({ data: input });
      const email = result.data.rendered[0]!;
      expect(email.content).toContain('Itinerary Confirmation');
    });

    it('works without fare', async () => {
      const input = makeInput({ total_fare: undefined, fare_currency: undefined });
      const result = await agent.execute({ data: input });
      const email = result.data.rendered[0]!;
      expect(email.content).not.toContain('Total Fare');
    });
  });

  describe('Input validation', () => {
    it('rejects invalid record locator', async () => {
      await expect(agent.execute({ data: makeInput({ record_locator: 'bad' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects empty passengers', async () => {
      await expect(agent.execute({ data: makeInput({ passengers: [] }) })).rejects.toThrow('Invalid input');
    });

    it('rejects empty flights', async () => {
      await expect(agent.execute({ data: makeInput({ flights: [] }) })).rejects.toThrow('Invalid input');
    });

    it('rejects empty channels', async () => {
      await expect(agent.execute({ data: makeInput({ channels: [] }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid channel', async () => {
      await expect(agent.execute({ data: makeInput({ channels: ['FAX' as 'EMAIL'] }) })).rejects.toThrow('Invalid input');
    });

    it('rejects EMAIL without email contact', async () => {
      await expect(agent.execute({ data: makeInput({ contact: { phone: '+1234' } }) })).rejects.toThrow('Invalid input');
    });

    it('rejects SMS without phone contact', async () => {
      await expect(agent.execute({ data: makeInput({ channels: ['SMS'], contact: { email: 'a@b.com' } }) })).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('4.4');
      expect(agent.name).toBe('Itinerary Delivery');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('4.4');
      expect(result.metadata!['flight_count']).toBe(2);
    });

    it('throws when not initialized', async () => {
      const uninit = new ItineraryDelivery();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });
  });
});
