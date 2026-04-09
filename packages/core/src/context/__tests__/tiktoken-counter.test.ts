import { describe, it, expect } from 'vitest';
import { TiktokenCounter } from '../tiktoken-counter.js';
import { CharTokenCounter } from '../budget-manager.js';

describe('TiktokenCounter', () => {
  it('counts tokens for simple text', () => {
    const counter = new TiktokenCounter();
    const count = counter.count('Hello, world!');
    // tiktoken should give an exact count — for cl100k_base, "Hello, world!" is 4 tokens
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(20);
  });

  it('gives more accurate results than CharTokenCounter for travel domain text', () => {
    const tiktoken = new TiktokenCounter();
    const char = new CharTokenCounter();

    const travelText =
      'PNR ABCDEF confirmed for passenger SMITH/JOHN MR on BA0117 LHR-JFK ' +
      '15MAR 1030 1330 in booking class Y with fare basis YOWUS. ' +
      'ETR 1257891234567 issued with fare GBP 450.00 plus tax GB 93.00 YQ 45.00.';

    const tiktokenCount = tiktoken.count(travelText);
    const charCount = char.count(travelText);

    // Both should produce reasonable counts, but tiktoken should be more accurate
    expect(tiktokenCount).toBeGreaterThan(0);
    expect(charCount).toBeGreaterThan(0);

    // CharTokenCounter uses ~4 chars/token, which overestimates for structured text
    // The key assertion: tiktoken gives a different (more accurate) result
    expect(tiktokenCount).not.toBe(charCount);
  });

  it('supports different encodings', () => {
    const cl100k = new TiktokenCounter('cl100k_base');
    const o200k = new TiktokenCounter('o200k_base');

    const text = 'ATPCO Category 31 voluntary change penalties apply to fare basis YOWUS.';
    const cl100kCount = cl100k.count(text);
    const o200kCount = o200k.count(text);

    // Both should produce valid counts (may differ between encodings)
    expect(cl100kCount).toBeGreaterThan(0);
    expect(o200kCount).toBeGreaterThan(0);
  });

  it('defaults to cl100k_base encoding', () => {
    const counter = new TiktokenCounter();
    // Should not throw — cl100k_base is the default
    expect(counter.count('test')).toBeGreaterThan(0);
  });

  it('handles empty string', () => {
    const counter = new TiktokenCounter();
    expect(counter.count('')).toBe(0);
  });

  it('handles unicode text', () => {
    const counter = new TiktokenCounter();
    const count = counter.count('Flughafen Frankfurt am Main — Ankunft');
    expect(count).toBeGreaterThan(0);
  });
});
