import { describe, it, expect } from 'vitest';
import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
} from '../../types/agent.js';
import type { Idempotent, Cancellable, Checkpointable } from '../index.js';

describe('Idempotent mixin', () => {
  it('can be combined with Agent interface', () => {
    class IdempotentAgent implements Agent<string, string>, Idempotent<string> {
      readonly id = 'test-idempotent';
      readonly name = 'Test Idempotent Agent';
      readonly version = '1.0.0';

      async initialize(): Promise<void> {
        /* no-op */
      }

      async execute(input: AgentInput<string>): Promise<AgentOutput<string>> {
        return { data: input.data.toUpperCase() };
      }

      async health(): Promise<AgentHealthStatus> {
        return { status: 'healthy' };
      }

      idempotencyKey(input: string): string {
        return `uppercase:${input}`;
      }
    }

    const agent = new IdempotentAgent();
    expect(agent.idempotencyKey('hello')).toBe('uppercase:hello');
  });

  it('generates deterministic keys for same input', () => {
    const keyFn = (input: { query: string; date: string }): string =>
      `search:${input.query}:${input.date}`;

    const input = { query: 'LAX', date: '2026-05-01' };
    expect(keyFn(input)).toBe(keyFn(input));
    expect(keyFn(input)).toBe('search:LAX:2026-05-01');
  });
});

describe('Cancellable mixin', () => {
  it('can be combined with Agent interface', () => {
    class CancellableAgent implements Agent<string, string>, Cancellable {
      readonly id = 'test-cancellable';
      readonly name = 'Test Cancellable Agent';
      readonly version = '1.0.0';

      private _cancelled = false;

      get cancelled(): boolean {
        return this._cancelled;
      }

      cancel(): void {
        this._cancelled = true;
      }

      async initialize(): Promise<void> {
        /* no-op */
      }

      async execute(input: AgentInput<string>): Promise<AgentOutput<string>> {
        if (this.cancelled) {
          return { data: 'cancelled', warnings: ['Execution was cancelled'] };
        }
        return { data: input.data };
      }

      async health(): Promise<AgentHealthStatus> {
        return { status: 'healthy' };
      }
    }

    const agent = new CancellableAgent();
    expect(agent.cancelled).toBe(false);

    agent.cancel();
    expect(agent.cancelled).toBe(true);
  });

  it('tracks cancel signal correctly', () => {
    let _cancelled = false;

    const cancellable: Cancellable = {
      get cancelled() {
        return _cancelled;
      },
      cancel() {
        _cancelled = true;
      },
    };

    expect(cancellable.cancelled).toBe(false);
    cancellable.cancel();
    expect(cancellable.cancelled).toBe(true);
  });
});

describe('Checkpointable mixin', () => {
  interface ProcessingState {
    processedItems: number;
    lastItemId: string;
  }

  it('can be combined with Agent interface', async () => {
    class CheckpointableAgent
      implements Agent<string[], string[]>, Checkpointable<ProcessingState>
    {
      readonly id = 'test-checkpointable';
      readonly name = 'Test Checkpointable Agent';
      readonly version = '1.0.0';

      private processedItems = 0;
      private lastItemId = '';

      async initialize(): Promise<void> {
        /* no-op */
      }

      async execute(input: AgentInput<string[]>): Promise<AgentOutput<string[]>> {
        const results: string[] = [];
        for (const item of input.data) {
          results.push(item.toUpperCase());
          this.processedItems++;
          this.lastItemId = item;
        }
        return { data: results };
      }

      async health(): Promise<AgentHealthStatus> {
        return { status: 'healthy' };
      }

      async checkpoint(): Promise<ProcessingState> {
        return {
          processedItems: this.processedItems,
          lastItemId: this.lastItemId,
        };
      }

      async restore(state: ProcessingState): Promise<void> {
        this.processedItems = state.processedItems;
        this.lastItemId = state.lastItemId;
      }
    }

    const agent = new CheckpointableAgent();
    await agent.initialize();

    await agent.execute({ data: ['a', 'b', 'c'] });
    const savedState = await agent.checkpoint();

    expect(savedState.processedItems).toBe(3);
    expect(savedState.lastItemId).toBe('c');

    const newAgent = new CheckpointableAgent();
    await newAgent.restore(savedState);
    const restoredState = await newAgent.checkpoint();

    expect(restoredState).toEqual(savedState);
  });

  it('supports checkpoint/restore round-trip', async () => {
    let state: ProcessingState = { processedItems: 0, lastItemId: '' };

    const checkpointable: Checkpointable<ProcessingState> = {
      async checkpoint() {
        return { ...state };
      },
      async restore(s: ProcessingState) {
        state = { ...s };
      },
    };

    state = { processedItems: 42, lastItemId: 'item-42' };
    const saved = await checkpointable.checkpoint();

    state = { processedItems: 0, lastItemId: '' };
    expect(state.processedItems).toBe(0);

    await checkpointable.restore(saved);
    expect(state.processedItems).toBe(42);
    expect(state.lastItemId).toBe('item-42');
  });
});
