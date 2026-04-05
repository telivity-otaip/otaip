/**
 * HookRegistry — register/unregister hooks per lifecycle event,
 * execute in registration order. Errors in hooks are logged and skipped.
 */

import type {
  LifecycleEvent,
  HookHandler,
  HookContext,
  BeforeToolCallResult,
} from './types.js';

export class HookRegistry {
  private readonly hooks = new Map<LifecycleEvent, HookHandler[]>();

  /** Register a handler for a lifecycle event. Returns an unregister function. */
  on(event: LifecycleEvent, handler: HookHandler): () => void {
    let handlers = this.hooks.get(event);
    if (!handlers) {
      handlers = [];
      this.hooks.set(event, handlers);
    }
    handlers.push(handler);

    return () => {
      const list = this.hooks.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    };
  }

  /**
   * Execute all handlers for a lifecycle event in registration order.
   *
   * For 'beforeToolCall': if any handler returns { block: true },
   * execution stops and the block result is returned.
   *
   * Errors in individual handlers are caught and logged — they never
   * crash the loop or prevent subsequent handlers from running.
   */
  async execute(
    event: LifecycleEvent,
    context: HookContext,
  ): Promise<BeforeToolCallResult | void> {
    const handlers = this.hooks.get(event);
    if (!handlers || handlers.length === 0) return;

    for (const handler of handlers) {
      try {
        const result = await handler(context);
        if (
          event === 'beforeToolCall' &&
          result &&
          typeof result === 'object' &&
          'block' in result &&
          result.block
        ) {
          return result as BeforeToolCallResult;
        }
      } catch {
        // Hook errors are swallowed — hooks must not crash the loop.
      }
    }
  }

  /** Number of handlers registered for a given event. */
  count(event: LifecycleEvent): number {
    return this.hooks.get(event)?.length ?? 0;
  }

  /** Remove all handlers for all events. */
  clear(): void {
    this.hooks.clear();
  }
}
