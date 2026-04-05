/**
 * Minimal type declarations for the `amadeus` Node.js SDK (v11).
 *
 * The official SDK does not ship TypeScript types. These declarations
 * cover only the methods used by AmadeusAdapter.
 */

declare module 'amadeus' {
  interface AmadeusOptions {
    clientId: string;
    clientSecret: string;
    hostname?: string;
    logLevel?: 'silent' | 'warn' | 'debug';
  }

  interface AmadeusResponse {
    data: unknown;
    result: Record<string, unknown>;
    body: string | null;
  }

  interface FlightOffersSearchApi {
    get(params: Record<string, string>): Promise<AmadeusResponse>;
    post(body: string): Promise<AmadeusResponse>;
  }

  interface FlightOffersPricingApi {
    post(body: string, params?: Record<string, string>): Promise<AmadeusResponse>;
  }

  interface FlightOffersApi {
    pricing: FlightOffersPricingApi;
  }

  interface ShoppingApi {
    flightOffersSearch: FlightOffersSearchApi;
    flightOffers: FlightOffersApi;
  }

  interface FlightOrderApi {
    get(): Promise<AmadeusResponse>;
    delete(): Promise<AmadeusResponse>;
  }

  interface FlightOrdersApi {
    post(body: string): Promise<AmadeusResponse>;
    (orderId: string): FlightOrderApi;
  }

  interface BookingApi {
    flightOrders: FlightOrdersApi;
  }

  class Amadeus {
    constructor(options: AmadeusOptions);
    shopping: ShoppingApi;
    booking: BookingApi;
  }

  export default Amadeus;
}
