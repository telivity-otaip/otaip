import { describe, expect, it, beforeEach } from 'vitest';
import { PnrRetrieval } from '../index.js';

describe('PnrRetrieval (Agent 3.8)', () => {
  let agent: PnrRetrieval;

  beforeEach(async () => {
    agent = new PnrRetrieval();
    await agent.initialize();
  });

  it('has correct id, name, version', () => {
    expect(agent.id).toBe('3.8');
    expect(agent.name).toBe('PNR Retrieval');
    expect(agent.version).toBe('0.1.0');
  });

  it('retrieves a PNR with default source (AMADEUS)', async () => {
    const result = await agent.execute({
      data: { record_locator: 'ABC123' },
    });
    expect(result.data.record_locator).toBe('ABC123');
    expect(result.data.source).toBe('AMADEUS');
    expect(result.data.booking_status).toBe('CONFIRMED');
    expect(result.confidence).toBe(1.0);
  });

  it('retrieves a PNR with explicit source', async () => {
    const result = await agent.execute({
      data: { record_locator: 'XYZ789', source: 'SABRE' },
    });
    expect(result.data.source).toBe('SABRE');
  });

  it('throws before initialize', async () => {
    const uninit = new PnrRetrieval();
    await expect(
      uninit.execute({ data: { record_locator: 'ABC123' } }),
    ).rejects.toThrow('not been initialized');
  });

  it('rejects empty record_locator', async () => {
    await expect(
      agent.execute({ data: { record_locator: '' } }),
    ).rejects.toThrow('record_locator');
  });

  it('rejects record_locator with invalid characters', async () => {
    await expect(
      agent.execute({ data: { record_locator: 'abc-12' } }),
    ).rejects.toThrow('record_locator');
  });

  it('rejects invalid source', async () => {
    await expect(
      // @ts-expect-error — intentionally invalid
      agent.execute({ data: { record_locator: 'ABC123', source: 'INVALID' } }),
    ).rejects.toThrow('source');
  });

  it('reports healthy after initialize', async () => {
    const health = await agent.health();
    expect(health.status).toBe('healthy');
  });

  it('reports unhealthy before initialize', async () => {
    const uninit = new PnrRetrieval();
    const health = await uninit.health();
    expect(health.status).toBe('unhealthy');
  });
});
