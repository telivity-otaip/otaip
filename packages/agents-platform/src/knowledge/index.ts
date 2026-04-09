/**
 * Knowledge Retrieval — Agent 9.2
 *
 * RAG over travel knowledge base with keyword-overlap relevance scoring.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  KnowledgeInput,
  KnowledgeOutput,
  KnowledgeDocument,
  KnowledgeResult,
  KnowledgeTopic,
} from './types.js';

const ALL_TOPICS: KnowledgeTopic[] = [
  'distribution',
  'ticketing',
  'settlement',
  'operations',
  'tmc',
  'fares',
  'regulations',
  'reference',
];
const VALID_TOPICS = new Set<string>(ALL_TOPICS);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/**
 * BM25 scoring parameters.
 * k1 controls term frequency saturation (1.2 is standard).
 * b controls document length normalization (0.75 is standard).
 */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** Pre-computed corpus statistics for BM25 scoring. */
interface CorpusStats {
  /** Number of documents in the corpus. */
  docCount: number;
  /** Average document length in tokens. */
  avgDocLen: number;
  /** Number of documents containing each term. */
  docFreq: Map<string, number>;
  /** Token arrays per document, keyed by document_id. */
  docTokens: Map<string, string[]>;
}

function buildCorpusStats(documents: Map<string, KnowledgeDocument>): CorpusStats {
  const docFreq = new Map<string, number>();
  const docTokens = new Map<string, string[]>();
  let totalLen = 0;

  for (const [id, doc] of documents) {
    const tokens = tokenize(doc.content + ' ' + doc.tags.join(' '));
    docTokens.set(id, tokens);
    totalLen += tokens.length;

    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  return {
    docCount: documents.size,
    avgDocLen: documents.size > 0 ? totalLen / documents.size : 0,
    docFreq,
    docTokens,
  };
}

function computeBM25(queryTokens: string[], docId: string, stats: CorpusStats): number {
  const docToks = stats.docTokens.get(docId);
  if (!docToks || docToks.length === 0) return 0;

  const docLen = docToks.length;

  // Build term frequency map for this document
  const tf = new Map<string, number>();
  for (const t of docToks) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }

  let score = 0;
  for (const qt of queryTokens) {
    const termFreq = tf.get(qt) ?? 0;
    if (termFreq === 0) continue;

    const df = stats.docFreq.get(qt) ?? 0;
    // IDF component: log((N - df + 0.5) / (df + 0.5) + 1)
    const idf = Math.log((stats.docCount - df + 0.5) / (df + 0.5) + 1);
    // TF component with length normalization
    const tfNorm =
      (termFreq * (BM25_K1 + 1)) /
      (termFreq + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / stats.avgDocLen)));
    score += idf * tfNorm;
  }

  return score;
}


function excerpt(content: string, maxLen = 200): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + '...';
}

// Fixture documents
const SEED_DOCUMENTS: Omit<KnowledgeDocument, 'indexed_at'>[] = [
  {
    document_id: 'DOC001',
    title: 'GDS Distribution Overview',
    topic: 'distribution',
    content:
      'The Global Distribution System connects airlines with travel agencies. Major GDS providers include Amadeus, Sabre, and Travelport. GDS enables real-time availability search, booking, and ticketing across multiple carriers.',
    tags: ['gds', 'amadeus', 'sabre'],
  },
  {
    document_id: 'DOC002',
    title: 'NDC Standard Introduction',
    topic: 'distribution',
    content:
      'New Distribution Capability is an IATA standard for airline retailing. NDC enables airlines to distribute rich content and offers directly. Versions include 17.2, 18.1, and 21.3 with increasing capability.',
    tags: ['ndc', 'iata', 'retailing'],
  },
  {
    document_id: 'DOC003',
    title: 'Electronic Ticketing Process',
    topic: 'ticketing',
    content:
      'Electronic tickets replaced paper tickets in 2008. An ETR contains 13-digit ticket number, coupon details, fare calculation, and tax breakdown. Conjunction tickets handle itineraries with more than 4 coupons.',
    tags: ['etr', 'coupon', 'conjunction'],
  },
  {
    document_id: 'DOC004',
    title: 'EMD Types and Usage',
    topic: 'ticketing',
    content:
      'Electronic Miscellaneous Documents come in two types. EMD-A is associated with a flight coupon for ancillaries like baggage. EMD-S is standalone for services not linked to a specific flight segment.',
    tags: ['emd', 'ancillary', 'baggage'],
  },
  {
    document_id: 'DOC005',
    title: 'BSP Settlement Process',
    topic: 'settlement',
    content:
      'The Billing and Settlement Plan manages financial settlement between airlines and travel agencies. BSP operates on periodic billing cycles with HOT files transmitted for reconciliation before remittance deadlines.',
    tags: ['bsp', 'billing', 'hot'],
  },
  {
    document_id: 'DOC006',
    title: 'ARC Weekly Settlement',
    topic: 'settlement',
    content:
      'Airlines Reporting Corporation handles settlement in the US market. ARC uses weekly settlement cycles with Interactive Agent Reports. The standard ADM dispute window is 15 days from issue date.',
    tags: ['arc', 'iar', 'adm'],
  },
  {
    document_id: 'DOC007',
    title: 'PNR Structure and Elements',
    topic: 'operations',
    content:
      'A Passenger Name Record contains five mandatory elements: passenger name, itinerary segments, contact information, ticketing arrangement, and received-from. PNR validation ensures all elements are present before ticketing.',
    tags: ['pnr', 'booking', 'segments'],
  },
  {
    document_id: 'DOC008',
    title: 'Queue Management in GDS',
    topic: 'operations',
    content:
      'GDS queues organize PNRs requiring attention. Ticketing queues hold PNRs approaching TTL deadlines. Schedule change queues flag carrier-initiated time changes. Priority is based on urgency and deadline proximity.',
    tags: ['queue', 'ttl', 'schedule'],
  },
  {
    document_id: 'DOC009',
    title: 'TMC Operations Overview',
    topic: 'tmc',
    content:
      'Travel Management Companies handle corporate travel programs. Key functions include traveler profile management, policy enforcement, mid-office automation, and duty of care for traveling employees.',
    tags: ['tmc', 'corporate', 'policy'],
  },
  {
    document_id: 'DOC010',
    title: 'ATPCO Fare Filing',
    topic: 'fares',
    content:
      'Airline Tariff Publishing Company manages fare data. Fares are filed with fare basis codes indicating class, restrictions, and validity. Category rules define conditions like advance purchase, minimum stay, and penalties.',
    tags: ['atpco', 'fare', 'category'],
  },
  {
    document_id: 'DOC011',
    title: 'Fare Construction Rules',
    topic: 'fares',
    content:
      'Fare construction uses NUC amounts converted via ROE rates. Mileage system validates routing against TPM and MPM values. Higher intermediate point and backhaul checks ensure fare integrity.',
    tags: ['nuc', 'roe', 'mileage'],
  },
  {
    document_id: 'DOC012',
    title: 'EU261 Passenger Rights',
    topic: 'regulations',
    content:
      'EU Regulation 261/2004 establishes passenger rights for flight delays, cancellations, and denied boarding. It applies to flights departing from EU airports or EU carrier flights to the EU. Compensation ranges from 250 to 600 euros.',
    tags: ['eu261', 'delay', 'compensation'],
  },
  {
    document_id: 'DOC013',
    title: 'GDPR in Travel',
    topic: 'regulations',
    content:
      'General Data Protection Regulation requires travel companies to protect personal data. Passenger information including passport numbers and contact details must be handled with appropriate security. Right to erasure applies.',
    tags: ['gdpr', 'privacy', 'pii'],
  },
  {
    document_id: 'DOC014',
    title: 'IATA Airport Codes',
    topic: 'reference',
    content:
      'IATA assigns three-letter codes to airports worldwide. Multi-airport cities like London have metro area codes. LON covers LHR, LGW, LCY, STN, LTN, and SEN airports.',
    tags: ['iata', 'airport', 'code'],
  },
  {
    document_id: 'DOC015',
    title: 'Airline Alliance Networks',
    topic: 'reference',
    content:
      'Three major airline alliances exist: Star Alliance, oneworld, and SkyTeam. Alliances enable codeshare agreements, shared lounges, and reciprocal frequent flyer benefits across member carriers.',
    tags: ['alliance', 'codeshare', 'loyalty'],
  },
];

export class KnowledgeAgent implements Agent<KnowledgeInput, KnowledgeOutput> {
  readonly id = '9.2';
  readonly name = 'Knowledge Retrieval';
  readonly version = '0.1.0';

  private initialized = false;
  private documents = new Map<string, KnowledgeDocument>();
  private corpusStats: CorpusStats | null = null;

  async initialize(): Promise<void> {
    this.initialized = true;
    // Seed fixture documents
    const now = new Date().toISOString();
    for (const doc of SEED_DOCUMENTS) {
      this.documents.set(doc.document_id, { ...doc, indexed_at: now });
    }
    this.rebuildIndex();
  }

  private rebuildIndex(): void {
    this.corpusStats = buildCorpusStats(this.documents);
  }

  async execute(input: AgentInput<KnowledgeInput>): Promise<AgentOutput<KnowledgeOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;

    switch (d.operation) {
      case 'query':
        return this.handleQuery(d);
      case 'index_document':
        return this.handleIndex(d);
      case 'list_topics':
        return this.handleListTopics();
      case 'get_document':
        return this.handleGetDocument(d);
      default:
        throw new AgentInputValidationError(
          this.id,
          'operation',
          'Must be query, index_document, list_topics, or get_document.',
        );
    }
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
    this.documents.clear();
  }

  private handleQuery(d: KnowledgeInput): AgentOutput<KnowledgeOutput> {
    if (!d.query)
      throw new AgentInputValidationError(this.id, 'query', 'Required for query operation.');

    const startTime = Date.now();
    const queryTokens = tokenize(d.query);
    const maxResults = d.max_results ?? 5;

    let candidates = [...this.documents.values()];
    if (d.topic) {
      if (!VALID_TOPICS.has(d.topic))
        throw new AgentInputValidationError(this.id, 'topic', `Invalid topic: ${d.topic}`);
      candidates = candidates.filter((doc) => doc.topic === d.topic);
    }

    const stats = this.corpusStats!;
    const rawScored = candidates
      .map((doc) => ({
        document_id: doc.document_id,
        title: doc.title,
        topic: doc.topic,
        raw: computeBM25(queryTokens, doc.document_id, stats),
        excerpt: excerpt(doc.content),
        content: doc.content,
      }))
      .filter((r) => r.raw > 0)
      .sort((a, b) => b.raw - a.raw)
      .slice(0, maxResults);

    // Normalize raw BM25 scores to 0-1 range
    const maxRaw = rawScored.length > 0 ? rawScored[0]!.raw : 1;
    const scored: KnowledgeResult[] = rawScored.map((r) => ({
      document_id: r.document_id,
      title: r.title,
      topic: r.topic,
      relevance_score: maxRaw > 0 ? r.raw / maxRaw : 0,
      excerpt: r.excerpt,
      content: r.content,
    }));

    const queryTime = Date.now() - startTime;

    return {
      data: { results: scored, query_time_ms: queryTime },
      confidence: scored.length > 0 ? scored[0]!.relevance_score : 0,
      metadata: { agent_id: this.id, results_count: scored.length, query_time_ms: queryTime },
    };
  }

  private handleIndex(d: KnowledgeInput): AgentOutput<KnowledgeOutput> {
    if (!d.document_id) throw new AgentInputValidationError(this.id, 'document_id', 'Required.');
    if (!d.title) throw new AgentInputValidationError(this.id, 'title', 'Required.');
    if (!d.topic || !VALID_TOPICS.has(d.topic))
      throw new AgentInputValidationError(this.id, 'topic', 'Must be a valid topic.');
    if (!d.content) throw new AgentInputValidationError(this.id, 'content', 'Required.');

    const doc: KnowledgeDocument = {
      document_id: d.document_id,
      title: d.title,
      topic: d.topic,
      content: d.content,
      tags: d.tags ?? [],
      indexed_at: new Date().toISOString(),
    };
    this.documents.set(doc.document_id, doc);
    this.rebuildIndex();
    return {
      data: { document: doc, message: 'Document indexed.' },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }

  private handleListTopics(): AgentOutput<KnowledgeOutput> {
    return { data: { topics: ALL_TOPICS }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private handleGetDocument(d: KnowledgeInput): AgentOutput<KnowledgeOutput> {
    if (!d.document_id) throw new AgentInputValidationError(this.id, 'document_id', 'Required.');
    const doc = this.documents.get(d.document_id);
    if (!doc) throw new AgentInputValidationError(this.id, 'document_id', 'Document not found.');
    return { data: { document: doc }, confidence: 1.0, metadata: { agent_id: this.id } };
  }
}

export type {
  KnowledgeInput,
  KnowledgeOutput,
  KnowledgeDocument,
  KnowledgeResult,
  KnowledgeTopic,
  KnowledgeOperation,
} from './types.js';
