import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CountryRegulatoryResolver, REGULATORY_DATA_DISCLAIMER } from '../index.js';

let agent: CountryRegulatoryResolver;
beforeAll(async () => { agent = new CountryRegulatoryResolver(); await agent.initialize(); });
afterAll(() => { agent.destroy(); });

describe('CountryRegulatoryResolver', () => {
  describe('getAPISRequirements', () => {
    it('US requires all fields and 72h advance', async () => {
      const r = await agent.execute({ data: { operation: 'getAPISRequirements', countryCode: 'US' } });
      expect(r.data.apis!.requiresAPIS).toBe(true);
      expect(r.data.apis!.advanceSubmissionHours).toBe(72);
      expect(r.data.apis!.requiredFields).toContain('visa_number');
      expect(r.data.apis!.requiredFields).toContain('resident_address');
    });
    it('UK requires passport/nationality/dob/gender/expiry', async () => {
      const r = await agent.execute({ data: { operation: 'getAPISRequirements', countryCode: 'GB' } });
      expect(r.data.apis!.requiresAPIS).toBe(true);
      expect(r.data.apis!.requiredFields).toContain('expiry_date');
      expect(r.data.apis!.requiredFields).not.toContain('resident_address');
    });
    it('AU requires address', async () => {
      const r = await agent.execute({ data: { operation: 'getAPISRequirements', countryCode: 'AU' } });
      expect(r.data.apis!.requiredFields).toContain('resident_address');
    });
    it('Canada requires APIS', async () => {
      const r = await agent.execute({ data: { operation: 'getAPISRequirements', countryCode: 'CA' } });
      expect(r.data.apis!.requiresAPIS).toBe(true);
    });
    it('Schengen countries require basic 4 fields', async () => {
      const r = await agent.execute({ data: { operation: 'getAPISRequirements', countryCode: 'DE' } });
      expect(r.data.apis!.requiresAPIS).toBe(true);
      expect(r.data.apis!.requiredFields).toContain('passport_number');
      expect(r.data.apis!.requiredFields).toContain('nationality');
      expect(r.data.apis!.requiredFields).toContain('dob');
      expect(r.data.apis!.requiredFields).toContain('gender');
    });
    it('France is Schengen', async () => {
      const r = await agent.execute({ data: { operation: 'getAPISRequirements', countryCode: 'FR' } });
      expect(r.data.apis!.requiresAPIS).toBe(true);
    });
    it('non-listed country has no APIS', async () => {
      const r = await agent.execute({ data: { operation: 'getAPISRequirements', countryCode: 'KE' } });
      expect(r.data.apis!.requiresAPIS).toBe(false);
      expect(r.data.apis!.requiredFields).toHaveLength(0);
    });
    it('rejects invalid country code', async () => {
      await expect(agent.execute({ data: { operation: 'getAPISRequirements', countryCode: 'LONG' } })).rejects.toThrow('Invalid');
    });
  });

  describe('getVisaRequirement', () => {
    it('US passport → EU visa-free', async () => {
      const r = await agent.execute({ data: { operation: 'getVisaRequirement', nationalityCode: 'US', destinationCode: 'DE' } });
      expect(r.data.visa!.requirement).toBe('visa_free');
    });
    it('US passport → AU eta_required', async () => {
      const r = await agent.execute({ data: { operation: 'getVisaRequirement', nationalityCode: 'US', destinationCode: 'AU' } });
      expect(r.data.visa!.requirement).toBe('eta_required');
    });
    it('US passport → IN visa_required', async () => {
      const r = await agent.execute({ data: { operation: 'getVisaRequirement', nationalityCode: 'US', destinationCode: 'IN' } });
      expect(r.data.visa!.requirement).toBe('visa_required');
    });
    it('US passport → AE visa_on_arrival', async () => {
      const r = await agent.execute({ data: { operation: 'getVisaRequirement', nationalityCode: 'US', destinationCode: 'AE' } });
      expect(r.data.visa!.requirement).toBe('visa_on_arrival');
    });
    it('RS passport → US visa_required', async () => {
      const r = await agent.execute({ data: { operation: 'getVisaRequirement', nationalityCode: 'RS', destinationCode: 'US' } });
      expect(r.data.visa!.requirement).toBe('visa_required');
    });
    it('RS passport → EU visa_free', async () => {
      const r = await agent.execute({ data: { operation: 'getVisaRequirement', nationalityCode: 'RS', destinationCode: 'DE' } });
      expect(r.data.visa!.requirement).toBe('visa_free');
    });
    it('RS passport → TR visa_free', async () => {
      const r = await agent.execute({ data: { operation: 'getVisaRequirement', nationalityCode: 'RS', destinationCode: 'TR' } });
      expect(r.data.visa!.requirement).toBe('visa_free');
    });
    it('unknown pair defaults to visa_required', async () => {
      const r = await agent.execute({ data: { operation: 'getVisaRequirement', nationalityCode: 'XX', destinationCode: 'YY' } });
      expect(r.data.visa!.requirement).toBe('visa_required');
      expect(r.data.visa!.notes).toContain('embassy');
    });
    it('low confidence for unknown pair', async () => {
      const r = await agent.execute({ data: { operation: 'getVisaRequirement', nationalityCode: 'XX', destinationCode: 'YY' } });
      expect(r.confidence).toBeLessThan(1.0);
    });
    it('rejects invalid nationality code', async () => {
      await expect(agent.execute({ data: { operation: 'getVisaRequirement', nationalityCode: 'LONG', destinationCode: 'US' } })).rejects.toThrow('Invalid');
    });
  });

  describe('getRestrictionLevel', () => {
    it('US is level 1', async () => {
      const r = await agent.execute({ data: { operation: 'getRestrictionLevel', countryCode: 'US' } });
      expect(r.data.restriction!.level).toBe(1);
    });
    it('Mexico is level 2', async () => {
      const r = await agent.execute({ data: { operation: 'getRestrictionLevel', countryCode: 'MX' } });
      expect(r.data.restriction!.level).toBe(2);
    });
    it('Nigeria is level 3', async () => {
      const r = await agent.execute({ data: { operation: 'getRestrictionLevel', countryCode: 'NG' } });
      expect(r.data.restriction!.level).toBe(3);
      expect(r.warnings).toBeDefined();
    });
    it('Afghanistan is level 4', async () => {
      const r = await agent.execute({ data: { operation: 'getRestrictionLevel', countryCode: 'AF' } });
      expect(r.data.restriction!.level).toBe(4);
    });
    it('unknown country defaults to level 2', async () => {
      const r = await agent.execute({ data: { operation: 'getRestrictionLevel', countryCode: 'XX' } });
      expect(r.data.restriction!.level).toBe(2);
    });
    it('includes lastUpdated', async () => {
      const r = await agent.execute({ data: { operation: 'getRestrictionLevel', countryCode: 'US' } });
      expect(r.data.restriction!.lastUpdated).toBe('2026-01-01');
    });
  });

  describe('disclaimer', () => {
    it('exports REGULATORY_DATA_DISCLAIMER', () => {
      expect(REGULATORY_DATA_DISCLAIMER).toContain('operational reference only');
    });
  });

  describe('agent compliance', () => {
    it('has correct id/name', () => { expect(agent.id).toBe('0.7'); expect(agent.name).toBe('Country Regulatory Resolver'); });
    it('reports healthy', async () => { expect((await agent.health()).status).toBe('healthy'); });
    it('throws when not initialized', async () => {
      const u = new CountryRegulatoryResolver();
      await expect(u.execute({ data: { operation: 'getAPISRequirements', countryCode: 'US' } })).rejects.toThrow('not been initialized');
    });
  });
});
