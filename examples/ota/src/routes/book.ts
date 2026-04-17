/**
 * POST /api/book — create a booking for a searched offer.
 */

import type { FastifyInstance } from 'fastify';
import type { BookingService } from '../services/booking-service.js';
import { OfferNotFoundError } from '../services/booking-service.js';
import type { PassengerDetail } from '../types.js';

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

interface BookBody {
  offerId: string;
  passengers: PassengerDetail[];
  email: string;
  phone: string;
}

const VALID_TITLES = new Set(['mr', 'ms', 'mrs', 'miss', 'dr']);
const VALID_GENDERS = new Set(['male', 'female']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerBookRoute(
  app: FastifyInstance,
  bookingService: BookingService,
): void {
  app.post<{ Body: BookBody }>('/api/book', async (request, reply) => {
    const body = request.body as BookBody | undefined;

    if (!body) {
      return reply.status(400).send({ error: 'Request body is required' });
    }

    const errors: string[] = [];

    if (!body.offerId || typeof body.offerId !== 'string') {
      errors.push('offerId is required');
    }

    if (!body.email || typeof body.email !== 'string') {
      errors.push('email is required');
    }

    if (!body.phone || typeof body.phone !== 'string') {
      errors.push('phone is required');
    }

    if (!body.passengers || !Array.isArray(body.passengers) || body.passengers.length === 0) {
      errors.push('passengers must be a non-empty array');
    } else {
      for (let i = 0; i < body.passengers.length; i++) {
        const p = body.passengers[i]!;
        const prefix = `passengers[${i}]`;

        if (!p.title || !VALID_TITLES.has(p.title)) {
          errors.push(`${prefix}.title must be one of: mr, ms, mrs, miss, dr`);
        }
        if (!p.firstName || typeof p.firstName !== 'string') {
          errors.push(`${prefix}.firstName is required`);
        }
        if (!p.lastName || typeof p.lastName !== 'string') {
          errors.push(`${prefix}.lastName is required`);
        }
        if (!p.dateOfBirth || !DATE_RE.test(p.dateOfBirth)) {
          errors.push(`${prefix}.dateOfBirth must be in YYYY-MM-DD format`);
        }
        if (!p.gender || !VALID_GENDERS.has(p.gender)) {
          errors.push(`${prefix}.gender must be male or female`);
        }
      }
    }

    if (errors.length > 0) {
      return reply.status(400).send({ error: 'Validation failed', details: errors });
    }

    try {
      const result = await bookingService.createBooking(
        body.offerId,
        body.passengers,
        body.email,
        body.phone,
      );

      return reply.send(result);
    } catch (err) {
      if (err instanceof OfferNotFoundError) {
        return reply.status(404).send({ error: err.message });
      }

      request.log.error({ err }, 'Booking failed');
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ error: 'Booking failed', message });
    }
  });
}
