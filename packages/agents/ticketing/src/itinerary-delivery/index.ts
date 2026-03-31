/**
 * Itinerary Delivery — Agent 4.4
 *
 * Multi-channel itinerary rendering: Email (HTML+plain), SMS, WhatsApp.
 * Carrier-neutral templates.
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
import type { ItineraryDeliveryInput, ItineraryDeliveryOutput } from './types.js';
import { renderItinerary } from './render-engine.js';

const RECORD_LOCATOR_RE = /^[A-Z0-9]{6}$/;
const VALID_CHANNELS = new Set(['EMAIL', 'SMS', 'WHATSAPP']);

export class ItineraryDelivery
  implements Agent<ItineraryDeliveryInput, ItineraryDeliveryOutput>
{
  readonly id = '4.4';
  readonly name = 'Itinerary Delivery';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<ItineraryDeliveryInput>,
  ): Promise<AgentOutput<ItineraryDeliveryOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = renderItinerary(input.data);

    return {
      data: result,
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        record_locator: input.data.record_locator,
        channels_rendered: result.channels_rendered,
        passenger_count: input.data.passengers.length,
        flight_count: input.data.flights.length,
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

  private validateInput(data: ItineraryDeliveryInput): void {
    if (!data.record_locator || !RECORD_LOCATOR_RE.test(data.record_locator)) {
      throw new AgentInputValidationError(this.id, 'record_locator', 'Must be a 6-character alphanumeric PNR locator.');
    }
    if (!data.passengers || data.passengers.length === 0) {
      throw new AgentInputValidationError(this.id, 'passengers', 'At least one passenger required.');
    }
    if (!data.flights || data.flights.length === 0) {
      throw new AgentInputValidationError(this.id, 'flights', 'At least one flight required.');
    }
    if (!data.channels || data.channels.length === 0) {
      throw new AgentInputValidationError(this.id, 'channels', 'At least one delivery channel required.');
    }
    for (const ch of data.channels) {
      if (!VALID_CHANNELS.has(ch)) {
        throw new AgentInputValidationError(this.id, 'channels', `Invalid channel: ${ch}. Must be EMAIL, SMS, or WHATSAPP.`);
      }
    }
    if (!data.contact) {
      throw new AgentInputValidationError(this.id, 'contact', 'Contact details required.');
    }
    if (data.channels.includes('EMAIL') && !data.contact.email) {
      throw new AgentInputValidationError(this.id, 'contact.email', 'Email address required for EMAIL channel.');
    }
    if (data.channels.includes('SMS') && !data.contact.phone) {
      throw new AgentInputValidationError(this.id, 'contact.phone', 'Phone number required for SMS channel.');
    }
  }
}

export type {
  ItineraryDeliveryInput,
  ItineraryDeliveryOutput,
  ItineraryFlight,
  ItineraryPassenger,
  ContactDetails,
  RenderedContent,
  DeliveryChannel,
} from './types.js';
