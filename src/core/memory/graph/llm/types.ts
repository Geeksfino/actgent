import { z } from 'zod';
import { IGraphNode, IGraphEdge, ITemporalMetadata } from '../types';

/**
 * Available LLM tasks for graph operations
 */
export enum GraphTask {
  FIND_COMMUNITIES = 'find_communities',
  GENERATE_EMBEDDING = 'generate_embedding',
  RERANK_RESULTS = 'rerank_results',
  EXTRACT_TEMPORAL = 'extract_temporal',
  FIND_PATH = 'find_path',
  PARSE_DATE = 'parse_date',
  DETECT_COMMUNITIES = 'detect_communities'
}

/**
 * Configuration for LLM requests
 */
export interface LLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

/**
 * Schema for embedding vectors
 */
export const EmbeddingSchema = z.array(z.number())
  .length(384)
  .refine(arr => arr.every(n => n >= -1 && n <= 1));

/**
 * Schema for search results
 */
export const SearchResultSchema = z.array(z.object({
  id: z.string(),
  score: z.number(),
  content: z.string(),
  metadata: z.record(z.string(), z.any())
}));

/**
 * Schema for temporal extraction
 */
export const TemporalSchema = z.object({
  eventTime: z.string().datetime(),
  ingestionTime: z.string().datetime(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1)
});

/**
 * Schema for path finding results
 */
export const PathSchema = z.object({
  nodes: z.array(z.string()),
  edges: z.array(z.string()),
  cost: z.number(),
  explanation: z.string()
});

/**
 * Schema for community detection
 */
export const CommunitySchema = z.object({
  communities: z.array(z.object({
    id: z.string(),
    nodes: z.array(z.string()),
    summary: z.string(),
    confidence: z.number().min(0).max(1)
  }))
});

export type Embedding = z.infer<typeof EmbeddingSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type TemporalResult = z.infer<typeof TemporalSchema>;
export type PathResult = z.infer<typeof PathSchema>;
export type CommunityResult = z.infer<typeof CommunitySchema>;
