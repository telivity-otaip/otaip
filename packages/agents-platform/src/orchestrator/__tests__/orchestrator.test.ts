/**
 * Orchestrator — Unit Tests (Agent 9.1)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OrchestratorAgent } from '../index.js';
import type { OrchestratorInput, StepExecutor } from '../types.js';

const successExecutor: StepExecutor = async (agentId, input) => {
  return { ...input, [`result_${agentId}`]: `output_from_${agentId}` };
};

const failAtAgent: (failId: string) => StepExecutor = (failId) => async (agentId, input) => {
  if (agentId === failId) throw new Error(`Agent ${agentId} failed.`);
  return { ...input, [`result_${agentId}`]: 'ok' };
};

let agent: OrchestratorAgent;

beforeAll(async () => {
  agent = new OrchestratorAgent(successExecutor);
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function makeInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return { workflow: 'exchange_flow', input: { ticket: '1234567890123' }, ...overrides };
}

describe('Orchestrator', () => {
  describe('Successful workflows', () => {
    it('completes exchange_flow (2 steps)', async () => {
      const res = await agent.execute({ data: makeInput() });
      expect(res.data.status).toBe('completed');
      expect(res.data.steps).toHaveLength(2);
      expect(res.data.steps.every((s) => s.status === 'completed')).toBe(true);
    });

    it('completes refund_flow (2 steps)', async () => {
      const res = await agent.execute({ data: makeInput({ workflow: 'refund_flow' }) });
      expect(res.data.status).toBe('completed');
      expect(res.data.steps).toHaveLength(2);
    });

    it('completes search_to_price (5 steps)', async () => {
      const res = await agent.execute({ data: makeInput({ workflow: 'search_to_price' }) });
      expect(res.data.steps).toHaveLength(5);
      expect(res.data.status).toBe('completed');
    });

    it('completes full_booking (9 steps)', async () => {
      const res = await agent.execute({ data: makeInput({ workflow: 'full_booking' }) });
      expect(res.data.steps).toHaveLength(9);
    });

    it('records duration per step', async () => {
      const res = await agent.execute({ data: makeInput() });
      for (const step of res.data.steps) {
        expect(step.duration_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns final_output from last step', async () => {
      const res = await agent.execute({ data: makeInput() });
      expect(res.data.final_output).toBeDefined();
    });

    it('passes output forward between steps', async () => {
      const res = await agent.execute({ data: makeInput() });
      // Last step should have result from first step in its output
      expect(res.data.final_output!['result_5.1']).toBe('output_from_5.1');
    });
  });

  describe('Error handling', () => {
    it('stop_on_error=true halts pipeline', async () => {
      agent.setExecutor(failAtAgent('5.2'));
      const res = await agent.execute({ data: makeInput({ options: { stop_on_error: true } }) });
      expect(res.data.status).toBe('failed');
      const failed = res.data.steps.find((s) => s.status === 'failed');
      expect(failed!.agent_id).toBe('5.2');
      agent.setExecutor(successExecutor); // restore
    });

    it('stop_on_error=false continues after failure', async () => {
      agent.setExecutor(failAtAgent('5.1'));
      const res = await agent.execute({ data: makeInput({ options: { stop_on_error: false } }) });
      expect(res.data.status).toBe('partial');
      expect(res.data.steps.every((s) => s.status !== 'skipped')).toBe(true); // none skipped
      agent.setExecutor(successExecutor);
    });

    it('marks remaining steps as skipped on stop_on_error', async () => {
      agent.setExecutor(failAtAgent('5.1'));
      const res = await agent.execute({ data: makeInput({ options: { stop_on_error: true } }) });
      const skipped = res.data.steps.filter((s) => s.status === 'skipped');
      expect(skipped.length).toBe(1); // 5.2 skipped
      agent.setExecutor(successExecutor);
    });

    it('records error message on failed step', async () => {
      agent.setExecutor(failAtAgent('5.1'));
      const res = await agent.execute({ data: makeInput() });
      const failed = res.data.steps.find((s) => s.status === 'failed');
      expect(failed!.error).toContain('failed');
      agent.setExecutor(successExecutor);
    });
  });

  describe('Timeout', () => {
    it('marks steps as skipped when timeout exceeded', async () => {
      const slowExecutor: StepExecutor = async (agentId, input) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ...input, result: agentId };
      };
      agent.setExecutor(slowExecutor);
      const res = await agent.execute({
        data: makeInput({ workflow: 'full_booking', options: { timeout_ms: 10 } }),
      });
      expect(res.data.status).toBe('partial');
      expect(res.data.steps.some((s) => s.status === 'skipped')).toBe(true);
      agent.setExecutor(successExecutor);
    });
  });

  describe('Input validation', () => {
    it('rejects unknown workflow', async () => {
      await expect(agent.execute({ data: makeInput({ workflow: 'nonexistent' }) })).rejects.toThrow(
        'UNKNOWN_WORKFLOW',
      );
    });
  });

  describe('Agent compliance', () => {
    it('has correct id/name', () => {
      expect(agent.id).toBe('9.1');
      expect(agent.name).toBe('Orchestrator');
    });
    it('reports healthy', async () => {
      expect((await agent.health()).status).toBe('healthy');
    });
    it('throws when not initialized', async () => {
      const u = new OrchestratorAgent(successExecutor);
      await expect(u.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });
    it('warns on non-completed workflow', async () => {
      agent.setExecutor(failAtAgent('5.1'));
      const res = await agent.execute({ data: makeInput() });
      expect(res.warnings).toBeDefined();
      agent.setExecutor(successExecutor);
    });
  });
});
