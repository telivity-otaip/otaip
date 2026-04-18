/**
 * Standard error types for OTAIP agents.
 */

export class AgentError extends Error {
  constructor(
    message: string,
    public readonly agentId: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class AgentNotInitializedError extends AgentError {
  constructor(agentId: string) {
    super(
      `Agent ${agentId} has not been initialized. Call initialize() first.`,
      agentId,
      'NOT_INITIALIZED',
    );
    this.name = 'AgentNotInitializedError';
  }
}

export class AgentInputValidationError extends AgentError {
  constructor(
    agentId: string,
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`Invalid input for agent ${agentId}: ${field} — ${reason}`, agentId, 'INVALID_INPUT');
    this.name = 'AgentInputValidationError';
  }
}

export class AgentDataUnavailableError extends AgentError {
  constructor(agentId: string, detail: string) {
    super(`Data unavailable for agent ${agentId}: ${detail}`, agentId, 'DATA_UNAVAILABLE');
    this.name = 'AgentDataUnavailableError';
  }
}

/**
 * Thrown by stub agents whose implementation is gated on travel-domain
 * input that the platform does not yet have. The message must describe
 * the specific input still needed.
 */
export class UnimplementedDomainInputError extends AgentError {
  constructor(agentId: string, detail: string) {
    super(
      `Agent ${agentId} requires domain input before it can be implemented: ${detail}`,
      agentId,
      'UNIMPLEMENTED_DOMAIN_INPUT',
    );
    this.name = 'UnimplementedDomainInputError';
  }
}
