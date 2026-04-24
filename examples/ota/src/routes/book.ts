/**
 * POST /api/book — create a booking for a searched offer.
 */

import type { FastifyInstance } from 'fastify';
import type { BookingService } from '../services/booking-service.js';
import {
  AdapterNotBookableError,
  OfferNotFoundError,
} from '../services/booking-service.js';
import type { PaymentService } from '../services/payment-service.js';
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

const BOOK_BODY_SCHEMA = {
  type: 'object',
  required: ['offerId', 'passengers', 'email', 'phone'],
  additionalProperties: false,
  properties: {
    offerId: { type: 'string', minLength: 1, maxLength: 200 },
    email: { type: 'string', format: 'email', maxLength: 254 },
    phone: { type: 'string', minLength: 6, maxLength: 20 },
    passengers: {
      type: 'array',
      minItems: 1,
      maxItems: 9,
      items: {
        type: 'object',
        required: ['title', 'firstName', 'lastName', 'dateOfBirth', 'gender'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', enum: ['mr', 'ms', 'mrs', 'miss', 'dr'] },
          firstName: { type: 'string', minLength: 1, maxLength: 60 },
          lastName: { type: 'string', minLength: 1, maxLength: 60 },
          dateOfBirth: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          gender: { type: 'string', enum: ['male', 'female'] },
        },
      },
    },
  },
} as const;

export function registerBookRoute(
  app: FastifyInstance,
  bookingService: BookingService,
  paymentService?: PaymentService,
): void {
  app.post<{ Body: BookBody }>(
    '/api/book',
    {
      schema: { body: BOOK_BODY_SCHEMA },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
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

      // When Stripe is wired in, create the PaymentIntent now so the
      // frontend can collect the card with the returned client_secret.
      if (paymentService?.usesStripe) {
        try {
          const intent = await paymentService.createIntent(result.bookingReference);
          if (intent.clientSecret) result.clientSecret = intent.clientSecret;
          if (intent.paymentIntentId) result.paymentIntentId = intent.paymentIntentId;
        } catch (piErr) {
          // Booking succeeded; intent creation failed. Surface as a warning
          // so the caller can retry via the pay route rather than failing
          // the whole booking.
          request.log.warn({ piErr }, 'PaymentIntent creation failed after booking');
        }
      }

      return reply.send(result);
    } catch (err) {
      if (err instanceof OfferNotFoundError) {
        return reply.status(404).send({ error: err.message });
      }

      if (err instanceof AdapterNotBookableError) {
        // 409 Conflict: the request is syntactically valid but the offer's
        // source channel cannot fulfill it. Surfaces the adapter name so the
        // client can pick a different offer.
        return reply
          .status(409)
          .send({ error: err.message, adapterSource: err.adapterSource });
      }

      request.log.error({ err }, 'Booking failed');
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ error: 'Booking failed', message });
    }
  },
  );
}
