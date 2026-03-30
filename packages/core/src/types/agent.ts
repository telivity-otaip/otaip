/**
 * Base OTAIP Agent interfaces.
 *
 * Every agent in OTAIP implements the Agent interface.
 * This ensures a uniform contract for initialization, execution, and health checks.
 */

export interface AgentInput<T = unknown> {
  data: T;
  metadata?: Record<string, unknown>;
}

export interface AgentOutput<T = unknown> {
  data: T;
  confidence?: number;
  metadata?: Record<string, unknown>;
  warnings?: string[];
}

export interface AgentHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details?: string;
}

export interface Agent<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  initialize(): Promise<void>;
  execute(input: AgentInput<TInput>): Promise<AgentOutput<TOutput>>;
  health(): Promise<AgentHealthStatus>;
}
