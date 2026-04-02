/**
 * Navitaire (New Skies / dotREZ) supplier adapter for @otaip/connect.
 *
 * Maps the Navitaire Digital API v4.7 to the ConnectAdapter interface.
 *
 * CRITICAL DIFFERENCE FROM SABRE: Navitaire is session-stateful.
 * Booking operations build up server-side state through a multi-step flow,
 * then commit. The adapter manages this session lifecycle internally and
 * presents a clean stateless interface to consumers via ConnectAdapter.
 *
 * Auth: JWT with auto-refresh.
 * Session: Locked sequential operations via NavitaireSessionManager.
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
import { NavitaireAuth } from './auth.js';
import type { NavitaireConfig } from './config.js';
import { validateNavitaireConfig } from './config.js';
import {
  mapCancelResponse,
  mapCreateBookingResponse,
  mapGetBookingResponse,
  mapNavitaireErrorCode,
  mapPassengersRequest,
  mapPaymentRequest,
  mapPrimaryContactRequest,
  mapPriceResponse,
  mapSearchRequest,
  mapSearchResponse,
  mapTicketingResponse,
  mapTripSellRequest,
} from './mapper.js';
import { NavitaireSessionManager } from './session.js';
import type {
  AvailabilityResponse,
  BookingCommitResponse,
  BookingData,
  BookingPriceResponse,
  BookingRetrieveResponse,
  ETicketIssueResponse,
  ETicketValidationResponse,
  NavitaireError,
  NavitaireHealthResponse,
  TripSellResponse,
} from './types.js';

export class NavitaireAdapter extends BaseAdapter implements ConnectAdapter {
  readonly supplierId = 'navitaire';
  readonly supplierName = 'Navitaire (New Skies / dotREZ)';
  private readonly config: NavitaireConfig;
  private readonly session: NavitaireSessionManager;
  private readonly baseUrl: string;

  constructor(config: unknown) {
    super();
    this.config = validateNavitaireConfig(config);
    const auth = new NavitaireAuth(this.config);
    this.session = new NavitaireSessionManager(auth);
    this.baseUrl = this.config.baseUrl;
  }

  // ============================================================
  // searchFlights — Stateless availability search
  // ============================================================

  async searchFlights(input: SearchFlightsInput): Promise<FlightOffer[]> {
    return this.withRetry('searchFlights', async () => {
      const body = mapSearchRequest(input, this.config);
      const currency = input.currency ?? this.config.defaultCurrencyCode;

      const response = await this.session.withSession(async (token) => {
        return this.navitaireRequest<AvailabilityResponse>(
          'POST',
          `${this.baseUrl}/api/nsk/v4/availability/search`,
          token,
          body,
          'searchFlights',
        );
      });

      return mapSearchResponse(response, currency);
    });
  }

  // ============================================================
  // priceItinerary — 2-step stateful: sell + price
  // ============================================================

  async priceItinerary(
    offerId: string,
    passengers: PassengerCount,
  ): Promise<PricedItinerary> {
    return this.withRetry('priceItinerary', async () => {
      const { journeyKey, fareAvailabilityKey } = parseOfferId(offerId);
      const currency = this.config.defaultCurrencyCode;

      return this.session.withStatefulFlow(async (token) => {
        // Step 1: Sell journey into booking state
        const sellBody = mapTripSellRequest(journeyKey, fareAvailabilityKey, currency);
        await this.navitaireRequest<TripSellResponse>(
          'POST',
          `${this.baseUrl}/api/nsk/v4/trip/sell`,
          token,
          sellBody,
          'priceItinerary:sell',
        );

        // Step 2: Price the booking in state
        const priceResponse = await this.navitaireRequest<BookingPriceResponse>(
          'PUT',
          `${this.baseUrl}/api/nsk/v1/booking/price`,
          token,
          { currencyCode: currency },
          'priceItinerary:price',
        );

        return mapPriceResponse(priceResponse, offerId, currency);
      });
    });
  }

  // ============================================================
  // createBooking — 5-step stateful flow
  // ============================================================

  async createBooking(input: CreateBookingInput): Promise<BookingResult> {
    return this.withRetry('createBooking', async () => {
      const { journeyKey, fareAvailabilityKey } = parseOfferId(input.offerId);
      const currency = this.config.defaultCurrencyCode;

      return this.session.withStatefulFlow(async (token) => {
        // Step 1: Sell journey into state
        const sellBody = mapTripSellRequest(journeyKey, fareAvailabilityKey, currency);
        const sellResponse = await this.navitaireRequest<TripSellResponse>(
          'POST',
          `${this.baseUrl}/api/nsk/v4/trip/sell`,
          token,
          sellBody,
          'createBooking:sell',
        );

        // Extract passenger keys from sell response
        const passengerKeys = sellResponse.data?.passengers
          ? Object.keys(sellResponse.data.passengers)
          : input.passengers.map((_, i) => `P${i}`);

        // Step 2: Add passengers
        const passengersBody = mapPassengersRequest(input.passengers, passengerKeys);
        await this.navitaireRequest<unknown>(
          'POST',
          `${this.baseUrl}/api/nsk/v1/trip/passengers`,
          token,
          passengersBody,
          'createBooking:passengers',
        );

        // Step 3: Add primary contact
        const contactBody = mapPrimaryContactRequest(input);
        await this.navitaireRequest<unknown>(
          'POST',
          `${this.baseUrl}/api/nsk/v1/booking/contacts/primary`,
          token,
          contactBody,
          'createBooking:contact',
        );

        // Step 4: Add payment (agency payment hold)
        const bookingState = await this.navitaireRequest<BookingData>(
          'GET',
          `${this.baseUrl}/api/nsk/v1/booking`,
          token,
          undefined,
          'createBooking:getState',
        );

        const totalAmount = bookingState?.breakdown?.balanceDue
          ?? bookingState?.breakdown?.totalAmount
          ?? 0;

        const paymentBody = mapPaymentRequest(totalAmount, currency);
        await this.navitaireRequest<unknown>(
          'POST',
          `${this.baseUrl}/api/nsk/v5/booking/payments`,
          token,
          paymentBody,
          'createBooking:payment',
        );

        // Step 5: Commit booking (creates PNR)
        const commitResponse = await this.navitaireRequest<BookingCommitResponse>(
          'POST',
          `${this.baseUrl}/api/nsk/v3/booking`,
          token,
          {},
          'createBooking:commit',
        );

        // If PNR not in commit response, retrieve it
        let bookingData = commitResponse.data?.booking;
        if (!commitResponse.data?.recordLocator && !bookingData?.recordLocator) {
          const retrieved = await this.navitaireRequest<BookingData>(
            'GET',
            `${this.baseUrl}/api/nsk/v1/booking`,
            token,
            undefined,
            'createBooking:retrieve',
          );
          bookingData = retrieved;
        }

        return mapCreateBookingResponse(
          commitResponse.data,
          bookingData,
          input.passengers,
          currency,
        );
      });
    });
  }

  // ============================================================
  // getBookingStatus — Retrieve by record locator
  // ============================================================

  async getBookingStatus(bookingId: string): Promise<BookingStatusResult> {
    return this.withRetry('getBookingStatus', async () => {
      const currency = this.config.defaultCurrencyCode;

      return this.session.withSession(async (token) => {
        const response = await this.navitaireRequest<BookingRetrieveResponse>(
          'GET',
          `${this.baseUrl}/api/nsk/v1/booking/retrieve/byRecordLocator/${encodeURIComponent(bookingId)}`,
          token,
          undefined,
          'getBookingStatus',
        );

        return mapGetBookingResponse(response.data, bookingId, currency);
      });
    });
  }

  // ============================================================
  // requestTicketing — Validate + issue e-tickets
  // ============================================================

  async requestTicketing(bookingId: string): Promise<BookingStatusResult> {
    return this.withRetry('requestTicketing', async () => {
      const currency = this.config.defaultCurrencyCode;

      return this.session.withStatefulFlow(async (token) => {
        // Retrieve booking into state
        const retrieveResponse = await this.navitaireRequest<BookingRetrieveResponse>(
          'GET',
          `${this.baseUrl}/api/nsk/v1/booking/retrieve/byRecordLocator/${encodeURIComponent(bookingId)}`,
          token,
          undefined,
          'requestTicketing:retrieve',
        );

        // Step 1: Validate for ticketing
        const validation = await this.navitaireRequest<ETicketValidationResponse>(
          'GET',
          `${this.baseUrl}/api/nsk/v1/booking/eTickets/validation`,
          token,
          undefined,
          'requestTicketing:validate',
        );

        if (validation.valid === false) {
          const messages = (validation.validationMessages ?? [])
            .map((m) => m.message ?? m.code ?? 'Unknown validation error')
            .join('; ');
          throw new ConnectError(
            `Ticketing validation failed: ${messages}`,
            this.supplierId,
            'requestTicketing',
            false,
          );
        }

        // Step 2: Issue e-tickets
        const ticketResponse = await this.navitaireRequest<ETicketIssueResponse>(
          'POST',
          `${this.baseUrl}/api/nsk/v1/booking/eTickets`,
          token,
          {},
          'requestTicketing:issue',
        );

        const ticketNumbers = (ticketResponse.data?.tickets ?? [])
          .map((t) => t.ticketNumber)
          .filter((n): n is string => !!n);

        return mapTicketingResponse(
          retrieveResponse.data,
          bookingId,
          ticketNumbers,
          currency,
        );
      });
    });
  }

  // ============================================================
  // cancelBooking — Multi-step: retrieve + cancel journeys + commit
  // ============================================================

  async cancelBooking(
    bookingId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.withRetry('cancelBooking', async () => {
      return this.session.withStatefulFlow(async (token) => {
        // Step 1: Retrieve booking into state
        const retrieveResponse = await this.navitaireRequest<BookingRetrieveResponse>(
          'GET',
          `${this.baseUrl}/api/nsk/v1/booking/retrieve/byRecordLocator/${encodeURIComponent(bookingId)}`,
          token,
          undefined,
          'cancelBooking:retrieve',
        );

        const bookingData = retrieveResponse.data;
        if (!bookingData?.journeys?.length) {
          return mapCancelResponse(false, bookingId, 'No journeys found to cancel');
        }

        // Step 2: Cancel each journey
        for (const journey of bookingData.journeys) {
          await this.navitaireRequest<unknown>(
            'DELETE',
            `${this.baseUrl}/api/nsk/v1/booking/journeys/${encodeURIComponent(journey.journeyKey)}`,
            token,
            undefined,
            'cancelBooking:cancelJourney',
          );
        }

        // Step 3: Commit changes
        await this.navitaireRequest<BookingCommitResponse>(
          'POST',
          `${this.baseUrl}/api/nsk/v3/booking`,
          token,
          {},
          'cancelBooking:commit',
        );

        return mapCancelResponse(true, bookingId);
      });
    });
  }

  // ============================================================
  // healthCheck
  // ============================================================

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.session.withSession(async (token) => {
        return this.navitaireRequest<NavitaireHealthResponse>(
          'GET',
          `${this.baseUrl}/api/nsk/v1/health`,
          token,
          undefined,
          'healthCheck',
        );
      });
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private async navitaireRequest<T>(
    method: string,
    url: string,
    token: string,
    body: unknown | undefined,
    operation: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const init: RequestInit = { method, headers };
    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
      init.body = JSON.stringify(body);
    }

    const response = await this.fetchWithTimeout(url, init);

    if (response.status === 401) {
      this.session.invalidateToken();
      throw new ConnectError(
        `${operation}: Authentication failed (401)`,
        this.supplierId,
        operation,
        true,
      );
    }

    if (response.status === 429) {
      throw new ConnectError(
        `${operation}: Rate limited (429)`,
        this.supplierId,
        operation,
        true,
      );
    }

    if (!response.ok) {
      let errorMessage = `${operation} failed: ${response.status} ${response.statusText}`;
      try {
        const errorBody = (await response.json()) as { errors?: NavitaireError[] };
        if (errorBody.errors?.length) {
          const navError = errorBody.errors[0];
          const errorCode = mapNavitaireErrorCode(navError?.code);
          errorMessage = `${operation}: [${errorCode}] ${navError?.message ?? errorMessage}`;
        }
      } catch {
        // Could not parse error body — use default message
      }

      throw new ConnectError(
        errorMessage,
        this.supplierId,
        operation,
        response.status >= 500,
      );
    }

    // Some endpoints return empty body (204 No Content)
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }
}

// ============================================================
// OFFER ID PARSING
// ============================================================

function parseOfferId(offerId: string): {
  journeyKey: string;
  fareAvailabilityKey: string;
} {
  // Format: navitaire-{journeyKey}-{fareAvailabilityKey}
  const prefix = 'navitaire-';
  if (!offerId.startsWith(prefix)) {
    throw new ConnectError(
      `Invalid Navitaire offer ID format: ${offerId}`,
      'navitaire',
      'parseOfferId',
      false,
    );
  }

  const rest = offerId.slice(prefix.length);
  const lastDash = rest.lastIndexOf('-');

  if (lastDash === -1) {
    throw new ConnectError(
      `Invalid Navitaire offer ID format: ${offerId}`,
      'navitaire',
      'parseOfferId',
      false,
    );
  }

  return {
    journeyKey: rest.slice(0, lastDash),
    fareAvailabilityKey: rest.slice(lastDash + 1),
  };
}
