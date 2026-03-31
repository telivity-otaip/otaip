/**
 * Itinerary Delivery — Types
 *
 * Agent 4.4: Multi-channel itinerary rendering and delivery.
 */

export type DeliveryChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface ItineraryFlight {
  /** Flight number (e.g. "BA115") */
  flight: string;
  /** Origin airport code */
  origin: string;
  /** Destination airport code */
  destination: string;
  /** Departure date (ISO) */
  departure_date: string;
  /** Departure time (HH:MM) */
  departure_time?: string;
  /** Arrival time (HH:MM) */
  arrival_time?: string;
  /** Terminal (departure) */
  terminal?: string;
  /** Cabin class */
  cabin_class?: string;
  /** Booking class */
  booking_class: string;
  /** Baggage allowance */
  baggage_allowance?: string;
  /** Seat assignment */
  seat?: string;
  /** Aircraft type */
  aircraft?: string;
}

export interface ItineraryPassenger {
  /** Passenger name (LAST/FIRST) */
  name: string;
  /** Ticket number */
  ticket_number: string;
  /** Frequent flyer number */
  frequent_flyer?: string;
}

export interface ContactDetails {
  /** Email address */
  email?: string;
  /** Phone number (for SMS) */
  phone?: string;
  /** WhatsApp number */
  whatsapp?: string;
}

export interface RenderedContent {
  /** Channel */
  channel: DeliveryChannel;
  /** Rendered content (HTML for email, plain text for SMS/WhatsApp) */
  content: string;
  /** Plain text version (for email alt body) */
  plain_text?: string;
  /** Subject line (for email) */
  subject?: string;
  /** SMS segment count (for SMS only) */
  sms_segments?: number;
}

export interface ItineraryDeliveryInput {
  /** Booking reference / record locator */
  record_locator: string;
  /** Passengers */
  passengers: ItineraryPassenger[];
  /** Flights */
  flights: ItineraryFlight[];
  /** Total fare paid (decimal string) */
  total_fare?: string;
  /** Fare currency */
  fare_currency?: string;
  /** Contact details for delivery */
  contact: ContactDetails;
  /** Channels to render */
  channels: DeliveryChannel[];
  /** Issuing agency name (for the itinerary header) */
  agency_name?: string;
}

export interface ItineraryDeliveryOutput {
  /** Rendered content per channel */
  rendered: RenderedContent[];
  /** Channels successfully rendered */
  channels_rendered: DeliveryChannel[];
}
