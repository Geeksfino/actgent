import { z } from 'zod';
import { IGraphNode, IGraphEdge } from '../../data/types';

/**
 * Available graph operation functions
 */
export enum GraphFunction {
    UPDATE_SEARCH_RANKS = 'update_search_ranks',
    REFINE_COMMUNITIES = 'refine_communities',
    EVALUATE_PATHS = 'evaluate_paths',
    ADD_TEMPORAL_EDGES = 'add_temporal_edges',
    PREPARE_FOR_EMBEDDING = 'prepare_for_embedding'
}

/**
 * Available LLM tasks for graph operations
 */
export enum GraphTask {
    RERANK_RESULTS = 'rerank_results',
    REFINE_COMMUNITIES = 'refine_communities',
    EVALUATE_PATHS = 'evaluate_paths',
    EXTRACT_TEMPORAL = 'extract_temporal',
    PREPARE_FOR_EMBEDDING = 'prepare_for_embedding'
}

/**
 * Configuration for LLM requests
 */
export interface LLMConfig {
    model: string;
    temperature: number;
    maxTokens: number;
}

// Zod Schemas for LLM responses
export const EmbeddingSchema = z.array(z.number());
export const PathSchema = z.array(z.object({
    path: z.array(z.string()),
    score: z.number(),
    explanation: z.string()
}));
export const CommunitySchema = z.array(z.object({
    nodes: z.array(z.string()),
    label: z.string(),
    confidence: z.number()
}));
export const SearchResultSchema = z.array(z.object({
    id: z.string(),
    score: z.number(),
    explanation: z.string()
}));
export const TemporalSchema = z.array(z.object({
    source: z.string(),
    target: z.string(),
    relationship: z.string(),
    confidence: z.number()
}));

// Result Types
export interface SearchResultType {
    id: string;
    score: number;
    explanation: string;
}

export interface TemporalResultType {
    source: string;
    target: string;
    relationship: string;
    confidence: number;
}

export interface PathResultType {
    path: string[];
    score: number;
    explanation: string;
}

export interface CommunityResultType {
    nodes: string[];
    label: string;
    confidence: number;
}

// Type aliases from schema inference
export type SearchResult = z.infer<typeof SearchResultSchema>[number];
export type PathResult = z.infer<typeof PathSchema>[number];
export type CommunityResult = z.infer<typeof CommunitySchema>[number];
export type TemporalResult = z.infer<typeof TemporalSchema>[number];
