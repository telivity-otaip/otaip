/**
 * Knowledge Retrieval — Agent 9.2
 *
 * RAG over travel knowledge base with keyword-overlap relevance scoring.
 */

import type {
  Agent, AgentInput, AgentOutput, AgentHealthStatus,
} from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  KnowledgeInput, KnowledgeOutput,
  KnowledgeDocument, KnowledgeResult, KnowledgeTopic,
} from './types.js';

const ALL_TOPICS: KnowledgeTopic[] = [
  'distribution', 'ticketing', 'settlement', 'operations',
  'tmc', 'fares', 'regulations', 'reference',
];
const VALID_TOPICS = new Set<string>(ALL_TOPICS);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((t) => t.length > 2);
}

function relevanceScore(queryTokens: string[], docContent: string): number {
  if (queryTokens.length === 0) return 0;
  const docTokens = new Set(tokenize(docContent));
  let matches = 0;
  for (const qt of queryTokens) {
    if (docTokens.has(qt)) matches++;
  }
  return Math.min(matches / queryTokens.length, 1.0);
}

function excerpt(content: string, maxLen = 200): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + '...';
}

// Fixture documents
const SEED_DOCUMENTS: Omit<KnowledgeDocument, 'indexed_at'>[] = [
  { document_id: 'DOC001', title: 'GDS Distribution Overview', topic: 'distribution', content: 'The Global Distribution System connects airlines with travel agencies. Major GDS providers include Amadeus, Sabre, and Travelport. GDS enables real-time availability search, booking, and ticketing across multiple carriers.', tags: ['gds', 'amadeus', 'sabre'] },
  { document_id: 'DOC002', title: 'NDC Standard Introduction', topic: 'distribution', content: 'New Distribution Capability is an IATA standard for airline retailing. NDC enables airlines to distribute rich content and offers directly. Versions include 17.2, 18.1, and 21.3 with increasing capability.', tags: ['ndc', 'iata', 'retailing'] },
  { document_id: 'DOC003', title: 'Electronic Ticketing Process', topic: 'ticketing', content: 'Electronic tickets replaced paper tickets in 2008. An ETR contains 13-digit ticket number, coupon details, fare calculation, and tax breakdown. Conjunction tickets handle itineraries with more than 4 coupons.', tags: ['etr', 'coupon', 'conjunction'] },
  { document_id: 'DOC004', title: 'EMD Types and Usage', topic: 'ticketing', content: 'Electronic Miscellaneous Documents come in two types. EMD-A is associated with a flight coupon for ancillaries like baggage. EMD-S is standalone for services not linked to a specific flight segment.', tags: ['emd', 'ancillary', 'baggage'] },
  { document_id: 'DOC005', title: 'BSP Settlement Process', topic: 'settlement', content: 'The Billing and Settlement Plan manages financial settlement between airlines and travel agencies. BSP operates on periodic billing cycles with HOT files transmitted for reconciliation before remittance deadlines.', tags: ['bsp', 'billing', 'hot'] },
  { document_id: 'DOC006', title: 'ARC Weekly Settlement', topic: 'settlement', content: 'Airlines Reporting Corporation handles settlement in the US market. ARC uses weekly settlement cycles with Interactive Agent Reports. The standard ADM dispute window is 15 days from issue date.', tags: ['arc', 'iar', 'adm'] },
  { document_id: 'DOC007', title: 'PNR Structure and Elements', topic: 'operations', content: 'A Passenger Name Record contains five mandatory elements: passenger name, itinerary segments, contact information, ticketing arrangement, and received-from. PNR validation ensures all elements are present before ticketing.', tags: ['pnr', 'booking', 'segments'] },
  { document_id: 'DOC008', title: 'Queue Management in GDS', topic: 'operations', content: 'GDS queues organize PNRs requiring attention. Ticketing queues hold PNRs approaching TTL deadlines. Schedule change queues flag carrier-initiated time changes. Priority is based on urgency and deadline proximity.', tags: ['queue', 'ttl', 'schedule'] },
  { document_id: 'DOC009', title: 'TMC Operations Overview', topic: 'tmc', content: 'Travel Management Companies handle corporate travel programs. Key functions include traveler profile management, policy enforcement, mid-office automation, and duty of care for traveling employees.', tags: ['tmc', 'corporate', 'policy'] },
  { document_id: 'DOC010', title: 'ATPCO Fare Filing', topic: 'fares', content: 'Airline Tariff Publishing Company manages fare data. Fares are filed with fare basis codes indicating class, restrictions, and validity. Category rules define conditions like advance purchase, minimum stay, and penalties.', tags: ['atpco', 'fare', 'category'] },
  { document_id: 'DOC011', title: 'Fare Construction Rules', topic: 'fares', content: 'Fare construction uses NUC amounts converted via ROE rates. Mileage system validates routing against TPM and MPM values. Higher intermediate point and backhaul checks ensure fare integrity.', tags: ['nuc', 'roe', 'mileage'] },
  { document_id: 'DOC012', title: 'EU261 Passenger Rights', topic: 'regulations', content: 'EU Regulation 261/2004 establishes passenger rights for flight delays, cancellations, and denied boarding. It applies to flights departing from EU airports or EU carrier flights to the EU. Compensation ranges from 250 to 600 euros.', tags: ['eu261', 'delay', 'compensation'] },
  { document_id: 'DOC013', title: 'GDPR in Travel', topic: 'regulations', content: 'General Data Protection Regulation requires travel companies to protect personal data. Passenger information including passport numbers and contact details must be handled with appropriate security. Right to erasure applies.', tags: ['gdpr', 'privacy', 'pii'] },
  { document_id: 'DOC014', title: 'IATA Airport Codes', topic: 'reference', content: 'IATA assigns three-letter codes to airports worldwide. Multi-airport cities like London have metro area codes. LON covers LHR, LGW, LCY, STN, LTN, and SEN airports.', tags: ['iata', 'airport', 'code'] },
  { document_id: 'DOC015', title: 'Airline Alliance Networks', topic: 'reference', content: 'Three major airline alliances exist: Star Alliance, oneworld, and SkyTeam. Alliances enable codeshare agreements, shared lounges, and reciprocal frequent flyer benefits across member carriers.', tags: ['alliance', 'codeshare', 'loyalty'] },
];

export class KnowledgeAgent
  implements Agent<KnowledgeInput, KnowledgeOutput>
{
  readonly id = '9.2';
  readonly name = 'Knowledge Retrieval';
  readonly version = '0.1.0';

  private initialized = false;
  private documents = new Map<string, KnowledgeDocument>();

  async initialize(): Promise<void> {
    this.initialized = true;
    // Seed fixture documents
    const now = new Date().toISOString();
    for (const doc of SEED_DOCUMENTS) {
      this.documents.set(doc.document_id, { ...doc, indexed_at: now });
    }
  }

  async execute(
    input: AgentInput<KnowledgeInput>,
  ): Promise<AgentOutput<KnowledgeOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;

    switch (d.operation) {
      case 'query': return this.handleQuery(d);
      case 'index_document': return this.handleIndex(d);
      case 'list_topics': return this.handleListTopics();
      case 'get_document': return this.handleGetDocument(d);
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Must be query, index_document, list_topics, or get_document.');
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
    if (!d.query) throw new AgentInputValidationError(this.id, 'query', 'Required for query operation.');

    const startTime = Date.now();
    const queryTokens = tokenize(d.query);
    const maxResults = d.max_results ?? 5;

    let candidates = [...this.documents.values()];
    if (d.topic) {
      if (!VALID_TOPICS.has(d.topic)) throw new AgentInputValidationError(this.id, 'topic', `Invalid topic: ${d.topic}`);
      candidates = candidates.filter((doc) => doc.topic === d.topic);
    }

    const scored: KnowledgeResult[] = candidates
      .map((doc) => ({
        document_id: doc.document_id,
        title: doc.title,
        topic: doc.topic,
        relevance_score: relevanceScore(queryTokens, doc.content + ' ' + doc.tags.join(' ')),
        excerpt: excerpt(doc.content),
        content: doc.content,
      }))
      .filter((r) => r.relevance_score > 0)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, maxResults);

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
    if (!d.topic || !VALID_TOPICS.has(d.topic)) throw new AgentInputValidationError(this.id, 'topic', 'Must be a valid topic.');
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
    return { data: { document: doc, message: 'Document indexed.' }, confidence: 1.0, metadata: { agent_id: this.id } };
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
  KnowledgeInput, KnowledgeOutput,
  KnowledgeDocument, KnowledgeResult, KnowledgeTopic, KnowledgeOperation,
} from './types.js';
