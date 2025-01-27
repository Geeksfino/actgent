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

export { GraphTask } from '../../types';
