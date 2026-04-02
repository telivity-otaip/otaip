/**
 * Generates an OpenAPI 3.1 spec from a ConnectAdapter.
 * The spec can be used as Custom GPT actions for ChatGPT.
 */

import type { ConnectAdapter, WhiteLabelConfig } from '../../types.js';

export interface OpenAPIGeneratorConfig {
  title: string;
  description?: string;
  version: string;
  serverUrl: string;
  contactName?: string;
  contactEmail?: string;
  logoUrl?: string;
  whiteLabel?: WhiteLabelConfig;
}

export function generateOpenAPISpec(
  adapter: ConnectAdapter,
  config: OpenAPIGeneratorConfig,
): Record<string, unknown> {
  const brand = config.whiteLabel?.brandName ?? config.title;
  const hasTicketing = adapter.requestTicketing !== undefined;
  const hasCancellation = adapter.cancelBooking !== undefined;

  const info: Record<string, unknown> = {
    title: config.title,
    description: config.description ?? `${brand} Flight Booking API`,
    version: config.version,
  };

  if (config.contactName || config.contactEmail) {
    info['contact'] = {
      ...(config.contactName && { name: config.contactName }),
      ...(config.contactEmail && { email: config.contactEmail }),
    };
  }

  if (config.logoUrl) {
    info['x-logo'] = { url: config.logoUrl };
  }

  // Build paths
  const paths: Record<string, Record<string, unknown>> = {};

  paths['/flights/search'] = {
    post: {
      operationId: 'searchFlights',
      summary: `Search for available flights`,
      description: `Search for flights by origin, destination, date, passengers, and cabin class.`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SearchFlightsInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'A list of matching flight offers',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/FlightOffer' },
              },
            },
          },
        },
      },
    },
  };

  paths['/flights/price'] = {
    post: {
      operationId: 'priceItinerary',
      summary: 'Get confirmed pricing for a flight offer',
      description: 'Verify and retrieve the latest price for a selected flight offer.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PriceItineraryInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Confirmed pricing details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PricedItinerary' },
            },
          },
        },
      },
    },
  };

  paths['/bookings'] = {
    post: {
      operationId: 'createBooking',
      summary: 'Create a flight booking',
      description: 'Create a booking with passenger details and contact information. The booking is placed on HOLD — payment is not charged immediately.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateBookingInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Booking confirmation with reference and payment details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BookingResult' },
            },
          },
        },
      },
    },
  };

  const bookingsIdPath: Record<string, unknown> = {
    get: {
      operationId: 'getBookingStatus',
      summary: 'Get booking status',
      description: 'Retrieve the current status and details of an existing booking.',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Booking reference ID',
        },
      ],
      responses: {
        '200': {
          description: 'Current booking status and details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BookingStatusResult' },
            },
          },
        },
      },
    },
  };

  if (hasCancellation) {
    bookingsIdPath['delete'] = {
      operationId: 'cancelBooking',
      summary: 'Cancel a booking',
      description: 'Cancel an existing booking by its reference ID.',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Booking reference ID',
        },
      ],
      responses: {
        '200': {
          description: 'Cancellation result',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CancelBookingResult' },
            },
          },
        },
      },
    };
  }

  paths['/bookings/{id}'] = bookingsIdPath;

  if (hasTicketing) {
    paths['/bookings/{id}/ticket'] = {
      post: {
        operationId: 'requestTicketing',
        summary: 'Request ticket issuance',
        description: 'Request ticket issuance for a confirmed and paid booking.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Booking reference ID',
          },
        ],
        responses: {
          '200': {
            description: 'Ticketing status with ticket numbers',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BookingStatusResult' },
              },
            },
          },
        },
      },
    };
  }

  paths['/health'] = {
    get: {
      operationId: 'healthCheck',
      summary: 'Health check',
      description: 'Check the availability and health of the flight booking service.',
      responses: {
        '200': {
          description: 'Service health status',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HealthCheckResult' },
            },
          },
        },
      },
    },
  };

  return {
    openapi: '3.1.0',
    info,
    servers: [{ url: config.serverUrl }],
    paths,
    components: {
      schemas: buildSchemas(),
    },
  };
}

function buildSchemas(): Record<string, Record<string, unknown>> {
  return {
    MoneyAmount: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Decimal amount as a string' },
        currency: { type: 'string', description: 'ISO 4217 currency code' },
      },
      required: ['amount', 'currency'],
    },

    PassengerCount: {
      type: 'object',
      properties: {
        adults: { type: 'integer', description: 'Number of adult passengers' },
        children: { type: 'integer', description: 'Number of child passengers' },
        childAges: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Ages of child passengers',
        },
        infants: { type: 'integer', description: 'Number of infant passengers' },
      },
      required: ['adults'],
    },

    SearchFlightsInput: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Departure airport IATA code (e.g. JFK)' },
        destination: { type: 'string', description: 'Arrival airport IATA code (e.g. LHR)' },
        departureDate: { type: 'string', description: 'Departure date (YYYY-MM-DD)' },
        returnDate: { type: 'string', description: 'Return date for round-trip (YYYY-MM-DD)' },
        passengers: { $ref: '#/components/schemas/PassengerCount' },
        cabinClass: {
          type: 'string',
          enum: ['economy', 'premium_economy', 'business', 'first'],
          description: 'Preferred cabin class',
        },
        directOnly: { type: 'boolean', description: 'Only return direct/non-stop flights' },
        preferredAirlines: {
          type: 'array',
          items: { type: 'string' },
          description: 'Preferred airline IATA codes',
        },
        currency: { type: 'string', description: 'Preferred currency (ISO 4217)' },
      },
      required: ['origin', 'destination', 'departureDate', 'passengers'],
    },

    PriceItineraryInput: {
      type: 'object',
      properties: {
        offerId: { type: 'string', description: 'The flight offer ID from search results' },
        passengers: { $ref: '#/components/schemas/PassengerCount' },
      },
      required: ['offerId', 'passengers'],
    },

    PassengerDetail: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['adult', 'child', 'infant'],
          description: 'Passenger type',
        },
        gender: { type: 'string', enum: ['M', 'F'], description: 'Passenger gender' },
        title: { type: 'string', description: 'Title (Mr, Mrs, Ms, etc.)' },
        firstName: { type: 'string', description: 'First name' },
        middleName: { type: 'string', description: 'Middle name' },
        lastName: { type: 'string', description: 'Last name' },
        dateOfBirth: { type: 'string', description: 'Date of birth (YYYY-MM-DD)' },
        passportNumber: { type: 'string', description: 'Passport number' },
        passportExpiry: { type: 'string', description: 'Passport expiry date (YYYY-MM-DD)' },
        passportCountry: {
          type: 'string',
          description: 'Passport issuing country (ISO 3166-1 alpha-2)',
        },
        nationality: { type: 'string', description: 'Nationality (ISO 3166-1 alpha-2)' },
      },
      required: ['type', 'gender', 'firstName', 'lastName', 'dateOfBirth'],
    },

    ContactInfo: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Contact email address' },
        phone: { type: 'string', description: 'Contact phone number' },
        alternatePhone: { type: 'string', description: 'Alternate phone number' },
      },
      required: ['email', 'phone'],
    },

    CreateBookingInput: {
      type: 'object',
      properties: {
        offerId: { type: 'string', description: 'The flight offer ID to book' },
        passengers: {
          type: 'array',
          items: { $ref: '#/components/schemas/PassengerDetail' },
          description: 'Passenger details for all travelers',
        },
        contact: { $ref: '#/components/schemas/ContactInfo' },
      },
      required: ['offerId', 'passengers', 'contact'],
    },

    FlightSegment: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Departure airport IATA code' },
        destination: { type: 'string', description: 'Arrival airport IATA code' },
        marketingCarrier: { type: 'string', description: 'Marketing carrier IATA code' },
        operatingCarrier: { type: 'string', description: 'Operating carrier IATA code' },
        flightNumber: { type: 'string', description: 'Flight number' },
        departure: { type: 'string', description: 'Departure datetime (ISO 8601)' },
        arrival: { type: 'string', description: 'Arrival datetime (ISO 8601)' },
        duration: { type: 'string', description: 'Flight duration' },
        cabinClass: { type: 'string', description: 'Cabin class' },
        bookingClass: { type: 'string', description: 'Booking class code' },
        fareBasisCode: { type: 'string', description: 'Fare basis code' },
        equipment: { type: 'string', description: 'Aircraft type' },
        stops: { type: 'integer', description: 'Number of stops' },
        stopLocations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stop location IATA codes',
        },
      },
      required: [
        'origin', 'destination', 'marketingCarrier', 'flightNumber',
        'departure', 'arrival', 'cabinClass', 'bookingClass', 'stops',
      ],
    },

    FareBreakdown: {
      type: 'object',
      properties: {
        passengerType: {
          type: 'string',
          enum: ['adult', 'child', 'infant'],
          description: 'Passenger type for this fare',
        },
        baseFare: { $ref: '#/components/schemas/MoneyAmount' },
        taxes: { $ref: '#/components/schemas/MoneyAmount' },
        fees: { $ref: '#/components/schemas/MoneyAmount' },
        total: { $ref: '#/components/schemas/MoneyAmount' },
        count: { type: 'integer', description: 'Number of passengers at this fare' },
      },
      required: ['passengerType', 'baseFare', 'taxes', 'total', 'count'],
    },

    FareRules: {
      type: 'object',
      properties: {
        refundable: { type: 'boolean', description: 'Whether the fare is refundable' },
        changeable: { type: 'boolean', description: 'Whether the fare allows changes' },
        refundPenalty: { $ref: '#/components/schemas/MoneyAmount' },
        changePenalty: { $ref: '#/components/schemas/MoneyAmount' },
        refundPolicy: { type: 'string', description: 'Refund policy text' },
        changePolicy: { type: 'string', description: 'Change policy text' },
        noShowPenalty: { $ref: '#/components/schemas/MoneyAmount' },
      },
      required: ['refundable', 'changeable'],
    },

    FlightOffer: {
      type: 'object',
      properties: {
        offerId: { type: 'string', description: 'Unique offer identifier' },
        supplier: { type: 'string', description: 'Supplier identifier' },
        validatingCarrier: { type: 'string', description: 'Validating carrier IATA code' },
        validatingCarrierName: { type: 'string', description: 'Validating carrier name' },
        segments: {
          type: 'array',
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/FlightSegment' },
          },
          description: 'Flight segments grouped by leg (outbound, return)',
        },
        fares: {
          type: 'array',
          items: { $ref: '#/components/schemas/FareBreakdown' },
          description: 'Fare breakdown by passenger type',
        },
        totalPrice: { $ref: '#/components/schemas/MoneyAmount' },
        fareType: {
          type: 'string',
          enum: ['published', 'negotiated', 'private', 'net'],
          description: 'Type of fare',
        },
        cabinClass: {
          type: 'string',
          enum: ['economy', 'premium_economy', 'business', 'first'],
          description: 'Cabin class',
        },
        refundable: { type: 'boolean', description: 'Whether the fare is refundable' },
        changeable: { type: 'boolean', description: 'Whether changes are allowed' },
        baggageAllowance: { type: 'string', description: 'Baggage allowance description' },
        expiresAt: { type: 'string', description: 'Offer expiration datetime (ISO 8601)' },
      },
      required: [
        'offerId', 'supplier', 'validatingCarrier', 'segments', 'fares',
        'totalPrice', 'fareType', 'cabinClass', 'refundable', 'changeable',
      ],
    },

    PricedItinerary: {
      type: 'object',
      properties: {
        offerId: { type: 'string', description: 'The offer ID that was priced' },
        supplier: { type: 'string', description: 'Supplier identifier' },
        totalPrice: { $ref: '#/components/schemas/MoneyAmount' },
        fares: {
          type: 'array',
          items: { $ref: '#/components/schemas/FareBreakdown' },
        },
        fareRules: { $ref: '#/components/schemas/FareRules' },
        priceChanged: { type: 'boolean', description: 'Whether the price changed since search' },
        available: { type: 'boolean', description: 'Whether the itinerary is still available' },
      },
      required: ['offerId', 'supplier', 'totalPrice', 'fares', 'fareRules', 'priceChanged', 'available'],
    },

    BookingStatus: {
      type: 'string',
      enum: ['held', 'payment_pending', 'confirmed', 'ticketed', 'cancelled', 'failed'],
      description: 'Current booking status',
    },

    BookingResult: {
      type: 'object',
      properties: {
        bookingId: { type: 'string', description: 'Booking reference ID' },
        supplier: { type: 'string', description: 'Supplier identifier' },
        status: { $ref: '#/components/schemas/BookingStatus' },
        paymentLink: { type: 'string', description: 'URL for payment completion' },
        paymentDeadline: { type: 'string', description: 'Payment deadline (ISO 8601)' },
        pnr: { type: 'string', description: 'Passenger Name Record locator' },
        segments: {
          type: 'array',
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/FlightSegment' },
          },
        },
        passengers: {
          type: 'array',
          items: { $ref: '#/components/schemas/PassengerDetail' },
        },
        totalPrice: { $ref: '#/components/schemas/MoneyAmount' },
      },
      required: ['bookingId', 'supplier', 'status', 'segments', 'passengers', 'totalPrice'],
    },

    BookingStatusResult: {
      type: 'object',
      properties: {
        bookingId: { type: 'string', description: 'Booking reference ID' },
        supplier: { type: 'string', description: 'Supplier identifier' },
        status: { $ref: '#/components/schemas/BookingStatus' },
        pnr: { type: 'string', description: 'Passenger Name Record locator' },
        airlinePnr: { type: 'string', description: 'Airline-specific PNR' },
        ticketNumbers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Issued ticket numbers',
        },
        segments: {
          type: 'array',
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/FlightSegment' },
          },
        },
        passengers: {
          type: 'array',
          items: { $ref: '#/components/schemas/PassengerDetail' },
        },
        totalPrice: { $ref: '#/components/schemas/MoneyAmount' },
      },
      required: ['bookingId', 'supplier', 'status', 'segments', 'passengers', 'totalPrice'],
    },

    CancelBookingResult: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the cancellation succeeded' },
        message: { type: 'string', description: 'Cancellation status message' },
      },
      required: ['success', 'message'],
    },

    HealthCheckResult: {
      type: 'object',
      properties: {
        healthy: { type: 'boolean', description: 'Whether the service is healthy' },
        latencyMs: { type: 'number', description: 'Response latency in milliseconds' },
      },
      required: ['healthy', 'latencyMs'],
    },
  };
}
