import { IGraphNode } from '../data/types';

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
        graph?: {              // Graph feature weights
            distance?: number;
            mentions?: number;
            paths?: number;
        };
    };
    crossEncoder?: {
        model?: string;
        batchSize?: number;
        scoreThreshold?: number;
        maxTokens?: number;
        temperature?: number;
    };
    mmr?: {
        diversityWeight?: number;
        lambda?: number;
    };
    temporal?: {
        decayRate?: number;
    };
    rrf?: {
        k?: number;               // Constant to control ranking influence (default: 60)
        useRankFusion?: boolean;  // Whether to use RRF instead of linear combination
        useAsPreranker?: boolean; // Use RRF as preliminary step like Graphiti
        sources?: {               // Configure ranking sources
            embedding?: boolean;
            text?: boolean;
            llm?: boolean;
            graph?: boolean;
        };
    };
    graph?: {
        maxPathLength?: number;   // Maximum path length to consider
        centerNodeId?: string;    // Center node for distance calculations
        queryNodeIds?: string[];  // Query nodes for path finding
        edgeTypes?: string[];     // Edge types to consider
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

export interface GraphFeatures {
    distance: number;         // Distance to center/query nodes
    episodeMentions: number; // Number of episode mentions
    paths: {                 // Path-based features
        length: number;
        types: string[];     // Edge types in path
        nodes: string[];     // Node IDs in path
    }[];
}

export interface RankingFeatures {
    relevanceScore: number;     // Base relevance score from search
    crossEncoderScore?: number; // Score from cross-encoder
    diversityScore?: number;    // MMR diversity score
    recency: number;            // Time-based score
    connectivity: number;       // Graph connectivity score
    importance: number;         // Node importance score
    rrf?: number;              // Reciprocal Rank Fusion score
    graph?: GraphFeatures;      // Graph-specific features
    ranks: {                    // Individual ranks from each system
        embedding?: number;
        text?: number;
        llm?: number;
        graph?: number;         // Rank from graph-based scoring
    };
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