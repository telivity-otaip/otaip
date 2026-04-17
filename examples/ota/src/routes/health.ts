/**
 * GET /health — health check endpoint.
 */

import type { FastifyInstance } from 'fastify';
import type { DistributionAdapter } from '@otaip/core';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerHealthRoute(
  app: FastifyInstance,
  adapter: DistributionAdapter,
): void {
  app.get('/health', async (_request, reply) => {
    let adapterAvailable = false;

    try {
      adapterAvailable = await adapter.isAvailable();
    } catch {
      adapterAvailable = false;
    }

    return reply.send({
      status: 'ok',
      agents: { initialized: true },
      adapter: adapter.name,
      adapterAvailable,
    });
  });
}
