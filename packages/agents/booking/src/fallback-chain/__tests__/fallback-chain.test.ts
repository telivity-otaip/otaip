import { describe, expect, it } from 'vitest';
import { executeFallbackChain } from '../chain-engine.js';
import type { ChannelExecutor, CircuitChecker, FallbackChainInput } from '../types.js';

function mkInput(overrides?: Partial<FallbackChainInput>): FallbackChainInput {
  return {
    primary_channel: 'NDC',
    fallback_channels: ['GDS'],
    operation: 'book',
    carrier: 'BA',
    payload: { offerId: 'test' },
    ...overrides,
  };
}

describe('executeFallbackChain', () => {
  it('succeeds on primary channel — no fallbacks attempted', async () => {
    const executor: ChannelExecutor = async () => ({ booking_ref: 'ABC123' });
    const result = await executeFallbackChain(mkInput(), executor);

    expect(result.success).toBe(true);
    expect(result.successful_channel).toBe('NDC');
    expect(result.result).toEqual({ booking_ref: 'ABC123' });
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]!.status).toBe('success');
  });

  it('falls back to GDS when NDC fails', async () => {
    let callCount = 0;
    const executor: ChannelExecutor = async (channel) => {
      callCount++;
      if (channel === 'NDC') throw new Error('NDC timeout');
      return { booking_ref: 'DEF456' };
    };
    const result = await executeFallbackChain(mkInput(), executor);

    expect(result.success).toBe(true);
    expect(result.successful_channel).toBe('GDS');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]!.status).toBe('failed');
    expect(result.attempts[0]!.error).toContain('NDC timeout');
    expect(result.attempts[1]!.status).toBe('success');
    expect(callCount).toBe(2);
  });

  it('surfaces error when all channels exhausted', async () => {
    const executor: ChannelExecutor = async () => {
      throw new Error('unavailable');
    };
    const result = await executeFallbackChain(mkInput(), executor);

    expect(result.success).toBe(false);
    expect(result.successful_channel).toBeNull();
    expect(result.result).toBeNull();
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts.every((a) => a.status === 'failed')).toBe(true);
  });

  it('skips channels with open circuit breaker', async () => {
    const executor: ChannelExecutor = async () => ({ ok: true });
    const checker: CircuitChecker = (channel) => channel !== 'NDC';
    const result = await executeFallbackChain(mkInput(), executor, checker);

    expect(result.success).toBe(true);
    expect(result.successful_channel).toBe('GDS');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]!.status).toBe('circuit_open');
    expect(result.attempts[1]!.status).toBe('success');
  });

  it('handles DIRECT-only with no fallbacks', async () => {
    const executor: ChannelExecutor = async () => {
      throw new Error('API down');
    };
    const result = await executeFallbackChain(
      mkInput({ primary_channel: 'DIRECT', fallback_channels: [] }),
      executor,
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toHaveLength(1);
  });

  it('tracks total duration across attempts', async () => {
    const executor: ChannelExecutor = async (channel) => {
      await new Promise((r) => setTimeout(r, 10));
      if (channel === 'NDC') throw new Error('slow fail');
      return { ok: true };
    };
    const result = await executeFallbackChain(mkInput(), executor);

    expect(result.total_duration_ms).toBeGreaterThanOrEqual(15);
    expect(result.attempts[0]!.durationMs).toBeGreaterThanOrEqual(5);
  });
});
