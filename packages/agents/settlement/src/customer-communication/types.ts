/**
 * Customer Communication — Types
 *
 * Agent 6.4: Multi-channel customer notification generation
 * for flight disruptions, refunds, and operational changes.
 */

export type NotificationType =
  | 'FLIGHT_CANCELLED'
  | 'FLIGHT_DELAYED'
  | 'GATE_CHANGE'
  | 'REBOOKING_CONFIRMED'
  | 'REFUND_PROCESSED'
  | 'SCHEDULE_CHANGE'
  | 'WAITLIST_CLEARED'
  | 'ADM_RECEIVED';

export type Channel = 'EMAIL_HTML' | 'EMAIL_TEXT' | 'SMS' | 'WHATSAPP';

export interface NotificationVariables {
  /** Passenger name */
  passengerName?: string;
  /** Flight number */
  flightNumber?: string;
  /** Origin airport */
  origin?: string;
  /** Destination airport */
  destination?: string;
  /** Original departure date/time */
  originalDeparture?: string;
  /** New departure date/time */
  newDeparture?: string;
  /** Gate number */
  gate?: string;
  /** Previous gate */
  previousGate?: string;
  /** Delay duration */
  delayDuration?: string;
  /** Refund amount */
  refundAmount?: string;
  /** Currency */
  currency?: string;
  /** Booking reference / PNR */
  bookingReference?: string;
  /** New flight number (for rebooking) */
  newFlightNumber?: string;
  /** ADM amount */
  admAmount?: string;
  /** Airline name */
  airlineName?: string;
  /** Reason for action */
  reason?: string;
  /** Ticket number */
  ticketNumber?: string;
  /** Waitlist position */
  waitlistPosition?: string;
  /** Seat assignment */
  seatAssignment?: string;
  /** New schedule time */
  newSchedule?: string;
  /** Additional custom variables */
  [key: string]: string | undefined;
}

export interface GeneratedNotification {
  /** Notification type */
  type: NotificationType;
  /** Channel used */
  channel: Channel;
  /** Subject line (for email channels) */
  subject?: string;
  /** Generated message body */
  body: string;
  /** Number of SMS segments (for SMS channel) */
  smsSegments?: number;
  /** Variables that were used */
  variablesUsed: string[];
  /** Variables that were missing (left as placeholders) */
  variablesMissing: string[];
}

export interface TemplateInfo {
  /** Notification type */
  type: NotificationType;
  /** Channel */
  channel: Channel;
  /** Template string with {variable} placeholders */
  template: string;
  /** Subject template (for email channels) */
  subjectTemplate?: string;
  /** Required variables */
  requiredVariables: string[];
}

export interface CustomerCommunicationInput {
  /** Operation to perform */
  operation: 'generateNotification' | 'generateBatch' | 'getTemplate';

  /** Notification type */
  notificationType?: NotificationType;
  /** Channel */
  channel?: Channel;
  /** Template variables */
  variables?: NotificationVariables;

  /** For batch: array of notification requests */
  batchRequests?: Array<{
    notificationType: NotificationType;
    channel: Channel;
    variables: NotificationVariables;
  }>;
}

export interface CustomerCommunicationOutput {
  /** Single generated notification */
  notification?: GeneratedNotification;
  /** Batch of generated notifications */
  notifications?: GeneratedNotification[];
  /** Template info */
  template?: TemplateInfo;
}
