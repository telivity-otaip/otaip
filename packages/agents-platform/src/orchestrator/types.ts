/**
 * Orchestrator — Types
 *
 * Agent 9.1: Multi-agent workflow coordination.
 */

export type WorkflowName =
  | 'search_to_price'
  | 'book_to_ticket'
  | 'full_booking'
  | 'exchange_flow'
  | 'refund_flow';

export type StepStatus = 'completed' | 'failed' | 'skipped';

export interface WorkflowStep {
  agent_id: string;
  status: StepStatus;
  duration_ms: number;
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowOptions {
  stop_on_error?: boolean;
  timeout_ms?: number;
}

export interface OrchestratorInput {
  workflow: string;
  input: Record<string, unknown>;
  options?: WorkflowOptions;
}

export interface OrchestratorOutput {
  workflow: string;
  status: 'completed' | 'failed' | 'partial';
  steps: WorkflowStep[];
  total_duration_ms: number;
  final_output?: Record<string, unknown>;
}

/** Injectable step executor for testing without real agent imports */
export type StepExecutor = (
  agentId: string,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
