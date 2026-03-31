/**
 * Customer Communication — Agent 6.4
 *
 * Multi-channel customer notification generation for flight
 * disruptions, refunds, and operational changes.
 *
 * 8 notification types x 4 channels = 32 template combinations.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import type {
  CustomerCommunicationInput,
  CustomerCommunicationOutput,
  GeneratedNotification,
  TemplateInfo,
  NotificationType,
  Channel,
  NotificationVariables,
} from './types.js';

const SMS_SEGMENT_LENGTH = 160;

const VALID_NOTIFICATION_TYPES = new Set<NotificationType>([
  'FLIGHT_CANCELLED', 'FLIGHT_DELAYED', 'GATE_CHANGE', 'REBOOKING_CONFIRMED',
  'REFUND_PROCESSED', 'SCHEDULE_CHANGE', 'WAITLIST_CLEARED', 'ADM_RECEIVED',
]);

const VALID_CHANNELS = new Set<Channel>([
  'EMAIL_HTML', 'EMAIL_TEXT', 'SMS', 'WHATSAPP',
]);

// --- Template definitions ---

interface TemplateRecord {
  subject?: string;
  body: string;
  requiredVariables: string[];
}

type TemplateMap = Record<NotificationType, Record<Channel, TemplateRecord>>;

const TEMPLATES: TemplateMap = {
  FLIGHT_CANCELLED: {
    EMAIL_HTML: {
      subject: 'Flight {flightNumber} Cancelled',
      body: '<p>Dear <b>{passengerName}</b>,</p><p>We regret to inform you that flight <b>{flightNumber}</b> from {origin} to {destination}, originally scheduled for {originalDeparture}, has been <b>cancelled</b>.</p><p>Reason: {reason}</p><p>Your booking reference is <b>{bookingReference}</b>. Please contact us for rebooking options.</p>',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'originalDeparture', 'reason', 'bookingReference'],
    },
    EMAIL_TEXT: {
      subject: 'Flight {flightNumber} Cancelled',
      body: 'Dear {passengerName},\n\nFlight {flightNumber} from {origin} to {destination}, scheduled for {originalDeparture}, has been cancelled.\n\nReason: {reason}\n\nBooking reference: {bookingReference}. Please contact us for rebooking options.',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'originalDeparture', 'reason', 'bookingReference'],
    },
    SMS: {
      body: 'Flight {flightNumber} {origin}-{destination} on {originalDeparture} CANCELLED. Ref: {bookingReference}. Contact us for rebooking.',
      requiredVariables: ['flightNumber', 'origin', 'destination', 'originalDeparture', 'bookingReference'],
    },
    WHATSAPP: {
      body: '*Flight Cancellation*\n\nDear {passengerName}, flight *{flightNumber}* from {origin} to {destination} on {originalDeparture} has been *cancelled*.\n\nReason: {reason}\nRef: *{bookingReference}*',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'originalDeparture', 'reason', 'bookingReference'],
    },
  },
  FLIGHT_DELAYED: {
    EMAIL_HTML: {
      subject: 'Flight {flightNumber} Delayed',
      body: '<p>Dear <b>{passengerName}</b>,</p><p>Flight <b>{flightNumber}</b> from {origin} to {destination} is delayed by <b>{delayDuration}</b>.</p><p>New departure: <b>{newDeparture}</b></p><p>Booking reference: <b>{bookingReference}</b></p>',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'delayDuration', 'newDeparture', 'bookingReference'],
    },
    EMAIL_TEXT: {
      subject: 'Flight {flightNumber} Delayed',
      body: 'Dear {passengerName},\n\nFlight {flightNumber} from {origin} to {destination} is delayed by {delayDuration}.\n\nNew departure: {newDeparture}\nBooking reference: {bookingReference}',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'delayDuration', 'newDeparture', 'bookingReference'],
    },
    SMS: {
      body: 'Flight {flightNumber} {origin}-{destination} DELAYED {delayDuration}. New dep: {newDeparture}. Ref: {bookingReference}',
      requiredVariables: ['flightNumber', 'origin', 'destination', 'delayDuration', 'newDeparture', 'bookingReference'],
    },
    WHATSAPP: {
      body: '*Flight Delay*\n\nDear {passengerName}, flight *{flightNumber}* {origin}-{destination} is delayed by *{delayDuration}*.\n\nNew departure: *{newDeparture}*\nRef: *{bookingReference}*',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'delayDuration', 'newDeparture', 'bookingReference'],
    },
  },
  GATE_CHANGE: {
    EMAIL_HTML: {
      subject: 'Gate Change - Flight {flightNumber}',
      body: '<p>Dear <b>{passengerName}</b>,</p><p>The gate for flight <b>{flightNumber}</b> from {origin} to {destination} has changed from {previousGate} to <b>{gate}</b>.</p><p>Booking reference: <b>{bookingReference}</b></p>',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'previousGate', 'gate', 'bookingReference'],
    },
    EMAIL_TEXT: {
      subject: 'Gate Change - Flight {flightNumber}',
      body: 'Dear {passengerName},\n\nGate change for flight {flightNumber} {origin}-{destination}: {previousGate} -> {gate}\n\nBooking reference: {bookingReference}',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'previousGate', 'gate', 'bookingReference'],
    },
    SMS: {
      body: 'GATE CHANGE: Flight {flightNumber} {origin}-{destination} now Gate {gate} (was {previousGate}). Ref: {bookingReference}',
      requiredVariables: ['flightNumber', 'origin', 'destination', 'gate', 'previousGate', 'bookingReference'],
    },
    WHATSAPP: {
      body: '*Gate Change*\n\nFlight *{flightNumber}* {origin}-{destination}: Gate changed from {previousGate} to *{gate}*\nRef: *{bookingReference}*',
      requiredVariables: ['flightNumber', 'origin', 'destination', 'gate', 'previousGate', 'bookingReference'],
    },
  },
  REBOOKING_CONFIRMED: {
    EMAIL_HTML: {
      subject: 'Rebooking Confirmed - {newFlightNumber}',
      body: '<p>Dear <b>{passengerName}</b>,</p><p>Your rebooking has been confirmed.</p><p>New flight: <b>{newFlightNumber}</b> from {origin} to {destination}</p><p>New departure: <b>{newDeparture}</b></p><p>Booking reference: <b>{bookingReference}</b></p>',
      requiredVariables: ['passengerName', 'newFlightNumber', 'origin', 'destination', 'newDeparture', 'bookingReference'],
    },
    EMAIL_TEXT: {
      subject: 'Rebooking Confirmed - {newFlightNumber}',
      body: 'Dear {passengerName},\n\nRebooking confirmed.\nNew flight: {newFlightNumber} from {origin} to {destination}\nNew departure: {newDeparture}\nBooking reference: {bookingReference}',
      requiredVariables: ['passengerName', 'newFlightNumber', 'origin', 'destination', 'newDeparture', 'bookingReference'],
    },
    SMS: {
      body: 'REBOOKED: New flight {newFlightNumber} {origin}-{destination} dep {newDeparture}. Ref: {bookingReference}',
      requiredVariables: ['newFlightNumber', 'origin', 'destination', 'newDeparture', 'bookingReference'],
    },
    WHATSAPP: {
      body: '*Rebooking Confirmed*\n\nDear {passengerName}, you are rebooked on *{newFlightNumber}* {origin}-{destination}.\nDeparture: *{newDeparture}*\nRef: *{bookingReference}*',
      requiredVariables: ['passengerName', 'newFlightNumber', 'origin', 'destination', 'newDeparture', 'bookingReference'],
    },
  },
  REFUND_PROCESSED: {
    EMAIL_HTML: {
      subject: 'Refund Processed - {currency} {refundAmount}',
      body: '<p>Dear <b>{passengerName}</b>,</p><p>Your refund of <b>{currency} {refundAmount}</b> for ticket {ticketNumber} has been processed.</p><p>Booking reference: <b>{bookingReference}</b></p><p>Please allow 5-10 business days for the refund to appear.</p>',
      requiredVariables: ['passengerName', 'currency', 'refundAmount', 'ticketNumber', 'bookingReference'],
    },
    EMAIL_TEXT: {
      subject: 'Refund Processed - {currency} {refundAmount}',
      body: 'Dear {passengerName},\n\nYour refund of {currency} {refundAmount} for ticket {ticketNumber} has been processed.\n\nBooking reference: {bookingReference}\nPlease allow 5-10 business days for the refund to appear.',
      requiredVariables: ['passengerName', 'currency', 'refundAmount', 'ticketNumber', 'bookingReference'],
    },
    SMS: {
      body: 'REFUND: {currency} {refundAmount} processed for ticket {ticketNumber}. Ref: {bookingReference}. Allow 5-10 days.',
      requiredVariables: ['currency', 'refundAmount', 'ticketNumber', 'bookingReference'],
    },
    WHATSAPP: {
      body: '*Refund Processed*\n\nDear {passengerName}, your refund of *{currency} {refundAmount}* for ticket {ticketNumber} has been processed.\nRef: *{bookingReference}*\nAllow 5-10 business days.',
      requiredVariables: ['passengerName', 'currency', 'refundAmount', 'ticketNumber', 'bookingReference'],
    },
  },
  SCHEDULE_CHANGE: {
    EMAIL_HTML: {
      subject: 'Schedule Change - Flight {flightNumber}',
      body: '<p>Dear <b>{passengerName}</b>,</p><p>Flight <b>{flightNumber}</b> from {origin} to {destination} has a schedule change.</p><p>New schedule: <b>{newSchedule}</b></p><p>Booking reference: <b>{bookingReference}</b></p>',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'newSchedule', 'bookingReference'],
    },
    EMAIL_TEXT: {
      subject: 'Schedule Change - Flight {flightNumber}',
      body: 'Dear {passengerName},\n\nSchedule change for flight {flightNumber} {origin}-{destination}.\nNew schedule: {newSchedule}\nBooking reference: {bookingReference}',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'newSchedule', 'bookingReference'],
    },
    SMS: {
      body: 'SCHEDULE CHANGE: Flight {flightNumber} {origin}-{destination} now {newSchedule}. Ref: {bookingReference}',
      requiredVariables: ['flightNumber', 'origin', 'destination', 'newSchedule', 'bookingReference'],
    },
    WHATSAPP: {
      body: '*Schedule Change*\n\nFlight *{flightNumber}* {origin}-{destination} schedule changed to *{newSchedule}*.\nRef: *{bookingReference}*',
      requiredVariables: ['flightNumber', 'origin', 'destination', 'newSchedule', 'bookingReference'],
    },
  },
  WAITLIST_CLEARED: {
    EMAIL_HTML: {
      subject: 'Waitlist Cleared - Flight {flightNumber}',
      body: '<p>Dear <b>{passengerName}</b>,</p><p>Great news! Your waitlist for flight <b>{flightNumber}</b> from {origin} to {destination} has been <b>cleared</b>.</p><p>Seat: <b>{seatAssignment}</b></p><p>Booking reference: <b>{bookingReference}</b></p>',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'seatAssignment', 'bookingReference'],
    },
    EMAIL_TEXT: {
      subject: 'Waitlist Cleared - Flight {flightNumber}',
      body: 'Dear {passengerName},\n\nYour waitlist for flight {flightNumber} {origin}-{destination} has been cleared.\nSeat: {seatAssignment}\nBooking reference: {bookingReference}',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'seatAssignment', 'bookingReference'],
    },
    SMS: {
      body: 'WAITLIST CLEARED: Flight {flightNumber} {origin}-{destination}. Seat {seatAssignment}. Ref: {bookingReference}',
      requiredVariables: ['flightNumber', 'origin', 'destination', 'seatAssignment', 'bookingReference'],
    },
    WHATSAPP: {
      body: '*Waitlist Cleared*\n\nDear {passengerName}, you are confirmed on *{flightNumber}* {origin}-{destination}.\nSeat: *{seatAssignment}*\nRef: *{bookingReference}*',
      requiredVariables: ['passengerName', 'flightNumber', 'origin', 'destination', 'seatAssignment', 'bookingReference'],
    },
  },
  ADM_RECEIVED: {
    EMAIL_HTML: {
      subject: 'Agency Debit Memo Received - {ticketNumber}',
      body: '<p>Dear <b>{passengerName}</b>,</p><p>An Agency Debit Memo (ADM) of <b>{currency} {admAmount}</b> has been received for ticket <b>{ticketNumber}</b> from <b>{airlineName}</b>.</p><p>Reason: {reason}</p><p>Booking reference: <b>{bookingReference}</b></p>',
      requiredVariables: ['passengerName', 'currency', 'admAmount', 'ticketNumber', 'airlineName', 'reason', 'bookingReference'],
    },
    EMAIL_TEXT: {
      subject: 'Agency Debit Memo Received - {ticketNumber}',
      body: 'Dear {passengerName},\n\nAn ADM of {currency} {admAmount} has been received for ticket {ticketNumber} from {airlineName}.\nReason: {reason}\nBooking reference: {bookingReference}',
      requiredVariables: ['passengerName', 'currency', 'admAmount', 'ticketNumber', 'airlineName', 'reason', 'bookingReference'],
    },
    SMS: {
      body: 'ADM: {currency} {admAmount} for ticket {ticketNumber} from {airlineName}. Ref: {bookingReference}',
      requiredVariables: ['currency', 'admAmount', 'ticketNumber', 'airlineName', 'bookingReference'],
    },
    WHATSAPP: {
      body: '*ADM Received*\n\nAn ADM of *{currency} {admAmount}* for ticket {ticketNumber} from *{airlineName}*.\nReason: {reason}\nRef: *{bookingReference}*',
      requiredVariables: ['currency', 'admAmount', 'ticketNumber', 'airlineName', 'reason', 'bookingReference'],
    },
  },
};

// --- Agent ---

export class CustomerCommunicationAgent
  implements Agent<CustomerCommunicationInput, CustomerCommunicationOutput>
{
  readonly id = '6.4';
  readonly name = 'Customer Communication';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<CustomerCommunicationInput>,
  ): Promise<AgentOutput<CustomerCommunicationOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    let result: CustomerCommunicationOutput;

    switch (input.data.operation) {
      case 'generateNotification':
        result = this.handleGenerateNotification(input.data);
        break;
      case 'generateBatch':
        result = this.handleGenerateBatch(input.data);
        break;
      case 'getTemplate':
        result = this.handleGetTemplate(input.data);
        break;
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Unknown operation.');
    }

    return {
      data: result,
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: input.data.operation,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }

  // --- Operation handlers ---

  private handleGenerateNotification(data: CustomerCommunicationInput): CustomerCommunicationOutput {
    const notification = this.renderNotification(
      data.notificationType!,
      data.channel!,
      data.variables ?? {},
    );
    return { notification };
  }

  private handleGenerateBatch(data: CustomerCommunicationInput): CustomerCommunicationOutput {
    const notifications = data.batchRequests!.map((req) =>
      this.renderNotification(req.notificationType, req.channel, req.variables),
    );
    return { notifications };
  }

  private handleGetTemplate(data: CustomerCommunicationInput): CustomerCommunicationOutput {
    const tmpl = TEMPLATES[data.notificationType!][data.channel!];
    const template: TemplateInfo = {
      type: data.notificationType!,
      channel: data.channel!,
      template: tmpl.body,
      subjectTemplate: tmpl.subject,
      requiredVariables: tmpl.requiredVariables,
    };
    return { template };
  }

  // --- Rendering ---

  private renderNotification(
    type: NotificationType,
    channel: Channel,
    variables: NotificationVariables,
  ): GeneratedNotification {
    const tmpl = TEMPLATES[type][channel];

    const variablesUsed: string[] = [];
    const variablesMissing: string[] = [];

    const renderString = (template: string): string => {
      return template.replace(/\{(\w+)\}/g, (_match, varName: string) => {
        const value = variables[varName];
        if (value !== undefined && value !== null) {
          if (!variablesUsed.includes(varName)) {
            variablesUsed.push(varName);
          }
          return value;
        }
        if (!variablesMissing.includes(varName)) {
          variablesMissing.push(varName);
        }
        return `{${varName}}`;
      });
    };

    const body = renderString(tmpl.body);
    const subject = tmpl.subject ? renderString(tmpl.subject) : undefined;

    const notification: GeneratedNotification = {
      type,
      channel,
      subject,
      body,
      variablesUsed,
      variablesMissing,
    };

    if (channel === 'SMS') {
      notification.smsSegments = Math.ceil(body.length / SMS_SEGMENT_LENGTH);
    }

    return notification;
  }

  // --- Validation ---

  private validateInput(data: CustomerCommunicationInput): void {
    if (!data.operation || !['generateNotification', 'generateBatch', 'getTemplate'].includes(data.operation)) {
      throw new AgentInputValidationError(this.id, 'operation', 'Must be generateNotification, generateBatch, or getTemplate.');
    }

    switch (data.operation) {
      case 'generateNotification':
      case 'getTemplate':
        if (!data.notificationType || !VALID_NOTIFICATION_TYPES.has(data.notificationType)) {
          throw new AgentInputValidationError(this.id, 'notificationType', 'Must be a valid notification type.');
        }
        if (!data.channel || !VALID_CHANNELS.has(data.channel)) {
          throw new AgentInputValidationError(this.id, 'channel', 'Must be a valid channel.');
        }
        break;
      case 'generateBatch':
        if (!data.batchRequests || data.batchRequests.length === 0) {
          throw new AgentInputValidationError(this.id, 'batchRequests', 'At least one batch request is required.');
        }
        for (const req of data.batchRequests) {
          if (!VALID_NOTIFICATION_TYPES.has(req.notificationType)) {
            throw new AgentInputValidationError(this.id, 'notificationType', `Invalid notification type: ${req.notificationType}`);
          }
          if (!VALID_CHANNELS.has(req.channel)) {
            throw new AgentInputValidationError(this.id, 'channel', `Invalid channel: ${req.channel}`);
          }
        }
        break;
    }
  }
}

export type {
  CustomerCommunicationInput,
  CustomerCommunicationOutput,
  GeneratedNotification,
  TemplateInfo,
  NotificationType,
  Channel,
  NotificationVariables,
} from './types.js';
