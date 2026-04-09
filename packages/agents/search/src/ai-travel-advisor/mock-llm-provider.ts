/**
 * MockLLMProvider — deterministic LLM responses for testing.
 *
 * Returns structured JSON responses based on simple keyword matching.
 * Not a real LLM — suitable only for unit tests and development.
 */

import type { LLMProvider, LLMOptions } from './types.js';

export class MockLLMProvider implements LLMProvider {
  readonly callLog: Array<{ prompt: string; options?: LLMOptions }> = [];

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    this.callLog.push({ prompt, options });

    // Extract just the user query from the prompt (after "User query: ")
    const queryMarker = 'User query: ';
    const queryStart = prompt.indexOf(queryMarker);
    const userQuery = queryStart >= 0 ? prompt.slice(queryStart + queryMarker.length) : prompt;
    const lower = userQuery.toLowerCase();

    // Detect intent and extract basic parameters from the prompt
    if (lower.includes('flight') || lower.includes('fly') || lower.includes('airport')) {
      return JSON.stringify({
        intent: 'flight_search',
        origin: this.extractCode(lower, 'from'),
        destination: this.extractCode(lower, 'to'),
        tripType: lower.includes('round trip') || lower.includes('return') ? 'round_trip' : 'one_way',
        cabinClass: this.extractCabin(lower),
        flexibleDates: lower.includes('flexible') || lower.includes('anytime'),
        summary: 'Looking for flights based on your query.',
      });
    }

    if (lower.includes('hotel') || lower.includes('stay') || lower.includes('accommodation')) {
      return JSON.stringify({
        intent: 'hotel_search',
        destination: this.extractCode(lower, 'in'),
        summary: 'Looking for hotel accommodations.',
      });
    }

    if (lower.includes('recommend') || lower.includes('where should') || lower.includes('suggest')) {
      return JSON.stringify({
        intent: 'destination_recommendation',
        summary: 'Let me suggest some destinations for you.',
      });
    }

    if (lower.includes('price') || lower.includes('cost') || lower.includes('cheap')) {
      return JSON.stringify({
        intent: 'price_check',
        origin: this.extractCode(lower, 'from'),
        destination: this.extractCode(lower, 'to'),
        summary: 'Checking prices for your route.',
      });
    }

    return JSON.stringify({
      intent: 'unknown',
      summary: 'I could not determine a clear travel intent from your query.',
    });
  }

  private extractCode(text: string, preposition: string): string | undefined {
    // Simple pattern: "from XXX" or "to XXX" where XXX is a 3-letter code
    const pattern = new RegExp(`${preposition}\\s+([a-z]{3})\\b`, 'i');
    const match = text.match(pattern);
    return match ? match[1]!.toUpperCase() : undefined;
  }

  private extractCabin(text: string): string | undefined {
    if (text.includes('first class')) return 'first';
    if (text.includes('business')) return 'business';
    if (text.includes('premium')) return 'premium_economy';
    if (text.includes('economy')) return 'economy';
    return undefined;
  }
}
