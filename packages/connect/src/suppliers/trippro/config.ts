/**
 * TripPro/Mondee configuration schema and validation.
 */

import { z } from 'zod';
import { validateConfig } from '../../config.js';

// HTTPS by default. To use plain HTTP for local dev/testing, override the
// URL via TripProConfig.searchUrl / calendarSearchUrl explicitly.
export const TRIPPRO_DEFAULT_SEARCH_URL = 'https://mas.trippro.com/resources/v2/Flights/search';
export const TRIPPRO_DEFAULT_CALENDAR_SEARCH_URL =
  'https://mas.trippro.com/resources/v3/calendarsearch';
export const TRIPPRO_DEFAULT_REPRICE_URL =
  'https://map.trippro.com/resources/api/v3/repriceitinerary';
export const TRIPPRO_DEFAULT_BOOK_URL =
  'https://map.trippro.com/resources/v2/Flights/bookItinerary';

export interface TripProConfig {
  searchUrl: string;
  calendarSearchUrl: string;
  repriceUrl: string;
  bookUrl: string;
  soapBaseUrl: string;
  accessToken: string;
  searchAccessToken: string;
  whitelistedIp: string;
  defaultCurrency: string;
}

export const tripProConfigSchema = z.object({
  searchUrl: z.url().default(TRIPPRO_DEFAULT_SEARCH_URL),
  calendarSearchUrl: z.url().default(TRIPPRO_DEFAULT_CALENDAR_SEARCH_URL),
  repriceUrl: z.url().default(TRIPPRO_DEFAULT_REPRICE_URL),
  bookUrl: z.url().default(TRIPPRO_DEFAULT_BOOK_URL),
  soapBaseUrl: z.url(),
  accessToken: z.string().min(1),
  searchAccessToken: z.string().min(1),
  whitelistedIp: z.string().min(1),
  defaultCurrency: z.string().length(3).default('USD'),
});

export function validateTripProConfig(config: unknown): TripProConfig {
  return validateConfig(tripProConfigSchema, config, 'TripPro');
}
