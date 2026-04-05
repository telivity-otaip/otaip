/**
 * AgentLoop — deterministic message→tool→response cycle.
 *
 * Accepts a ToolRegistry for tool dispatch and a ModelCallFn for LLM calls.
 * Validates tool inputs/outputs via the schema-aware tool interface (Module 1).
 * Optionally integrates HookRegistry for lifecycle hooks (Module 3).
 */

import type { ToolRegistry } from '../tool-interface/registry.js';
import { validateToolInput, validateToolOutput } from '../tool-interface/validator.js';
import type { HookRegistry } from '../lifecycle/hook-registry.js';
import type { HookContext } from '../lifecycle/types.js';
import type {
  LoopConfig,
  LoopState,
  LoopPhase,
  LoopMessage,
  LoopEvent,
  ToolCall,
  ToolResult,
  ModelCallFn,
} from './types.js';

const DEFAULT_CONFIG: LoopConfig = {
  maxIterations: 25,
  stopConditions: [],
};

export class AgentLoop {
  private readonly config: LoopConfig;
  private readonly toolRegistry: ToolRegistry;
  private readonly modelCall: ModelCallFn;
  private readonly hooks: HookRegistry | undefined;

  constructor(
    toolRegistry: ToolRegistry,
    modelCall: ModelCallFn,
    config?: Partial<LoopConfig>,
  ) {
    this.toolRegistry = toolRegistry;
    this.modelCall = modelCall;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hooks = this.config.hooks;
  }

  /**
   * Run the agent loop starting from the given messages.
   * Returns the final state when the loop completes or hits a stop condition.
   */
  async run(initialMessages: LoopMessage[]): Promise<LoopState> {
    const messages: LoopMessage[] = [...initialMessages];
    let phase: LoopPhase = 'running';
    let iteration = 0;

    const makeState = (): LoopState => ({ phase, iteration, messages: [...messages] });

    this.emit({ type: 'loop_start', state: makeState() });
    await this.hooks?.execute('onLoopStart', { state: makeState() });

    while (phase === 'running' || phase === 'tool_result') {
      if (iteration >= this.config.maxIterations) {
        phase = 'error';
        const state = makeState();
        const error = new Error(`Max iterations (${this.config.maxIterations}) reached`);
        this.emit({ type: 'error', state, error });
        await this.hooks?.execute('onError', { state, error });
        break;
      }

      // Call the model
      let response: LoopMessage;
      try {
        response = await this.modelCall(messages);
      } catch (error) {
        phase = 'error';
        const state = makeState();
        this.emit({ type: 'error', state, error });
        await this.hooks?.execute('onError', { state, error });
        break;
      }

      messages.push(response);
      iteration++;

      // Check if model wants to call tools
      if (response.toolCalls && response.toolCalls.length > 0) {
        phase = 'tool_call';

        const toolResults: ToolResult[] = [];

        for (const toolCall of response.toolCalls) {
          const hookContext: HookContext = {
            state: { phase, iteration, messages: [...messages] },
            toolCall,
          };

          this.emit({
            type: 'before_tool_call',
            state: hookContext.state,
            toolCall,
          });

          // Check beforeToolCall hooks for blocking
          const hookResult = await this.hooks?.execute('beforeToolCall', hookContext);
          if (hookResult && 'block' in hookResult && hookResult.block) {
            toolResults.push({
              toolCallId: toolCall.id,
              output: `Blocked by hook: ${hookResult.reason ?? 'no reason given'}`,
              isError: true,
            });
            continue;
          }

          const result = await this.executeTool(toolCall);
          toolResults.push(result);

          this.emit({
            type: 'after_tool_call',
            state: { phase, iteration, messages: [...messages] },
            toolCall,
            toolResult: result,
          });
          await this.hooks?.execute('afterToolCall', {
            state: { phase, iteration, messages: [...messages] },
            toolCall,
            toolResult: result,
          });
        }

        // Append tool results as a message
        const toolResultMessage: LoopMessage = {
          role: 'tool_result',
          content: toolResults.map((r) =>
            r.isError ? `Error: ${String(r.output)}` : JSON.stringify(r.output),
          ).join('\n'),
          toolResults,
        };
        messages.push(toolResultMessage);
        phase = 'tool_result';
      } else {
        // No tool calls — model produced a final answer
        phase = 'complete';
        await this.hooks?.execute('onComplete', { state: makeState() });
      }

      // Check custom stop conditions
      const currentState = makeState();
      if (this.config.stopConditions.some((cond) => cond(currentState))) {
        phase = 'complete';
        break;
      }
    }

    const finalState = makeState();
    this.emit({ type: 'loop_end', state: finalState });
    await this.hooks?.execute('onLoopEnd', { state: finalState });
    return finalState;
  }

  private async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.toolRegistry.get(toolCall.name);

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        output: `Tool "${toolCall.name}" not found or not enabled`,
        isError: true,
      };
    }

    // Validate input
    const inputResult = validateToolInput(tool.inputSchema, toolCall.input);
    if (!inputResult.success) {
      const issueStr = inputResult.issues
        .map((i) => `${String(i.path.join('.'))}: ${i.message}`)
        .join('; ');
      return {
        toolCallId: toolCall.id,
        output: `Invalid input: ${issueStr}`,
        isError: true,
      };
    }

    // Execute
    let rawOutput: unknown;
    try {
      rawOutput = await tool.execute(inputResult.data);
    } catch (error) {
      return {
        toolCallId: toolCall.id,
        output: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }

    // Validate output
    const outputResult = validateToolOutput(tool.outputSchema, rawOutput);
    if (!outputResult.success) {
      const issueStr = outputResult.issues
        .map((i) => `${String(i.path.join('.'))}: ${i.message}`)
        .join('; ');
      return {
        toolCallId: toolCall.id,
        output: `Invalid tool output: ${issueStr}`,
        isError: true,
      };
    }

    return {
      toolCallId: toolCall.id,
      output: outputResult.data,
      isError: false,
    };
  }

  private emit(event: LoopEvent): void {
    this.config.onEvent?.(event);
  }
}
