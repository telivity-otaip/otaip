/**
 * Booking management routes — retrieve and cancel bookings.
 *
 * GET  /api/booking/:ref — retrieve booking by reference
 * POST /api/cancel       — cancel a booking
 */

import type { FastifyInstance } from 'fastify';
import type { ManageService } from '../services/manage-service.js';

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

interface CancelBody {
  bookingReference: string;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerManageRoutes(
  app: FastifyInstance,
  manageService: ManageService,
): void {
  // GET /api/booking/:ref
  app.get<{ Params: { ref: string } }>('/api/booking/:ref', async (request, reply) => {
    const { ref } = request.params;

    const booking = await manageService.getBooking(ref);

    if (!booking) {
      return reply.status(404).send({ error: `Booking not found: ${ref}` });
    }

    return reply.send(booking);
  });

  // POST /api/cancel
  const cancelSchema = {
    type: 'object',
    required: ['bookingReference'],
    additionalProperties: false,
    properties: {
      bookingReference: { type: 'string', minLength: 6, maxLength: 32 },
    },
  } as const;
  app.post<{ Body: CancelBody }>(
    '/api/cancel',
    { schema: { body: cancelSchema } },
    async (request, reply) => {
    const body = request.body as CancelBody | undefined;

    if (!body) {
      return reply.status(400).send({ error: 'Request body is required' });
    }

    if (!body.bookingReference || typeof body.bookingReference !== 'string') {
      return reply.status(400).send({ error: 'bookingReference is required' });
    }

    const result = await manageService.cancelBooking(body.bookingReference);

    if (!result.success) {
      // Determine appropriate status code
      if (result.message.includes('not found')) {
        return reply.status(404).send({ error: result.message });
      }
      return reply.status(400).send({ error: result.message });
    }

    return reply.send(result);
  },
  );
}
