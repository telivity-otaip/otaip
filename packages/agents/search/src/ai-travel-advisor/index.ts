/**
 * AI Travel Advisor — Agent 1.8
 *
 * Natural language travel query understanding with injectable LLM provider.
 * Parses user queries into structured search parameters that other Stage 1
 * agents can consume.
 *
 * Bring your own LLM: inject any LLMProvider implementation.
 * For testing, use MockLLMProvider.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  TravelAdvisorInput,
  TravelAdvisorOutput,
  LLMProvider,
  ExtractedSearchParameters,
  TravelIntent,
  AITravelAdvisorConfig,
} from './types.js';

const EXTRACTION_PROMPT_PREFIX = `You are a travel search assistant. Given a user's natural language travel query, extract structured search parameters as JSON. Include: intent (flight_search, hotel_search, destination_recommendation, price_check, trip_planning, or unknown), origin (3-letter IATA code if mentioned), destination (3-letter IATA code if mentioned), tripType (one_way, round_trip, or multi_city), cabinClass (economy, premium_economy, business, or first), flexibleDates (boolean), and a brief summary of the interpreted query.

User query: `;

export class AITravelAdvisorAgent implements Agent<TravelAdvisorInput, TravelAdvisorOutput> {
  readonly id = '1.8';
  readonly name = 'AI Travel Advisor';
  readonly version = '0.2.0';

  private initialized = false;
  private readonly llmProvider: LLMProvider;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(config: AITravelAdvisorConfig) {
    this.llmProvider = config.llmProvider;
    this.maxTokens = config.maxTokens ?? 500;
    this.temperature = config.temperature ?? 0.1;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<TravelAdvisorInput>,
  ): Promise<AgentOutput<TravelAdvisorOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const { query, travelerContext } = input.data;
    if (!query || query.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'query', 'Query must not be empty.');
    }

    const prompt = EXTRACTION_PROMPT_PREFIX + query;
    const rawResponse = await this.llmProvider.complete(prompt, {
      maxTokens: this.maxTokens,
      temperature: this.temperature,
    });

    const parsed = this.parseResponse(rawResponse);

    const str = (key: string): string | undefined => {
      const v = parsed[key];
      return typeof v === 'string' ? v : undefined;
    };
    const bool = (key: string): boolean | undefined => {
      const v = parsed[key];
      return typeof v === 'boolean' ? v : undefined;
    };

    // Merge traveler context preferences into extracted parameters
    const searchParameters: ExtractedSearchParameters = {
      origin: str('origin'),
      destination: str('destination'),
      departureDate: str('departureDate'),
      returnDate: str('returnDate'),
      tripType: str('tripType') as ExtractedSearchParameters['tripType'],
      cabinClass:
        (str('cabinClass') as ExtractedSearchParameters['cabinClass']) ??
        travelerContext?.cabinPreference,
      flexibleDates: bool('flexibleDates'),
      passengers: travelerContext
        ? {
            adults: travelerContext.adults ?? 1,
            children: travelerContext.children ?? 0,
            infants: travelerContext.infants ?? 0,
          }
        : { adults: 1, children: 0, infants: 0 },
    };

    const intent: TravelIntent = (str('intent') as TravelIntent) ?? 'unknown';
    const summary: string = str('summary') ?? 'Query processed.';
    const confidence = intent === 'unknown' ? 0.3 : searchParameters.origin ? 0.9 : 0.6;

    return {
      data: { searchParameters, summary, intent },
      confidence,
      metadata: { agent_id: this.id },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }

  private parseResponse(raw: string): Record<string, unknown> {
    try {
      // Try to extract JSON from the response (LLMs sometimes wrap in markdown)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
}

export type {
  TravelAdvisorInput,
  TravelAdvisorOutput,
  LLMProvider,
  LLMOptions,
  TravelerContext,
  ExtractedSearchParameters,
  TravelIntent,
  AITravelAdvisorConfig,
} from './types.js';
export { MockLLMProvider } from './mock-llm-provider.js';
