/**
 * Sabre GDS supplier adapter for @otaip/connect.
 *
 * Maps two Sabre APIs to the ConnectAdapter interface:
 *   - Bargain Finder Max v5 (flight search + price verification)
 *   - Booking Management API v1 (booking lifecycle)
 *
 * Auth: OAuth2 client_credentials (stateless ATK tokens).
 * All endpoints are POST with JSON bodies.
 */

import { BaseAdapter, ConnectError } from '../../base-adapter.js';
import type {
  BookingResult,
  BookingStatusResult,
  ConnectAdapter,
  CreateBookingInput,
  FlightOffer,
  PassengerCount,
  PricedItinerary,
  SearchFlightsInput,
} from '../../types.js';
import { SabreAuth } from './auth.js';
import type { SabreConfig } from './config.js';
import { getBaseUrl, validateSabreConfig } from './config.js';
import {
  mapCancelResponse,
  mapCreateBookingRequest,
  mapCreateBookingResponse,
  mapFulfillResponse,
  mapGetBookingResponse,
  mapPriceResponse,
  mapSearchRequest,
  mapSearchResponse,
} from './mapper.js';
import type {
  BfmResponse,
  SabreCancelBookingResponse,
  SabreCreateBookingResponse,
  SabreFulfillTicketsResponse,
  SabreGetBookingResponse,
} from './types.js';

export class SabreAdapter extends BaseAdapter implements ConnectAdapter {
  readonly supplierId = 'sabre';
  readonly supplierName = 'Sabre GDS';
  private readonly config: SabreConfig;
  private readonly auth: SabreAuth;
  private readonly baseUrl: string;

  constructor(config: unknown) {
    super();
    this.config = validateSabreConfig(config);
    this.auth = new SabreAuth(this.config);
    this.baseUrl = getBaseUrl(this.config.environment);
  }

  async searchFlights(input: SearchFlightsInput): Promise<FlightOffer[]> {
    return this.withRetry('searchFlights', async () => {
      const body = mapSearchRequest(input, this.config);

      const response = await this.sabrePost<BfmResponse>(
        `${this.baseUrl}/v5/offers/shop`,
        body,
        'searchFlights',
      );

      return mapSearchResponse(response);
    });
  }

  async priceItinerary(offerId: string, passengers: PassengerCount): Promise<PricedItinerary> {
    return this.withRetry('priceItinerary', async () => {
      const searchInput: SearchFlightsInput = {
        origin: '',
        destination: '',
        departureDate: '',
        passengers,
      };

      const body = mapSearchRequest(searchInput, this.config);

      body.OTA_AirLowFareSearchRQ.TPA_Extensions = {
        IntelliSellTransaction: {
          RequestType: { Name: 'REVALIDATE' },
        },
      };

      const response = await this.sabrePost<BfmResponse>(
        `${this.baseUrl}/v5/offers/shop`,
        body,
        'priceItinerary',
      );

      return mapPriceResponse(response, offerId);
    });
  }

  async createBooking(input: CreateBookingInput): Promise<BookingResult> {
    return this.withRetry('createBooking', async () => {
      const body = mapCreateBookingRequest(input);

      const response = await this.sabrePost<SabreCreateBookingResponse>(
        `${this.baseUrl}/v1/trip/orders/createBooking`,
        body,
        'createBooking',
      );

      if (response.errors?.length) {
        const errorText = response.errors
          .map((e) => e.description ?? e.message ?? e.code ?? 'Unknown error')
          .join('; ');
        throw new ConnectError(
          `Booking error: ${errorText}`,
          this.supplierId,
          'createBooking',
          false,
        );
      }

      return mapCreateBookingResponse(response);
    });
  }

  async getBookingStatus(bookingId: string): Promise<BookingStatusResult> {
    return this.withRetry('getBookingStatus', async () => {
      const body = {
        confirmationId: bookingId,
        returnOnly: [
          'FLIGHTS',
          'TRAVELERS',
          'TICKETS',
          'CONTACT_INFO',
          'FARES',
          'CREATION_DETAILS',
        ],
      };

      const response = await this.sabrePost<SabreGetBookingResponse>(
        `${this.baseUrl}/v1/trip/orders/getBooking`,
        body,
        'getBookingStatus',
      );

      return mapGetBookingResponse(response, bookingId);
    });
  }

  async requestTicketing(bookingId: string): Promise<BookingStatusResult> {
    return this.withRetry('requestTicketing', async () => {
      const body = {
        confirmationId: bookingId,
        fulfillments: [
          {
            flightTicketType: 'ELECTRONIC',
          },
        ],
        formsOfPayment: [{ type: 'CASH' as const }],
        acceptPriceChanges: true,
        receivedFrom: 'OTAIP Connect',
      };

      const response = await this.sabrePost<SabreFulfillTicketsResponse>(
        `${this.baseUrl}/v1/trip/orders/fulfillFlightTickets`,
        body,
        'requestTicketing',
      );

      if (response.errors?.length) {
        const errorText = response.errors
          .map((e) => e.description ?? e.message ?? e.code ?? 'Unknown error')
          .join('; ');
        throw new ConnectError(
          `Ticketing error: ${errorText}`,
          this.supplierId,
          'requestTicketing',
          false,
        );
      }

      return mapFulfillResponse(response, bookingId);
    });
  }

  async cancelBooking(bookingId: string): Promise<{ success: boolean; message: string }> {
    return this.withRetry('cancelBooking', async () => {
      const body = {
        confirmationId: bookingId,
        cancelAll: true,
        retrieveBooking: false,
        receivedFrom: 'OTAIP Connect',
      };

      const response = await this.sabrePost<SabreCancelBookingResponse>(
        `${this.baseUrl}/v1/trip/orders/cancelBooking`,
        body,
        'cancelBooking',
      );

      return mapCancelResponse(response, bookingId);
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const token = await this.auth.getToken();
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/trip/orders/getBooking`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ confirmationId: 'HEALTH' }),
        },
        5_000,
      );
      return {
        healthy: response.status !== 503,
        latencyMs: Date.now() - start,
      };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private async sabrePost<T>(url: string, body: unknown, operation: string): Promise<T> {
    const token = await this.auth.getToken();

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      this.auth.invalidate();
      throw new ConnectError(
        `${operation}: Authentication failed (401)`,
        this.supplierId,
        operation,
        true,
      );
    }

    if (!response.ok) {
      throw new ConnectError(
        `${operation} failed: ${response.status} ${response.statusText}`,
        this.supplierId,
        operation,
        response.status >= 500,
      );
    }

    return (await response.json()) as T;
  }
}
