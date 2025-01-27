import { IGraphNode } from '../data/types';
import { SearchResult } from '../processing/entity/types';

/**
 * Configuration for reranking
 */
export interface RerankerConfig {
    maxResults?: number;
    minScore?: number;
    model?: string;
}

/**
 * Result from reranking
 */
export interface RerankResult {
    id: string;
    score: number;
    explanation: string;
}

/**
 * Interface for reranking implementations
 */
export interface IReranker {
    /**
     * Rerank nodes based on query
     */
    rerank(query: string, nodes: IGraphNode[]): Promise<RerankResult[]>;

    /**
     * Get explanation for a specific result
     */
    explain(query: string, node: IGraphNode): Promise<string>;
}

export interface EmbeddingSearchConfig {
    topK?: number;
    minScore?: number;
    includeMetadata?: boolean;
}

export interface EmbeddingSearchResult {
    node: IGraphNode;
    score: number;
}