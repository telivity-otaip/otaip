/**
 * POST /api/search — flight search endpoint.
 *
 * Sprint H: supports optional MultiSearchService for multi-adapter search.
 * When multiSearch is provided, results include per-source attribution.
 */

import type { FastifyInstance } from 'fastify';
import type { SearchRequest } from '@otaip/core';
import type { SearchService } from '../services/search-service.js';
import type { MultiSearchService } from '../services/multi-search-service.js';

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

interface SearchBody {
  origin: string;
  destination: string;
  date: string;
  returnDate?: string;
  passengers: number;
  cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
}

const IATA_CODE_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CABINS = new Set(['economy', 'premium_economy', 'business', 'first']);

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

const SEARCH_BODY_SCHEMA = {
  type: 'object',
  required: ['origin', 'destination', 'date', 'passengers'],
  additionalProperties: false,
  properties: {
    origin: { type: 'string', pattern: '^[A-Za-z]{3}$' },
    destination: { type: 'string', pattern: '^[A-Za-z]{3}$' },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    returnDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    passengers: { type: 'integer', minimum: 1, maximum: 9 },
    cabinClass: { type: 'string', enum: ['economy', 'premium_economy', 'business', 'first'] },
  },
} as const;

export function registerSearchRoute(
  app: FastifyInstance,
  searchService: SearchService,
  multiSearch?: MultiSearchService,
): void {
  app.post<{ Body: SearchBody }>(
    '/api/search',
    { schema: { body: SEARCH_BODY_SCHEMA } },
    async (request, reply) => {
    const body = request.body as SearchBody | undefined;

    if (!body) {
      return reply.status(400).send({ error: 'Request body is required' });
    }

    // Validate required fields
    const errors: string[] = [];

    if (!body.origin || typeof body.origin !== 'string') {
      errors.push('origin is required and must be a string');
    } else if (!IATA_CODE_RE.test(body.origin.toUpperCase())) {
      errors.push('origin must be a 3-letter IATA airport code');
    }

    if (!body.destination || typeof body.destination !== 'string') {
      errors.push('destination is required and must be a string');
    } else if (!IATA_CODE_RE.test(body.destination.toUpperCase())) {
      errors.push('destination must be a 3-letter IATA airport code');
    }

    if (!body.date || typeof body.date !== 'string') {
      errors.push('date is required and must be a string');
    } else if (!DATE_RE.test(body.date)) {
      errors.push('date must be in YYYY-MM-DD format');
    }

    if (body.returnDate !== undefined && body.returnDate !== null) {
      if (typeof body.returnDate !== 'string' || !DATE_RE.test(body.returnDate)) {
        errors.push('returnDate must be in YYYY-MM-DD format');
      }
    }

    if (body.passengers === undefined || body.passengers === null) {
      errors.push('passengers is required');
    } else if (typeof body.passengers !== 'number' || body.passengers < 1 || body.passengers > 9) {
      errors.push('passengers must be a number between 1 and 9');
    }

    if (body.cabinClass !== undefined && !VALID_CABINS.has(body.cabinClass)) {
      errors.push('cabinClass must be one of: economy, premium_economy, business, first');
    }

    if (errors.length > 0) {
      return reply.status(400).send({ error: 'Validation failed', details: errors });
    }

    try {
      // Sprint H: if multi-adapter is configured and query param requests it,
      // use the multi-search service for aggregated results.
      if (multiSearch && request.query && (request.query as Record<string, string>)['multi'] === 'true') {
        const origin = body.origin.toUpperCase();
        const destination = body.destination.toUpperCase();
        const multiRequest: SearchRequest = {
          segments: [
            { origin, destination, departure_date: body.date },
          ],
          passengers: [{ type: 'ADT', count: body.passengers }],
          cabin_class: body.cabinClass,
        };
        // Forward full round-trip — multi path must not drop the return leg.
        if (body.returnDate) {
          multiRequest.segments.push({
            origin: destination,
            destination: origin,
            departure_date: body.returnDate,
          });
        }
        const multiResult = await multiSearch.search(multiRequest);
        // Cache offers so GET /api/offers/:id and BookingService can find them.
        searchService.cacheOffers(multiResult.offers);
        return reply.send(multiResult);
      }

      const result = await searchService.search({
        origin: body.origin.toUpperCase(),
        destination: body.destination.toUpperCase(),
        date: body.date,
        returnDate: body.returnDate,
        passengers: body.passengers,
        cabinClass: body.cabinClass,
      });

      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      if (message.startsWith('Invalid airport')) {
        return reply.status(400).send({ error: message });
      }

      request.log.error({ err }, 'Search failed');
      return reply.status(500).send({ error: 'Search failed', message });
    }
  },
  );
}
