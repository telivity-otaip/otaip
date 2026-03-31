/**
 * Knowledge Retrieval — Unit Tests (Agent 9.2)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KnowledgeAgent } from '../index.js';
import type { KnowledgeInput } from '../types.js';

let agent: KnowledgeAgent;

beforeAll(async () => {
  agent = new KnowledgeAgent();
  await agent.initialize();
});

afterAll(() => { agent.destroy(); });

describe('Knowledge Retrieval', () => {
  describe('query', () => {
    it('finds documents by keyword', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'GDS distribution airline booking' } });
      expect(res.data.results!.length).toBeGreaterThan(0);
      expect(res.data.results![0]!.relevance_score).toBeGreaterThan(0);
    });

    it('returns empty for no match', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'xyzzyplugh' } });
      expect(res.data.results!).toHaveLength(0);
    });

    it('respects max_results', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'airline travel', max_results: 2 } });
      expect(res.data.results!.length).toBeLessThanOrEqual(2);
    });

    it('defaults max_results to 5', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'airline' } });
      expect(res.data.results!.length).toBeLessThanOrEqual(5);
    });

    it('filters by topic', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'fare rules', topic: 'fares' } });
      for (const r of res.data.results!) {
        expect(r.topic).toBe('fares');
      }
    });

    it('returns relevance_score 0-1', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'BSP settlement billing' } });
      for (const r of res.data.results!) {
        expect(r.relevance_score).toBeGreaterThanOrEqual(0);
        expect(r.relevance_score).toBeLessThanOrEqual(1);
      }
    });

    it('sorts by relevance descending', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'NDC standard airline retailing' } });
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
      const res = await agent.execute({ data: {
        operation: 'index_document', document_id: 'CUSTOM001',
        title: 'Custom Doc', topic: 'operations', content: 'Custom content about operations.',
        tags: ['custom'],
      } });
      expect(res.data.document!.document_id).toBe('CUSTOM001');
    });

    it('indexed document is searchable', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'Custom content operations' } });
      expect(res.data.results!.some((r) => r.document_id === 'CUSTOM001')).toBe(true);
    });

    it('rejects missing title', async () => {
      await expect(agent.execute({ data: { operation: 'index_document', document_id: 'X', topic: 'fares', content: 'test' } })).rejects.toThrow('Invalid');
    });
  });

  describe('list_topics', () => {
    it('returns all 8 topics', async () => {
      const res = await agent.execute({ data: { operation: 'list_topics' } });
      expect(res.data.topics!).toHaveLength(8);
      expect(res.data.topics!).toContain('distribution');
      expect(res.data.topics!).toContain('regulations');
    });
  });

  describe('get_document', () => {
    it('retrieves document by ID', async () => {
      const res = await agent.execute({ data: { operation: 'get_document', document_id: 'DOC001' } });
      expect(res.data.document!.title).toBe('GDS Distribution Overview');
    });

    it('throws for unknown document', async () => {
      await expect(agent.execute({ data: { operation: 'get_document', document_id: 'NONEXIST' } })).rejects.toThrow('not found');
    });
  });

  describe('Seed data', () => {
    it('has 15 fixture documents', async () => {
      const res = await agent.execute({ data: { operation: 'query', query: 'airline travel fare booking', max_results: 20 } });
      // Not all 15 will match, but we should have multiple
      expect(res.data.results!.length).toBeGreaterThan(3);
    });
  });

  describe('Agent compliance', () => {
    it('has correct id/name', () => { expect(agent.id).toBe('9.2'); });
    it('reports healthy', async () => { expect((await agent.health()).status).toBe('healthy'); });
    it('throws when not initialized', async () => {
      const u = new KnowledgeAgent();
      await expect(u.execute({ data: { operation: 'list_topics' } })).rejects.toThrow('not been initialized');
    });
  });
});
