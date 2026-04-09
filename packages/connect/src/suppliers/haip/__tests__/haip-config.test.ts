import { describe, it, expect } from 'vitest';
import { validateHaipConfig } from '../config.js';

describe('validateHaipConfig', () => {
  it('accepts a valid config with all fields', () => {
    const config = validateHaipConfig({
      baseUrl: 'http://localhost:3000',
      apiKey: 'test-key',
      timeoutMs: 5000,
      maxRetries: 3,
      baseDelayMs: 500,
    });

    expect(config.baseUrl).toBe('http://localhost:3000');
    expect(config.apiKey).toBe('test-key');
    expect(config.timeoutMs).toBe(5000);
    expect(config.maxRetries).toBe(3);
    expect(config.baseDelayMs).toBe(500);
  });

  it('applies defaults for optional fields', () => {
    const config = validateHaipConfig({
      baseUrl: 'http://localhost:3000',
    });

    expect(config.apiKey).toBe('');
    expect(config.timeoutMs).toBe(10_000);
    expect(config.maxRetries).toBe(2);
    expect(config.baseDelayMs).toBe(1_000);
  });

  it('strips trailing slashes from baseUrl', () => {
    const config = validateHaipConfig({
      baseUrl: 'http://localhost:3000///',
    });

    expect(config.baseUrl).toBe('http://localhost:3000');
  });

  it('throws on missing baseUrl', () => {
    expect(() => validateHaipConfig({})).toThrow('Invalid HAIP config');
  });

  it('throws on empty baseUrl', () => {
    expect(() => validateHaipConfig({ baseUrl: '' })).toThrow('Invalid HAIP config');
  });

  it('throws on negative timeoutMs', () => {
    expect(() => validateHaipConfig({ baseUrl: 'http://localhost:3000', timeoutMs: -1 })).toThrow(
      'Invalid HAIP config',
    );
  });

  it('throws on non-integer maxRetries', () => {
    expect(() => validateHaipConfig({ baseUrl: 'http://localhost:3000', maxRetries: 1.5 })).toThrow(
      'Invalid HAIP config',
    );
  });

  it('allows zero retries', () => {
    const config = validateHaipConfig({
      baseUrl: 'http://localhost:3000',
      maxRetries: 0,
    });

    expect(config.maxRetries).toBe(0);
  });
});
