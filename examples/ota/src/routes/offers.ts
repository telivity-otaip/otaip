/**
 * GET /api/offers/:id — retrieve offer details by ID.
 */

import type { FastifyInstance } from 'fastify';
import type { OfferService } from '../services/offer-service.js';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerOffersRoute(
  app: FastifyInstance,
  offerService: OfferService,
): void {
  app.get<{ Params: { id: string } }>('/api/offers/:id', async (request, reply) => {
    const { id } = request.params;

    const details = offerService.getOfferDetails(id);

    if (!details) {
      return reply.status(404).send({ error: `Offer not found: ${id}` });
    }

    return reply.send(details);
  });
}
