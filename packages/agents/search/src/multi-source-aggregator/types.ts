export type DeduplicationStrategy = 'keep_cheapest' | 'keep_all' | 'keep_first';
export type RankBy = 'price' | 'duration' | 'stops';

export interface SearchResult {
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  stops: number;
  price: { amount: string; currency: string };
  cabin: string;
}
export interface AdapterSearchResult {
  adapterName: string;
  results: SearchResult[];
  error?: string;
  responseTimeMs: number;
}
export interface NormalizedFlight extends SearchResult {
  sources: string[];
  lowestPrice: { amount: string; currency: string };
  allPrices: Array<{ adapter: string; amount: string; currency: string }>;
}
export interface AdapterSummary {
  adapter: string;
  count: number;
  error?: string;
  responseTimeMs: number;
}

export interface MultiSourceInput {
  results: AdapterSearchResult[];
  deduplicationStrategy: DeduplicationStrategy;
  rankBy: RankBy;
  maxResults?: number;
}
export interface MultiSourceOutput {
  flights: NormalizedFlight[];
  totalRaw: number;
  totalAfterDedup: number;
  adapterSummary: AdapterSummary[];
  rankBy: RankBy;
}
