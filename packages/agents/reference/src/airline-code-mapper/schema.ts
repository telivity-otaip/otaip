/**
 * Zod schemas for AirlineCodeMapper (Agent 0.2).
 */

import { z } from 'zod';

export const airlineCodeMapperInputSchema = z.object({
  code: z.string().min(1).max(50),
  code_type: z.enum(['iata', 'icao', 'name', 'auto']).optional(),
  include_codeshares: z.boolean().optional(),
  include_defunct: z.boolean().optional(),
});

const allianceNameSchema = z.enum(['star_alliance', 'oneworld', 'skyteam']);
const allianceStatusSchema = z.enum(['full_member', 'affiliate', 'connect_partner']);
const airlineStatusSchema = z.enum(['active', 'defunct', 'suspended', 'merged']);
const codeshareRelationshipSchema = z.enum(['codeshare', 'joint_venture', 'franchise', 'wet_lease']);

const resolvedAirlineSchema = z.object({
  iata_code: z.string().nullable(),
  icao_code: z.string().nullable(),
  name: z.string(),
  callsign: z.string().nullable(),
  country_code: z.string(),
  country_name: z.string(),
  alliance: allianceNameSchema.nullable(),
  alliance_status: allianceStatusSchema.nullable(),
  is_operating: z.boolean(),
  hub_airports: z.array(z.string()),
  website: z.string().nullable(),
  founded_year: z.number().nullable(),
  status: airlineStatusSchema,
  merged_into: z.string().nullable(),
  defunct_date: z.string().nullable(),
});

const codesharePartnerSchema = z.object({
  iata_code: z.string(),
  name: z.string(),
  alliance: allianceNameSchema.nullable(),
  relationship: codeshareRelationshipSchema,
});

export const airlineCodeMapperOutputSchema = z.object({
  airline: resolvedAirlineSchema.nullable(),
  codeshare_partners: z.array(codesharePartnerSchema).nullable(),
  match_confidence: z.number().min(0).max(1),
});
