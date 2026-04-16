import { describe, expect, it } from 'vitest';
import {
  checkConfidence,
  resolveFloor,
  validateThresholdAgainstFloor,
} from '../confidence-gate.js';

describe('resolveFloor', () => {
  it('uses the per-action floor by default', () => {
    expect(resolveFloor('query', false)).toBe(0.7);
    expect(resolveFloor('mutation_reversible', false)).toBe(0.9);
    expect(resolveFloor('mutation_irreversible', false)).toBe(0.95);
  });
  it('uses the reference floor for reference agents', () => {
    expect(resolveFloor('query', true)).toBe(0.9);
  });
});

describe('validateThresholdAgainstFloor', () => {
  it('passes when threshold meets floor', () => {
    expect(validateThresholdAgainstFloor('a', 0.7, 'query', false).ok).toBe(true);
    expect(validateThresholdAgainstFloor('a', 0.95, 'mutation_irreversible', false).ok).toBe(true);
  });
  it('rejects when threshold is below floor', () => {
    const r = validateThresholdAgainstFloor('booking', 0.8, 'mutation_irreversible', false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.code).toBe('CONFIDENCE_FLOOR_VIOLATION');
  });
});

describe('checkConfidence', () => {
  it('passes when output meets threshold', () => {
    const r = checkConfidence({
      outputConfidence: 0.9,
      threshold: 0.8,
      actionType: 'query',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects when output is below threshold', () => {
    const r = checkConfidence({
      outputConfidence: 0.5,
      threshold: 0.8,
      actionType: 'query',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.code).toBe('CONFIDENCE_BELOW_THRESHOLD');
  });

  it('enforces the floor even when the contract declares lower', () => {
    // Declared threshold 0.5 but action is mutation_irreversible (floor 0.95)
    const r = checkConfidence({
      outputConfidence: 0.8,
      threshold: 0.5,
      actionType: 'mutation_irreversible',
    });
    expect(r.ok).toBe(false);
  });

  it('missing confidence counts as 0', () => {
    const r = checkConfidence({
      outputConfidence: undefined,
      threshold: 0.7,
      actionType: 'query',
    });
    expect(r.ok).toBe(false);
  });
});
