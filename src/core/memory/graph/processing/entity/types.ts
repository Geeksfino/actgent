import { z } from 'zod';
import { IGraphNode, IGraphEdge } from '../../data/types';
import { GraphTask, LLMConfig } from '../../types';

/**
 * Configuration for LLM requests
 */
// Removed LLMConfig interface

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

// Entity Resolution Types
/**
 * Result of entity resolution for a single node
 */
export interface EntityResolution {
    isDuplicate: boolean;
    existingId?: string;
    updatedName?: string;
    confidence: number;
    explanation: string;
}

/**
 * Input for entity resolution
 */
export interface EntityResolutionInput {
    newNode: IGraphNode;
    existingNodes: IGraphNode[];
    context?: {
        previousEpisodes?: any[];
        episodeContent?: string;
    };
}

/**
 * Result of batch entity resolution
 */
export interface BatchEntityResolution {
    nodes: EntityResolution[];
    mergeGroups: {
        primaryId: string;
        duplicateIds: string[];
        updatedName: string;
        confidence: number;
    }[];
}

/**
 * Input for batch entity resolution
 */
export interface BatchEntityResolutionInput {
    nodes: IGraphNode[];
    context?: {
        previousEpisodes?: any[];
        episodeContent?: string;
    };
}

/**
 * Edge resolution result
 */
export interface EdgeResolution {
    isDuplicate: boolean;
    existingId?: string;
    confidence: number;
    explanation: string;
}

/**
 * Input for edge resolution
 */
export interface EdgeResolutionInput {
    newEdge: IGraphEdge;
    existingEdges: IGraphEdge[];
    context?: {
        previousEpisodes?: any[];
        episodeContent?: string;
    };
}

/**
 * Batch edge resolution result
 */
export interface BatchEdgeResolution {
    edges: EdgeResolution[];
    mergeGroups: {
        primaryId: string;
        duplicateIds: string[];
        confidence: number;
    }[];
}

/**
 * Input for batch edge resolution
 */
export interface BatchEdgeResolutionInput {
    edges: IGraphEdge[];
    context?: {
        previousEpisodes?: any[];
        episodeContent?: string;
    };
}

// Zod schemas for LLM function calls
export const EntityResolutionSchema = z.object({
    isDuplicate: z.boolean(),
    existingId: z.string().optional(),
    updatedName: z.string().optional(),
    confidence: z.number().min(0).max(1),
    explanation: z.string()
});

export const BatchEntityResolutionSchema = z.object({
    nodes: z.array(EntityResolutionSchema),
    mergeGroups: z.array(z.object({
        primaryId: z.string(),
        duplicateIds: z.array(z.string()),
        updatedName: z.string(),
        confidence: z.number().min(0).max(1)
    }))
});

export const EdgeResolutionSchema = z.object({
    isDuplicate: z.boolean(),
    existingId: z.string().optional(),
    confidence: z.number().min(0).max(1),
    explanation: z.string()
});

export const BatchEdgeResolutionSchema = z.object({
    edges: z.array(EdgeResolutionSchema),
    mergeGroups: z.array(z.object({
        primaryId: z.string(),
        duplicateIds: z.array(z.string()),
        confidence: z.number().min(0).max(1)
    }))
});

export { GraphTask } from '../../types';
