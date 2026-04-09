import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EquipmentTypeResolver } from '../index.js';

let agent: EquipmentTypeResolver;
beforeAll(async () => {
  agent = new EquipmentTypeResolver();
  await agent.initialize();
});
afterAll(() => {
  agent.destroy();
});

describe('EquipmentTypeResolver', () => {
  describe('resolve', () => {
    it('resolves Boeing 737-800', async () => {
      const r = await agent.execute({ data: { operation: 'resolve', code: '73H' } });
      expect(r.data.equipment).toBeDefined();
      expect(r.data.equipment!.manufacturer).toBe('Boeing');
      expect(r.data.equipment!.family).toBe('737 Next Generation');
      expect(r.data.equipment!.bodyType).toBe('narrow');
    });
    it('resolves A380', async () => {
      const r = await agent.execute({ data: { operation: 'resolve', code: '388' } });
      expect(r.data.equipment!.manufacturer).toBe('Airbus');
      expect(r.data.equipment!.bodyType).toBe('wide');
      expect(r.data.equipment!.maxPaxCapacity).toBe(853);
    });
    it('resolves Embraer E190', async () => {
      const r = await agent.execute({ data: { operation: 'resolve', code: 'E90' } });
      expect(r.data.equipment!.bodyType).toBe('regional_jet');
    });
    it('resolves ATR-72', async () => {
      const r = await agent.execute({ data: { operation: 'resolve', code: 'AT7' } });
      expect(r.data.equipment!.bodyType).toBe('turboprop');
    });
    it('resolves Bombardier CRJ-900', async () => {
      const r = await agent.execute({ data: { operation: 'resolve', code: 'CR9' } });
      expect(r.data.equipment!.manufacturer).toBe('Bombardier');
    });
    it('returns undefined for unknown code', async () => {
      const r = await agent.execute({ data: { operation: 'resolve', code: 'ZZZ' } });
      expect(r.data.equipment).toBeUndefined();
      expect(r.confidence).toBe(0);
    });
    it('is case-insensitive', async () => {
      const r = await agent.execute({ data: { operation: 'resolve', code: '77w' } });
      expect(r.data.equipment!.iataCode).toBe('77W');
    });
    it('resolves A320neo alias 32N', async () => {
      const r = await agent.execute({ data: { operation: 'resolve', code: '32N' } });
      expect(r.data.equipment!.family).toBe('A320neo');
    });
  });

  describe('getSeatingConfig', () => {
    it('returns Y seats for 320', async () => {
      const r = await agent.execute({
        data: { operation: 'getSeatingConfig', code: '320', cabin: 'Y' },
      });
      expect(r.data.seatCount).toBe(138);
    });
    it('returns F seats for 77W', async () => {
      const r = await agent.execute({
        data: { operation: 'getSeatingConfig', code: '77W', cabin: 'F' },
      });
      expect(r.data.seatCount).toBe(8);
    });
    it('returns undefined for cabin not available on E90', async () => {
      const r = await agent.execute({
        data: { operation: 'getSeatingConfig', code: 'E90', cabin: 'F' },
      });
      expect(r.data.seatCount).toBeUndefined();
    });
    it('returns undefined for unknown code', async () => {
      const r = await agent.execute({
        data: { operation: 'getSeatingConfig', code: 'ZZZ', cabin: 'Y' },
      });
      expect(r.data.seatCount).toBeUndefined();
    });
  });

  describe('isWidebody', () => {
    it('777-300ER is widebody', async () => {
      const r = await agent.execute({ data: { operation: 'isWidebody', code: '77W' } });
      expect(r.data.isWidebody).toBe(true);
    });
    it('A320 is not widebody', async () => {
      const r = await agent.execute({ data: { operation: 'isWidebody', code: '320' } });
      expect(r.data.isWidebody).toBe(false);
    });
    it('A380 is widebody', async () => {
      const r = await agent.execute({ data: { operation: 'isWidebody', code: '388' } });
      expect(r.data.isWidebody).toBe(true);
    });
    it('unknown code returns undefined', async () => {
      const r = await agent.execute({ data: { operation: 'isWidebody', code: 'ZZZ' } });
      expect(r.data.isWidebody).toBeUndefined();
    });
  });

  describe('getSimilarTypes', () => {
    it('returns Boeing narrowbodies for 73H', async () => {
      const r = await agent.execute({ data: { operation: 'getSimilarTypes', code: '73H' } });
      expect(r.data.similarTypes!.length).toBeGreaterThan(0);
      expect(r.data.similarTypes).toContain('739');
      expect(r.data.similarTypes).toContain('752');
    });
    it('returns Airbus widebodies for 332', async () => {
      const r = await agent.execute({ data: { operation: 'getSimilarTypes', code: '332' } });
      expect(r.data.similarTypes).toContain('333');
      expect(r.data.similarTypes).toContain('388');
    });
    it('returns empty for unknown code', async () => {
      const r = await agent.execute({ data: { operation: 'getSimilarTypes', code: 'ZZZ' } });
      expect(r.data.similarTypes).toEqual([]);
    });
  });

  describe('agent compliance', () => {
    it('has correct id/name', () => {
      expect(agent.id).toBe('0.5');
      expect(agent.name).toBe('Equipment Type Resolver');
    });
    it('reports healthy', async () => {
      expect((await agent.health()).status).toBe('healthy');
    });
    it('throws when not initialized', async () => {
      const u = new EquipmentTypeResolver();
      await expect(u.execute({ data: { operation: 'resolve', code: '320' } })).rejects.toThrow(
        'not been initialized',
      );
    });
  });
});
