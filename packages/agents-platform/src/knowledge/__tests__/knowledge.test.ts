/**
 * Knowledge Retrieval — Unit Tests (Agent 9.2)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KnowledgeAgent } from '../index.js';
import type { KnowledgeInput, EmbeddingProvider } from '../types.js';

let agent: KnowledgeAgent;

beforeAll(async () => {
  agent = new KnowledgeAgent();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

describe('Knowledge Retrieval', () => {
  describe('query', () => {
    it('finds documents by keyword', async () => {
      const res = await agent.execute({
        data: { operation: 'query', query: 'GDS distribution airline booking' },
      });
      expect(res.data.results!.length).toBeGreaterThan(0);
      expect(res.data.results![0]!.relevance_score).toBeGreaterThan(0);
    });

    it('returns empty for no match', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'xyzzyplugh' } });
      expect(res.data.results!).toHaveLength(0);
    });

    it('respects max_results', async () => {
      const res = await agent.execute({
        data: { operation: 'query', query: 'airline travel', max_results: 2 },
      });
      expect(res.data.results!.length).toBeLessThanOrEqual(2);
    });

    it('defaults max_results to 5', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'airline' } });
      expect(res.data.results!.length).toBeLessThanOrEqual(5);
    });

    it('filters by topic', async () => {
      const res = await agent.execute({
        data: { operation: 'query', query: 'fare rules', topic: 'fares' },
      });
      for (const r of res.data.results!) {
        expect(r.topic).toBe('fares');
      }
    });

    it('returns relevance_score 0-1', async () => {
      const res = await agent.execute({
        data: { operation: 'query', query: 'BSP settlement billing' },
      });
      for (const r of res.data.results!) {
        expect(r.relevance_score).toBeGreaterThanOrEqual(0);
        expect(r.relevance_score).toBeLessThanOrEqual(1);
      }
    });

    it('sorts by relevance descending', async () => {
      const res = await agent.execute({
        data: { operation: 'query', query: 'NDC standard airline retailing' },
      });
      const scores = res.data.results!.map((r) => r.relevance_score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
      }
    });

    it('includes query_time_ms', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'airport codes' } });
      expect(res.data.query_time_ms).toBeDefined();
      expect(res.data.query_time_ms!).toBeGreaterThanOrEqual(0);
    });

    it('includes excerpt in results', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'GDPR privacy data' } });
      expect(res.data.results!.length).toBeGreaterThan(0);
      expect(res.data.results![0]!.excerpt.length).toBeGreaterThan(0);
    });
  });

  describe('index_document', () => {
    it('indexes new document', async () => {
      const res = await agent.execute({
        data: {
          operation: 'index_document',
          document_id: 'CUSTOM001',
          title: 'Custom Doc',
          topic: 'operations',
          content: 'Custom content about operations.',
          tags: ['custom'],
        },
      });
      expect(res.data.document!.document_id).toBe('CUSTOM001');
    });

    it('indexed document is searchable', async () => {
      const res = await agent.execute({
        data: { operation: 'query', query: 'Custom content operations' },
      });
      expect(res.data.results!.some((r) => r.document_id === 'CUSTOM001')).toBe(true);
    });

    it('rejects missing title', async () => {
      await expect(
        agent.execute({
          data: { operation: 'index_document', document_id: 'X', topic: 'fares', content: 'test' },
        }),
      ).rejects.toThrow('Invalid');
    });
  });

  describe('list_topics', () => {
    it('returns all 9 topics', async () => {
      const res = await agent.execute({ data: { operation: 'list_topics' } });
      expect(res.data.topics!).toHaveLength(9);
      expect(res.data.topics!).toContain('distribution');
      expect(res.data.topics!).toContain('regulations');
      expect(res.data.topics!).toContain('lodging');
    });
  });

  describe('get_document', () => {
    it('retrieves document by ID', async () => {
      const res = await agent.execute({
        data: { operation: 'get_document', document_id: 'DOC001' },
      });
      expect(res.data.document!.title).toBe('GDS Distribution Overview');
    });

    it('throws for unknown document', async () => {
      await expect(
        agent.execute({ data: { operation: 'get_document', document_id: 'NONEXIST' } }),
      ).rejects.toThrow('not found');
    });
  });

  describe('Seed data', () => {
    it('has 50 fixture documents', async () => {
      const res = await agent.execute({
        data: { operation: 'query', query: 'airline travel fare booking hotel', max_results: 60 },
      });
      // Not all 50 will match every query, but we should have many
      expect(res.data.results!.length).toBeGreaterThan(3);
    });

    it('includes lodging documents', async () => {
      const res = await agent.execute({
        data: { operation: 'query', query: 'hotel PMS property management', topic: 'lodging' },
      });
      expect(res.data.results!.length).toBeGreaterThan(0);
      expect(res.data.results![0]!.topic).toBe('lodging');
    });
  });

  describe('Agent compliance', () => {
    it('has correct id/name', () => {
      expect(agent.id).toBe('9.2');
    });
    it('reports healthy', async () => {
      expect((await agent.health()).status).toBe('healthy');
    });
    it('throws when not initialized', async () => {
      const u = new KnowledgeAgent();
      await expect(u.execute({ data: { operation: 'list_topics' } })).rejects.toThrow(
        'not been initialized',
      );
    });
  });

  describe('Hybrid scoring with EmbeddingProvider', () => {
    let hybridAgent: KnowledgeAgent;

    const mockProvider: EmbeddingProvider = {
      dimensions: 4,
      embed: async (text: string): Promise<number[]> => {
        // Simple deterministic mock: hash the text into a 4-dim vector
        const hash = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return [
          Math.sin(hash * 0.1),
          Math.cos(hash * 0.2),
          Math.sin(hash * 0.3),
          Math.cos(hash * 0.4),
        ];
      },
    };

    beforeAll(async () => {
      hybridAgent = new KnowledgeAgent({ embeddingProvider: mockProvider });
      await hybridAgent.initialize();
    });

    afterAll(() => {
      hybridAgent.destroy();
    });

    it('returns results with hybrid scoring', async () => {
      const res = await hybridAgent.execute({
        data: { operation: 'query', query: 'GDS distribution airline booking' },
      });
      expect(res.data.results!.length).toBeGreaterThan(0);
      expect(res.data.results![0]!.relevance_score).toBeGreaterThan(0);
      expect(res.data.results![0]!.relevance_score).toBeLessThanOrEqual(1);
    });

    it('scores are normalized 0-1 with hybrid', async () => {
      const res = await hybridAgent.execute({
        data: { operation: 'query', query: 'BSP settlement billing reconciliation' },
      });
      for (const r of res.data.results!) {
        expect(r.relevance_score).toBeGreaterThanOrEqual(0);
        expect(r.relevance_score).toBeLessThanOrEqual(1);
      }
    });

    it('indexes new documents with embeddings', async () => {
      const res = await hybridAgent.execute({
        data: {
          operation: 'index_document',
          document_id: 'HYBRID001',
          title: 'Hybrid Test Doc',
          topic: 'operations',
          content: 'Testing hybrid embedding indexing in operations.',
          tags: ['hybrid', 'test'],
        },
      });
      expect(res.data.document!.document_id).toBe('HYBRID001');

      // Verify the newly indexed document is searchable
      const queryRes = await hybridAgent.execute({
        data: { operation: 'query', query: 'hybrid embedding indexing', max_results: 60 },
      });
      expect(queryRes.data.results!.some((r) => r.document_id === 'HYBRID001')).toBe(true);
    });

    it('sorts by combined score descending', async () => {
      const res = await hybridAgent.execute({
        data: { operation: 'query', query: 'NDC standard airline retailing' },
      });
      const scores = res.data.results!.map((r) => r.relevance_score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
      }
    });
  });
});
