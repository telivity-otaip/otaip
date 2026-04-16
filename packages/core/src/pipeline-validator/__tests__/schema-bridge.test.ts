import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from '../schema-bridge.js';

describe('zodToJsonSchema', () => {
  it('converts a simple object schema', () => {
    const schema = z.object({
      origin: z.string(),
      passengerCount: z.number().int().positive(),
      returnDate: z.string().optional(),
    });
    const json = zodToJsonSchema(schema);
    expect(json['type']).toBe('object');
    const properties = json['properties'] as Record<string, unknown>;
    expect(properties).toHaveProperty('origin');
    expect(properties).toHaveProperty('passengerCount');
    expect(json['required']).toEqual(expect.arrayContaining(['origin', 'passengerCount']));
    expect((json['required'] as string[]).includes('returnDate')).toBe(false);
  });

  it('supports enums', () => {
    const schema = z.object({ cabin: z.enum(['economy', 'business']) });
    const json = zodToJsonSchema(schema);
    const cabin = (json['properties'] as Record<string, Record<string, unknown>>)['cabin'];
    expect(cabin?.['enum']).toEqual(['economy', 'business']);
  });

  it('round-trips — schema.safeParse accepts what JSON Schema describes', () => {
    const schema = z.object({
      code: z.string().length(3),
      confidence: z.number().min(0).max(1),
    });
    const json = zodToJsonSchema(schema);
    expect(json['type']).toBe('object');
    // Sanity: the runtime validator (schema) still accepts a valid input.
    expect(schema.safeParse({ code: 'JFK', confidence: 0.95 }).success).toBe(true);
    // And rejects invalid.
    expect(schema.safeParse({ code: 'JF', confidence: 0.95 }).success).toBe(false);
  });
});
