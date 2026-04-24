/**
 * POST /api/ticket — issue tickets for a booking.
 */

import type { FastifyInstance } from 'fastify';
import type { TicketingService } from '../services/ticketing-service.js';
import { TicketingError } from '../services/ticketing-service.js';

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

interface TicketBody {
  bookingReference: string;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

const TICKET_BODY_SCHEMA = {
  type: 'object',
  required: ['bookingReference'],
  additionalProperties: false,
  properties: {
    bookingReference: { type: 'string', minLength: 6, maxLength: 32 },
  },
} as const;

export function registerTicketRoute(
  app: FastifyInstance,
  ticketingService: TicketingService,
): void {
  app.post<{ Body: TicketBody }>(
    '/api/ticket',
    { schema: { body: TICKET_BODY_SCHEMA } },
    async (request, reply) => {
    const body = request.body as TicketBody | undefined;

    if (!body) {
      return reply.status(400).send({ error: 'Request body is required' });
    }

    if (!body.bookingReference || typeof body.bookingReference !== 'string') {
      return reply.status(400).send({ error: 'bookingReference is required' });
    }

    try {
      const result = await ticketingService.issueTicket(body.bookingReference);
      return reply.send(result);
    } catch (err) {
      if (err instanceof TicketingError) {
        const message = err.message;

        if (message.includes('not found')) {
          return reply.status(404).send({ error: message });
        }

        return reply.status(400).send({ error: message });
      }

      request.log.error({ err }, 'Ticketing failed');
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ error: 'Ticketing failed', message });
    }
  },
  );
}
