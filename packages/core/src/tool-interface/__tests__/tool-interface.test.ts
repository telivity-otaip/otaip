import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../registry.js';
import { validateToolInput, validateToolOutput } from '../validator.js';
import type { ToolDefinition } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const inputSchema = z.object({
  origin: z.string().length(3),
  destination: z.string().length(3),
});

const outputSchema = z.object({
  distance: z.number().positive(),
  unit: z.enum(['km', 'mi']),
});

function makeTool(overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: 'distance-calculator',
    description: 'Calculate distance between airports',
    inputSchema,
    outputSchema,
    execute: vi.fn().mockResolvedValue({ distance: 5500, unit: 'km' }),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  validateToolInput                                                 */
/* ------------------------------------------------------------------ */

describe('validateToolInput', () => {
  it('returns success with parsed data for valid input', () => {
    const result = validateToolInput(inputSchema, {
      origin: 'JFK',
      destination: 'LHR',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ origin: 'JFK', destination: 'LHR' });
    }
  });

  it('returns field-level issues for invalid input', () => {
    const result = validateToolInput(inputSchema, {
      origin: 'JFKX',
      destination: 42,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      const paths = result.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('origin');
      expect(paths).toContain('destination');
    }
  });

  it('returns issues for missing required fields', () => {
    const result = validateToolInput(inputSchema, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  validateToolOutput                                                */
/* ------------------------------------------------------------------ */

describe('validateToolOutput', () => {
  it('returns success for valid output', () => {
    const result = validateToolOutput(outputSchema, {
      distance: 5500,
      unit: 'km',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ distance: 5500, unit: 'km' });
    }
  });

  it('returns issues for invalid output', () => {
    const result = validateToolOutput(outputSchema, {
      distance: -1,
      unit: 'furlongs',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  ToolRegistry                                                      */
/* ------------------------------------------------------------------ */

describe('ToolRegistry', () => {
  it('registers and retrieves a tool by name', () => {
    const registry = new ToolRegistry();
    const tool = makeTool();
    registry.register(tool);

    expect(registry.get('distance-calculator')).toBe(tool);
    expect(registry.size).toBe(1);
  });

  it('throws on duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool());
    expect(() => registry.register(makeTool())).toThrow(
      'Tool "distance-calculator" is already registered',
    );
  });

  it('returns undefined for unknown tool', () => {
    const registry = new ToolRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('unregisters a tool', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool());
    expect(registry.unregister('distance-calculator')).toBe(true);
    expect(registry.get('distance-calculator')).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it('unregister returns false for unknown tool', () => {
    const registry = new ToolRegistry();
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  describe('isEnabled filtering', () => {
    it('hides disabled tools from get()', () => {
      const registry = new ToolRegistry();
      registry.register(makeTool({ isEnabled: () => false }));
      expect(registry.get('distance-calculator')).toBeUndefined();
    });

    it('shows disabled tools via getIgnoringEnabled()', () => {
      const registry = new ToolRegistry();
      const tool = makeTool({ isEnabled: () => false });
      registry.register(tool);
      expect(registry.getIgnoringEnabled('distance-calculator')).toBe(tool);
    });

    it('listEnabled excludes disabled tools', () => {
      const registry = new ToolRegistry();
      registry.register(makeTool({ name: 'enabled-tool' }));
      registry.register(makeTool({ name: 'disabled-tool', isEnabled: () => false }));

      const enabled = registry.listEnabled();
      expect(enabled).toHaveLength(1);
      expect(enabled[0]!.name).toBe('enabled-tool');
    });

    it('listAll includes disabled tools', () => {
      const registry = new ToolRegistry();
      registry.register(makeTool({ name: 'enabled-tool' }));
      registry.register(makeTool({ name: 'disabled-tool', isEnabled: () => false }));

      expect(registry.listAll()).toHaveLength(2);
    });

    it('responds to dynamic enablement changes', () => {
      const registry = new ToolRegistry();
      let enabled = false;
      registry.register(makeTool({ isEnabled: () => enabled }));

      expect(registry.get('distance-calculator')).toBeUndefined();
      expect(registry.listEnabled()).toHaveLength(0);

      enabled = true;
      expect(registry.get('distance-calculator')).toBeDefined();
      expect(registry.listEnabled()).toHaveLength(1);
    });
  });

  it('clears all tools', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool({ name: 'a' }));
    registry.register(makeTool({ name: 'b' }));
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.listAll()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  End-to-end: register → validate → execute → validate              */
/* ------------------------------------------------------------------ */

describe('end-to-end tool execution', () => {
  it('validates input, executes, and validates output', async () => {
    const registry = new ToolRegistry();
    const tool = makeTool();
    registry.register(tool);

    const resolved = registry.get('distance-calculator')!;
    const input = { origin: 'JFK', destination: 'LHR' };

    const inputResult = validateToolInput(resolved.inputSchema, input);
    expect(inputResult.success).toBe(true);
    if (!inputResult.success) return;

    const rawOutput = await resolved.execute(inputResult.data);

    const outputResult = validateToolOutput(resolved.outputSchema, rawOutput);
    expect(outputResult.success).toBe(true);
    if (outputResult.success) {
      expect(outputResult.data).toEqual({ distance: 5500, unit: 'km' });
    }
  });

  it('rejects execution with invalid input', () => {
    const result = validateToolInput(inputSchema, { origin: 'TOOLONG' });
    expect(result.success).toBe(false);
  });
});
