import { IGraphNode } from '../data/types';
import { SearchResult } from '../processing/entity/types';

/**
 * Configuration for reranking
 */
export interface RerankerConfig {
    maxResults?: number;
    minScore?: number;
    model?: string;
    weights?: {
        relevance?: number;    // Base relevance score
        crossEncoder?: number; // Cross-encoder semantic score
        diversity?: number;    // MMR diversity score
        temporal?: number;     // Time-based score
        connectivity?: number; // Graph connectivity score
        importance?: number;   // Node importance score
    };
    crossEncoder?: {
        model: string;
        batchSize: number;
        scoreThreshold: number;
        maxTokens?: number;
        temperature?: number;
    };
    mmr?: {
        diversityWeight: number;
        lambda: number;
    };
    temporal?: {
        decayRate: number;
        referenceTime?: Date;
    };
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