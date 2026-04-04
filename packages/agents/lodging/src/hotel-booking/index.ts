/**
 * Agent 20.5 — Hotel Booking Agent
 *
 * Executes hotel bookings, manages the full booking flow from rate verification
 * through confirmation, and handles the three-layer confirmation code system.
 *
 * Downstream: Feeds Agent 20.7 (Confirmation Verification) and Agent 20.6 (Modification)
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
import type { BookingInput, BookingOutput } from './types.js';
import { executeBooking, getBooking, clearBookingStore } from './booking-flow.js';

export class HotelBookingAgent
  implements Agent<BookingInput, BookingOutput>
{
  readonly id = '20.5';
  readonly name = 'Hotel Booking';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<BookingInput>,
  ): Promise<AgentOutput<BookingOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    let result: BookingOutput;

    switch (input.data.operation) {
      case 'book':
        result = await executeBooking(input.data.bookingRequest!);
        break;
      case 'verify_rate':
        // Mock rate verification — always succeeds in v0.1.0
        result = { success: true, rateChanged: false };
        break;
      case 'get_booking': {
        const booking = getBooking(input.data.bookingId!);
        result = booking
          ? { success: true, booking }
          : { success: false, error: 'Booking not found' };
        break;
      }
    }

    const warnings: string[] = [];
    if (result.rateChanged) {
      warnings.push('Rate changed between search and booking');
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
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
    clearBookingStore();
  }

  private validateInput(data: BookingInput): void {
    if (!data.operation) {
      throw new AgentInputValidationError(this.id, 'operation', 'Operation is required');
    }

    const validOps = ['book', 'verify_rate', 'get_booking'];
    if (!validOps.includes(data.operation)) {
      throw new AgentInputValidationError(this.id, 'operation', `Invalid operation. Must be one of: ${validOps.join(', ')}`);
    }

    if (data.operation === 'book' || data.operation === 'verify_rate') {
      if (!data.bookingRequest) {
        throw new AgentInputValidationError(this.id, 'bookingRequest', 'Booking request is required for book/verify_rate operations');
      }
      if (!data.bookingRequest.guest) {
        throw new AgentInputValidationError(this.id, 'bookingRequest.guest', 'Guest details are required');
      }
      if (!data.bookingRequest.checkIn || !data.bookingRequest.checkOut) {
        throw new AgentInputValidationError(this.id, 'bookingRequest.dates', 'Check-in and check-out dates are required');
      }
    }

    if (data.operation === 'get_booking' && !data.bookingId) {
      throw new AgentInputValidationError(this.id, 'bookingId', 'Booking ID is required for get_booking operation');
    }
  }
}

export type { BookingInput, BookingOutput, BookingRecord, BookingRequest, VirtualCardInfo, BookingOperation } from './types.js';
