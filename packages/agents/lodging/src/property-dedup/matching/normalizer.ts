/**
 * Property Deduplication — Text normalization.
 *
 * Normalizes property names and addresses for comparison:
 * - Strip accents (NFD + remove combining marks)
 * - Lowercase
 * - Remove noise words ("Hotel", "The", "Resort", "& Spa")
 * - Expand common address abbreviations (St→Street, Ave→Avenue)
 * - Collapse whitespace
 *
 * Domain source: OTAIP Lodging Knowledge Base §10 (Standard Deduplication Workflow)
 */

const NOISE_WORDS = [
  'hotel', 'hotels', 'the', 'resort', 'resorts',
  '& spa', 'and spa', '& suites', 'and suites',
  '& resort', 'and resort', 'by', 'a', 'an',
];

const ADDRESS_EXPANSIONS: Record<string, string> = {
  'st': 'street',
  'st.': 'street',
  'ave': 'avenue',
  'ave.': 'avenue',
  'blvd': 'boulevard',
  'blvd.': 'boulevard',
  'dr': 'drive',
  'dr.': 'drive',
  'rd': 'road',
  'rd.': 'road',
  'ln': 'lane',
  'ln.': 'lane',
  'ct': 'court',
  'ct.': 'court',
  'pl': 'place',
  'pl.': 'place',
  'pkwy': 'parkway',
  'hwy': 'highway',
  'n': 'north',
  'n.': 'north',
  's': 'south',
  's.': 'south',
  'e': 'east',
  'e.': 'east',
  'w': 'west',
  'w.': 'west',
};

/** Strip Unicode accents by decomposing and removing combining marks. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Collapse multiple spaces/tabs/newlines into single space and trim. */
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize a property name for comparison.
 * Strips accents, removes noise words, collapses whitespace.
 */
export function normalizeName(name: string): string {
  let normalized = stripAccents(name).toLowerCase();

  // Remove noise words (longest first to handle "& resort" before "&")
  const sorted = [...NOISE_WORDS].sort((a, b) => b.length - a.length);
  for (const word of sorted) {
    // Use word boundary-ish replacement (space or start/end)
    const pattern = new RegExp(`(^|\\s)${escapeRegex(word)}($|\\s)`, 'gi');
    normalized = normalized.replace(pattern, ' ');
  }

  return collapseWhitespace(normalized);
}

/**
 * Normalize an address for comparison.
 * Expands abbreviations, strips accents, collapses whitespace.
 */
export function normalizeAddress(address: string): string {
  let normalized = stripAccents(address).toLowerCase();

  // Expand address abbreviations
  const words = normalized.split(/\s+/);
  const expanded = words.map((w) => {
    const lower = w.toLowerCase();
    return ADDRESS_EXPANSIONS[lower] ?? w;
  });
  normalized = expanded.join(' ');

  // Remove punctuation except hyphens
  normalized = normalized.replace(/[^\w\s-]/g, '');

  return collapseWhitespace(normalized);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
