import { describe, it, expect, beforeAll } from 'vitest';
import { AITravelAdvisorAgent } from '../index.js';
import { MockLLMProvider } from '../mock-llm-provider.js';

describe('AITravelAdvisorAgent', () => {
  let agent: AITravelAdvisorAgent;
  let mockProvider: MockLLMProvider;

  beforeAll(async () => {
    mockProvider = new MockLLMProvider();
    agent = new AITravelAdvisorAgent({ llmProvider: mockProvider });
    await agent.initialize();
  });

  describe('flight search intent', () => {
    it('extracts flight search from natural language', async () => {
      const result = await agent.execute({
        data: { query: 'Find me a flight from JFK to LHR' },
      });
      expect(result.data.intent).toBe('flight_search');
      expect(result.data.searchParameters.origin).toBe('JFK');
      expect(result.data.searchParameters.destination).toBe('LHR');
    });

    it('detects round trip intent', async () => {
      const result = await agent.execute({
        data: { query: 'Round trip flight from LAX to CDG' },
      });
      expect(result.data.searchParameters.tripType).toBe('round_trip');
    });

    it('extracts cabin class preference', async () => {
      const result = await agent.execute({
        data: { query: 'Business class flight from SFO to NRT' },
      });
      expect(result.data.searchParameters.cabinClass).toBe('business');
    });

    it('detects flexible dates', async () => {
      const result = await agent.execute({
        data: { query: 'Flexible dates flight from NYC to LON' },
      });
      expect(result.data.searchParameters.flexibleDates).toBe(true);
    });
  });

  describe('other intents', () => {
    it('detects hotel search intent', async () => {
      const result = await agent.execute({
        data: { query: 'Find a hotel in PAR for next week' },
      });
      expect(result.data.intent).toBe('hotel_search');
    });

    it('detects destination recommendation intent', async () => {
      const result = await agent.execute({
        data: { query: 'Where should I go for a beach vacation?' },
      });
      expect(result.data.intent).toBe('destination_recommendation');
    });

    it('detects price check intent', async () => {
      const result = await agent.execute({
        data: { query: 'How much does it cost from JFK to LAX?' },
      });
      expect(result.data.intent).toBe('price_check');
    });

    it('returns unknown for ambiguous queries', async () => {
      const result = await agent.execute({
        data: { query: 'hello world' },
      });
      expect(result.data.intent).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('traveler context', () => {
    it('merges cabin preference from context', async () => {
      const result = await agent.execute({
        data: {
          query: 'Flight from JFK to LHR',
          travelerContext: { cabinPreference: 'first' },
        },
      });
      expect(result.data.searchParameters.cabinClass).toBe('first');
    });

    it('includes passenger counts from context', async () => {
      const result = await agent.execute({
        data: {
          query: 'Flight from SFO to NRT',
          travelerContext: { adults: 2, children: 1, infants: 0 },
        },
      });
      expect(result.data.searchParameters.passengers).toEqual({
        adults: 2,
        children: 1,
        infants: 0,
      });
    });

    it('defaults to 1 adult when no context', async () => {
      const result = await agent.execute({
        data: { query: 'Flight from LAX to CDG' },
      });
      expect(result.data.searchParameters.passengers).toEqual({
        adults: 1,
        children: 0,
        infants: 0,
      });
    });
  });

  describe('agent compliance', () => {
    it('has correct id/name/version', () => {
      expect(agent.id).toBe('1.8');
      expect(agent.name).toBe('AI Travel Advisor');
      expect(agent.version).toBe('0.2.0');
    });

    it('reports healthy after initialization', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('throws when not initialized', async () => {
      const uninit = new AITravelAdvisorAgent({ llmProvider: mockProvider });
      await expect(uninit.execute({ data: { query: 'test' } })).rejects.toThrow(
        'not been initialized',
      );
    });

    it('rejects empty query', async () => {
      await expect(agent.execute({ data: { query: '' } })).rejects.toThrow('Query must not be');
    });

    it('returns confidence score between 0 and 1', async () => {
      const result = await agent.execute({
        data: { query: 'Flight from JFK to LHR' },
      });
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('always returns a summary', async () => {
      const result = await agent.execute({
        data: { query: 'anything' },
      });
      expect(typeof result.data.summary).toBe('string');
      expect(result.data.summary.length).toBeGreaterThan(0);
    });
  });

  describe('LLM provider integration', () => {
    it('passes prompt to LLM provider', async () => {
      mockProvider.callLog.length = 0;
      await agent.execute({ data: { query: 'test flight query' } });
      expect(mockProvider.callLog.length).toBe(1);
      expect(mockProvider.callLog[0]!.prompt).toContain('test flight query');
    });

    it('handles malformed LLM response gracefully', async () => {
      const badProvider: MockLLMProvider = {
        callLog: [],
        complete: async () => 'not json at all }{}{',
      } as unknown as MockLLMProvider;
      const badAgent = new AITravelAdvisorAgent({ llmProvider: badProvider });
      await badAgent.initialize();

      const result = await badAgent.execute({ data: { query: 'test' } });
      expect(result.data.intent).toBe('unknown');
    });
  });
});
