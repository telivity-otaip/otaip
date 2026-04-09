/**
 * Optional mixin interfaces for production agent concerns.
 *
 * These are opt-in capabilities that agents can implement alongside
 * the base Agent interface for idempotency, cancellation, and checkpointing.
 */

/** Agent that guarantees same output for same input. */
export interface Idempotent<TInput> {
  /** Generate a deterministic key from the input for dedup. */
  idempotencyKey(input: TInput): string;
}

/** Agent whose execution can be cancelled mid-flight. */
export interface Cancellable {
  /** Signal cancellation. Agent should stop at next safe point. */
  cancel(): void;
  /** Whether a cancellation has been requested. */
  readonly cancelled: boolean;
}

/** Agent that can save/restore progress for long-running tasks. */
export interface Checkpointable<TState> {
  /** Save current progress. */
  checkpoint(): Promise<TState>;
  /** Restore from a previous checkpoint. */
  restore(state: TState): Promise<void>;
}
