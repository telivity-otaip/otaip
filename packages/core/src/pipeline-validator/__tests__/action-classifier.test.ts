import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPROVAL_POLICY,
  checkActionClassification,
} from '../action-classifier.js';
import type { GateResult } from '../types.js';

const okGate: GateResult = { gate: 'schema_in', passed: true };
const warningGate: GateResult = {
  gate: 'semantic_in',
  passed: true,
  issues: [
    {
      code: 'W1',
      path: [],
      message: 'minor thing',
      severity: 'warning',
    },
  ],
};

describe('checkActionClassification (default policy)', () => {
  it('passes query actions with no approval token', () => {
    const r = checkActionClassification('query', {}, [okGate]);
    expect(r.ok).toBe(true);
  });

  it('rejects mutation_irreversible without approval token', () => {
    const r = checkActionClassification('mutation_irreversible', {}, [okGate]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.code).toBe('APPROVAL_TOKEN_INVALID');
  });

  it('accepts mutation_irreversible with a valid approval token', () => {
    const r = checkActionClassification(
      'mutation_irreversible',
      { approvalToken: 't-123' },
      [okGate],
    );
    expect(r.ok).toBe(true);
  });

  it('rejects mutation_reversible if prior gates have warnings', () => {
    const r = checkActionClassification('mutation_reversible', {}, [warningGate]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.code).toBe('MUTATION_WITH_WARNINGS');
  });

  it('accepts mutation_reversible when no warnings', () => {
    const r = checkActionClassification('mutation_reversible', {}, [okGate]);
    expect(r.ok).toBe(true);
  });

  it('exposes the default policy requires only irreversible approval', () => {
    expect(DEFAULT_APPROVAL_POLICY.requiresApproval.has('mutation_irreversible')).toBe(true);
    expect(DEFAULT_APPROVAL_POLICY.requiresApproval.has('mutation_reversible')).toBe(false);
    expect(DEFAULT_APPROVAL_POLICY.requiresApproval.has('query')).toBe(false);
  });
});
