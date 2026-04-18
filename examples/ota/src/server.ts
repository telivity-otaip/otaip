/**
 * OTAIP Reference OTA — Fastify server.
 *
 * A reference flight booking application that proves OTAIP works end to end.
 * Sprint E: search + offer details.
 * Sprint F: booking, payment, ticketing, and management.
 */

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createAdapter, createMultiAdapter } from './config/adapters.js';
import type { OtaAdapter } from './types.js';
import type { MockOtaAdapter } from './mock-ota-adapter.js';
import { SearchService } from './services/search-service.js';
import { MultiSearchService } from './services/multi-search-service.js';
import { OfferService } from './services/offer-service.js';
import { BookingService } from './services/booking-service.js';
import { PaymentService } from './services/payment-service.js';
import { TicketingService } from './services/ticketing-service.js';
import { ManageService } from './services/manage-service.js';
import { registerSearchRoute } from './routes/search.js';
import { registerOffersRoute } from './routes/offers.js';
import { registerHealthRoute } from './routes/health.js';
import { registerBookRoute } from './routes/book.js';
import { registerPayRoute } from './routes/pay.js';
import { registerTicketRoute } from './routes/ticket.js';
import { registerManageRoutes } from './routes/manage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// App factory (exported for testing)
// ---------------------------------------------------------------------------

export interface BuildAppOptions {
  /** Override the adapter (useful for testing with MockOtaAdapter). */
  adapter?: OtaAdapter;
  /** Whether to initialize the airport resolver. Defaults to true. */
  initResolver?: boolean;
  /**
   * Override the multi-search service (useful for testing).
   * If not provided, one is constructed from `createMultiAdapter()` iff the
   * `ADAPTERS` env var is set. When neither is present, the ?multi=true
   * branch stays unreachable and single-adapter search is used exclusively.
   */
  multiSearch?: MultiSearchService;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const adapter = options.adapter ?? createAdapter();
  const multiSearch =
    options.multiSearch ??
    (process.env['ADAPTERS']
      ? new MultiSearchService({ adapters: createMultiAdapter() })
      : undefined);

  const app = Fastify({ logger: true });

  // Serve static frontend files
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/',
  });

  // Build services
  const searchService = new SearchService(adapter);
  const offerService = new OfferService(searchService);
  const bookingService = new BookingService(adapter as MockOtaAdapter, searchService);
  const paymentService = new PaymentService(adapter as MockOtaAdapter);
  const ticketingService = new TicketingService(adapter as MockOtaAdapter);
  const manageService = new ManageService(adapter as MockOtaAdapter);

  // Optionally initialize airport code resolver
  if (options.initResolver !== false) {
    await searchService.initializeResolver();
  }

  // Register routes — Sprint E
  registerSearchRoute(app, searchService, multiSearch);
  registerOffersRoute(app, offerService);
  registerHealthRoute(app, adapter);

  // Register routes — Sprint F
  registerBookRoute(app, bookingService);
  registerPayRoute(app, paymentService);
  registerTicketRoute(app, ticketingService);
  registerManageRoutes(app, manageService);

  return app;
}

// ---------------------------------------------------------------------------
// Start server (only when run directly, not imported)
// ---------------------------------------------------------------------------

const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isMainModule) {
  const port = Number(process.env['PORT'] ?? 3000);

  const app = await buildApp();

  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`\n  OTAIP Reference OTA running at http://localhost:${port}\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
