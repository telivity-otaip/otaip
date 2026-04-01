/**
 * STUB — Generates a GPT system prompt from a ConnectAdapter.
 * Full implementation comes in a separate build.
 */

import type { ConnectAdapter } from '../../types.js';

export interface GptInstructionsConfig {
  assistantName: string;
  additionalInstructions?: string;
}

export function generateGptInstructions(
  _adapter: ConnectAdapter,
  _config: GptInstructionsConfig,
): string {
  throw new Error('Not implemented — GPT instructions generator is a stub');
}
