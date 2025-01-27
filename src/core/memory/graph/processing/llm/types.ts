import { z } from 'zod';
import { IGraphNode, IGraphEdge } from '../../data/types';

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
    nodeId: z.string(),
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
export interface SearchResult {
    nodeId: string;
    score: number;
    explanation: string;
}

export interface TemporalResult {
    source: string;
    target: string;
    relationship: string;
    confidence: number;
}

export interface PathResult {
    path: string[];
    score: number;
    explanation: string;
}

export interface CommunityResult {
    nodes: string[];
    label: string;
    confidence: number;
}
