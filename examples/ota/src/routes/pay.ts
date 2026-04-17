/**
 * POST /api/pay — process payment for a booking.
 */

import type { FastifyInstance } from 'fastify';
import type { PaymentService } from '../services/payment-service.js';
import { BookingNotFoundError, PaymentError } from '../services/payment-service.js';

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

interface PayBody {
  bookingReference: string;
  paymentMethodId?: string;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerPayRoute(
  app: FastifyInstance,
  paymentService: PaymentService,
): void {
  app.post<{ Body: PayBody }>('/api/pay', async (request, reply) => {
    const body = request.body as PayBody | undefined;

    if (!body) {
      return reply.status(400).send({ error: 'Request body is required' });
    }

    if (!body.bookingReference || typeof body.bookingReference !== 'string') {
      return reply.status(400).send({ error: 'bookingReference is required' });
    }

    try {
      const result = await paymentService.processPayment(
        body.bookingReference,
        body.paymentMethodId,
      );

      return reply.send(result);
    } catch (err) {
      if (err instanceof BookingNotFoundError) {
        return reply.status(404).send({ error: err.message });
      }

      if (err instanceof PaymentError) {
        return reply.status(400).send({ error: err.message });
      }

      request.log.error({ err }, 'Payment failed');
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ error: 'Payment failed', message });
    }
  });
}
