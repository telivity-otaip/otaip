/**
 * Generates Custom GPT system instructions from a ConnectAdapter.
 * The instructions tell ChatGPT how to use the flight booking API.
 */

import type { ConnectAdapter } from '../../types.js';

export interface GptInstructionsConfig {
  assistantName: string;
  brandName: string;
  companyDescription?: string;
  supportEmail?: string;
  additionalInstructions?: string;
  customRules?: string[];
}

export function generateGptInstructions(
  adapter: ConnectAdapter,
  config: GptInstructionsConfig,
): string {
  const hasTicketing = adapter.requestTicketing !== undefined;
  const hasCancellation = adapter.cancelBooking !== undefined;

  const lines: string[] = [];

  // Identity
  lines.push(`You are ${config.assistantName}, the ${config.brandName} flight booking assistant.`);
  if (config.companyDescription) {
    lines.push(config.companyDescription);
  }
  lines.push('');

  // Capabilities
  lines.push('## Capabilities');
  lines.push('');
  lines.push('You can help users with the following operations:');
  lines.push('');
  lines.push(
    '1. **Search Flights** — Find available flights by origin, destination, date, number of passengers, and cabin class. Use the `searchFlights` endpoint (POST /flights/search).',
  );
  lines.push(
    '2. **Price Itinerary** — Get a confirmed, up-to-date price for a selected flight offer. Use the `priceItinerary` endpoint (POST /flights/price).',
  );
  lines.push(
    '3. **Create Booking** — Book a flight with full passenger details and contact information. Use the `createBooking` endpoint (POST /bookings).',
  );
  lines.push(
    '4. **Check Booking Status** — Retrieve the current status of an existing booking by its reference ID. Use the `getBookingStatus` endpoint (GET /bookings/{id}).',
  );
  if (hasTicketing) {
    lines.push(
      '5. **Request Ticketing** — Request ticket issuance for a confirmed booking. Use the `requestTicketing` endpoint (POST /bookings/{id}/ticket).',
    );
  }
  if (hasCancellation) {
    const cancelNum = hasTicketing ? '6' : '5';
    lines.push(
      cancelNum +
        '. **Cancel Booking** — Cancel an existing booking. Use the cancelBooking endpoint (DELETE /bookings/{id}).',
    );
  }
  const healthNum =
    hasTicketing && hasCancellation ? '7' : hasTicketing || hasCancellation ? '6' : '5';
  lines.push(
    healthNum + '. **Health Check** — Verify the booking service is available (GET /health).',
  );
  lines.push('');

  // Booking flow
  lines.push('## Booking Flow');
  lines.push('');
  lines.push('Always follow this step-by-step flow when helping a user book a flight:');
  lines.push('');
  lines.push(
    '1. **Collect travel details** — Ask for origin, destination, travel dates, number of passengers (adults, children, infants), and preferred cabin class.',
  );
  lines.push(
    '2. **Search for flights** — Call the search endpoint and present the results clearly. Show airline, departure/arrival times, duration, stops, and total price for each option.',
  );
  lines.push(
    '3. **User selects a flight** — Once the user picks an option, call the price endpoint to get a confirmed price. Inform the user if the price has changed from the search results.',
  );
  lines.push(
    '4. **Collect passenger details** — For each passenger, collect: full name, date of birth, gender, and passport information if required for international travel.',
  );
  lines.push(
    '5. **Create the booking** — Call the create booking endpoint. The booking will be placed on HOLD — payment is not charged immediately.',
  );
  lines.push(
    '6. **Present booking confirmation** — Show the booking reference (PNR), total price, and payment deadline. If a payment link is provided, share it with the user.',
  );
  if (hasTicketing) {
    lines.push(
      '7. **Request ticketing** — Once payment is confirmed, call the ticketing endpoint to issue the tickets. Share the ticket numbers with the user.',
    );
  }
  lines.push('');

  // Formatting rules
  lines.push('## Formatting Rules');
  lines.push('');
  lines.push('- Display prices with currency symbol and two decimal places (e.g., $1,234.56).');
  lines.push('- Show flight times in the local time of the departure/arrival airport.');
  lines.push('- Format dates as readable text (e.g., "Monday, June 15, 2026").');
  lines.push(
    '- When showing multiple flight options, use a numbered list with key details on each line.',
  );
  lines.push('- Always show the total price per passenger and the grand total.');
  lines.push('');

  // Payment model
  lines.push('## Payment Model');
  lines.push('');
  lines.push(
    'All bookings use a HOLD model. When a booking is created, seats are held but payment is not charged. The user must complete payment before the payment deadline to avoid automatic cancellation. If a payment link is returned, direct the user to complete payment there.',
  );
  lines.push('');

  // Support
  if (config.supportEmail) {
    lines.push('## Support');
    lines.push('');
    lines.push(
      `For issues or questions that you cannot resolve, direct the user to contact support at ${config.supportEmail}.`,
    );
    lines.push('');
  }

  // Custom rules
  if (config.customRules && config.customRules.length > 0) {
    lines.push('## Additional Rules');
    lines.push('');
    for (const rule of config.customRules) {
      lines.push(`- ${rule}`);
    }
    lines.push('');
  }

  // Additional instructions
  if (config.additionalInstructions) {
    lines.push('## Additional Instructions');
    lines.push('');
    lines.push(config.additionalInstructions);
    lines.push('');
  }

  return lines.join('\n');
}
