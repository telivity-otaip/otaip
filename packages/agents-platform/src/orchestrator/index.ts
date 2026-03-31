/**
 * Orchestrator — Agent 9.1
 *
 * Coordinates multi-agent workflows as a single callable pipeline.
 */

import type {
  Agent, AgentInput, AgentOutput, AgentHealthStatus,
} from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  OrchestratorInput, OrchestratorOutput,
  WorkflowStep, StepExecutor, WorkflowName,
} from './types.js';

const WORKFLOW_PIPELINES: Record<WorkflowName, string[]> = {
  search_to_price: ['1.1', '1.4', '2.1', '2.2', '2.3'],
  book_to_ticket: ['3.3', '3.1', '3.2', '4.1'],
  full_booking: ['1.1', '1.4', '2.1', '2.2', '2.3', '3.3', '3.1', '3.2', '4.1'],
  exchange_flow: ['5.1', '5.2'],
  refund_flow: ['6.1', '6.2'],
};

const VALID_WORKFLOWS = new Set(Object.keys(WORKFLOW_PIPELINES));

const DEFAULT_TIMEOUT = 30000;

export class OrchestratorAgent
  implements Agent<OrchestratorInput, OrchestratorOutput>
{
  readonly id = '9.1';
  readonly name = 'Orchestrator';
  readonly version = '0.1.0';

  private initialized = false;
  private executor: StepExecutor;

  constructor(executor?: StepExecutor) {
    // Default executor that throws — tests must inject their own
    this.executor = executor ?? (async (_agentId: string, _input: Record<string, unknown>): Promise<Record<string, unknown>> => {
      throw new Error('No step executor configured. Inject one via constructor.');
    });
  }

  setExecutor(executor: StepExecutor): void {
    this.executor = executor;
  }

  async initialize(): Promise<void> { this.initialized = true; }

  async execute(
    input: AgentInput<OrchestratorInput>,
  ): Promise<AgentOutput<OrchestratorOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;
    if (!d.workflow || !VALID_WORKFLOWS.has(d.workflow)) {
      throw new AgentInputValidationError(this.id, 'workflow', 'UNKNOWN_WORKFLOW');
    }

    // Validated above that d.workflow is in VALID_WORKFLOWS
    const pipeline = WORKFLOW_PIPELINES[d.workflow as keyof typeof WORKFLOW_PIPELINES];
    if (!pipeline) throw new AgentInputValidationError(this.id, 'workflow', 'UNKNOWN_WORKFLOW');
    const stopOnError = d.options?.stop_on_error ?? true;
    const timeoutMs = d.options?.timeout_ms ?? DEFAULT_TIMEOUT;

    const startTime = Date.now();
    const steps: WorkflowStep[] = [];
    let currentInput = { ...d.input };
    let overallStatus: 'completed' | 'failed' | 'partial' = 'completed';
    let finalOutput: Record<string, unknown> | undefined;
    let timedOut = false;

    for (const agentId of pipeline) {
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        timedOut = true;
        steps.push({ agent_id: agentId, status: 'skipped', duration_ms: 0, error: 'Workflow timeout exceeded.' });
        overallStatus = 'partial';
        continue;
      }

      if (timedOut) {
        steps.push({ agent_id: agentId, status: 'skipped', duration_ms: 0, error: 'Workflow timeout exceeded.' });
        continue;
      }

      const stepStart = Date.now();
      try {
        const output = await this.executor(agentId, currentInput);
        const duration = Date.now() - stepStart;
        steps.push({ agent_id: agentId, status: 'completed', duration_ms: duration, output });
        currentInput = { ...currentInput, ...output };
        finalOutput = output;
      } catch (err) {
        const duration = Date.now() - stepStart;
        const errorMsg = err instanceof Error ? err.message : String(err);
        steps.push({ agent_id: agentId, status: 'failed', duration_ms: duration, error: errorMsg });

        if (stopOnError) {
          overallStatus = 'failed';
          // Mark remaining as skipped
          const idx = pipeline.indexOf(agentId);
          for (let i = idx + 1; i < pipeline.length; i++) {
            steps.push({ agent_id: pipeline[i]!, status: 'skipped', duration_ms: 0, error: 'Skipped due to prior failure.' });
          }
          break;
        } else {
          overallStatus = 'partial';
        }
      }
    }

    const totalDuration = Date.now() - startTime;

    return {
      data: {
        workflow: d.workflow,
        status: overallStatus,
        steps,
        total_duration_ms: totalDuration,
        final_output: finalOutput,
      },
      confidence: 1.0,
      warnings: overallStatus !== 'completed' ? [`Workflow ${d.workflow} ${overallStatus}.`] : undefined,
      metadata: { agent_id: this.id, agent_version: this.version, workflow: d.workflow, status: overallStatus },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void { this.initialized = false; }
}

export type {
  OrchestratorInput, OrchestratorOutput,
  WorkflowStep, StepExecutor, WorkflowName, WorkflowOptions, StepStatus,
} from './types.js';
