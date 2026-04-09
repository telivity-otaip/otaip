/**
 * Knowledge Retrieval — Types
 *
 * Agent 9.2: RAG over travel knowledge base.
 */

export type KnowledgeTopic =
  | 'distribution'
  | 'ticketing'
  | 'settlement'
  | 'operations'
  | 'tmc'
  | 'fares'
  | 'regulations'
  | 'reference';

export type KnowledgeOperation = 'query' | 'index_document' | 'list_topics' | 'get_document';

export interface KnowledgeDocument {
  document_id: string;
  title: string;
  topic: KnowledgeTopic;
  content: string;
  tags: string[];
  indexed_at: string;
}

export interface KnowledgeResult {
  document_id: string;
  title: string;
  topic: KnowledgeTopic;
  relevance_score: number;
  excerpt: string;
  content: string;
}

export interface KnowledgeInput {
  operation: KnowledgeOperation;
  /** For query */
  query?: string;
  topic?: KnowledgeTopic;
  max_results?: number;
  /** For index_document */
  document_id?: string;
  title?: string;
  content?: string;
  tags?: string[];
}

export interface KnowledgeOutput {
  results?: KnowledgeResult[];
  document?: KnowledgeDocument;
  topics?: KnowledgeTopic[];
  query_time_ms?: number;
  message?: string;
}
