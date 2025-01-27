import { z } from 'zod';
import { IGraphNode, IGraphEdge } from '../../data/types';
import { GraphTask } from '../../types';

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

/**
 * Schema for episode consolidation results
 */
export const EpisodeConsolidationSchema = z.object({
    content: z.string().describe('The consolidated content that summarizes the pattern or theme'),
    sourceEpisodeIds: z.array(z.string()).describe('IDs of the source episodes that were consolidated'),
    confidence: z.number().min(0).max(1).describe('Confidence score for the consolidation'),
    metadata: z.record(z.any()).optional().describe('Additional metadata about the consolidation')
});

export type EpisodeConsolidation = z.infer<typeof EpisodeConsolidationSchema>;

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
