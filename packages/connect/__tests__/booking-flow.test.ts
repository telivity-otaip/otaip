import { describe, it, expect } from 'vitest';
import { BookingPipeline } from '../src/pipeline/booking-flow.js';
import { PaymentHandoff } from '../src/pipeline/payment-handoff.js';
import { TemplateAdapter } from '../src/suppliers/_template/index.js';

describe('BookingPipeline (stub)', () => {
  it('throws NotImplemented', async () => {
    const adapter = new TemplateAdapter({ baseUrl: 'http://test', apiKey: 'key' });
    const pipeline = new BookingPipeline({
      adapter,
      autoTicket: false,
      paymentTimeoutMs: 30_000,
    });

    await expect(
      pipeline.execute(
        {
          origin: 'JFK',
          destination: 'LHR',
          departureDate: '2026-06-15',
          passengers: { adults: 1 },
        },
        {
          passengers: [
            {
              type: 'adult',
              gender: 'M',
              firstName: 'Test',
              lastName: 'User',
              dateOfBirth: '1990-01-01',
            },
          ],
          contact: { email: 'test@test.com', phone: '123' },
        },
      ),
    ).rejects.toThrow('Not implemented');
  });
});

describe('PaymentHandoff (stub)', () => {
  it('throws NotImplemented', async () => {
    const handoff = new PaymentHandoff({
      pollIntervalMs: 1000,
      maxPollAttempts: 10,
    });

    await expect(handoff.awaitPayment('REF-001')).rejects.toThrow('Not implemented');
  });
});

describe('TemplateAdapter (stub)', () => {
  it('throws NotImplemented on all methods', async () => {
    const adapter = new TemplateAdapter({ baseUrl: 'http://test', apiKey: 'key' });

    await expect(
      adapter.searchFlights({
        origin: 'JFK',
        destination: 'LHR',
        departureDate: '2026-06-15',
        passengers: { adults: 1 },
      }),
    ).rejects.toThrow('Not implemented');

    await expect(adapter.priceItinerary('id', { adults: 1 })).rejects.toThrow(
      'Not implemented',
    );

    await expect(
      adapter.createBooking({
        offerId: 'id',
        passengers: [],
        contact: { email: 'a@b.com', phone: '1' },
      }),
    ).rejects.toThrow('Not implemented');

    await expect(adapter.getBookingStatus('id')).rejects.toThrow('Not implemented');
    await expect(adapter.healthCheck()).rejects.toThrow('Not implemented');
  });
});
