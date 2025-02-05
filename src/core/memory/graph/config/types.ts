/**
 * Base configuration interface for all graph-related configurations
 */
export interface GraphBaseConfig {
    /** Whether this component is enabled */
    enabled: boolean;
    /** Maximum number of results to return */
    maxResults?: number;
}

/**
 * Configuration for MMR (Maximal Marginal Relevance)
 */
export interface MMRConfig {
    /** Lambda parameter for MMR, controls diversity vs relevance tradeoff */
    lambda?: number;
    /** Metric to use for diversity calculation */
    diversityMetric?: 'cosine' | 'euclidean';
    /** Minimum diversity score threshold */
    minDiversityScore?: number;
}

/**
 * Configuration for RRF (Reciprocal Rank Fusion)
 */
export interface RRFConfig {
    /** Constant to control ranking influence */
    k?: number;
    /** Whether to use rank fusion instead of linear combination */
    useRankFusion?: boolean;
    /** Use RRF as preliminary step */
    useAsPreranker?: boolean;
}

/**
 * Configuration for cross-encoder reranking
 */
export interface CrossEncoderConfig {
    /** Model to use for cross-encoding */
    model?: string;
    /** Batch size for processing */
    batchSize?: number;
    /** Score threshold for filtering */
    scoreThreshold?: number;
}

/**
 * Configuration for temporal scoring
 */
export interface TemporalConfig {
    /** Rate at which scores decay over time */
    decayRate?: number;
}

/**
 * Configuration for graph-based features
 */
export interface GraphFeatureConfig {
    /** Maximum path length to consider */
    maxPathLength?: number;
    /** Center node for distance calculations */
    centerNodeId?: string;
    /** Query node IDs for path finding */
    queryNodeIds?: string[];
    /** Edge types to consider */
    edgeTypes?: string[];
}

/**
 * Configuration for reranking operations
 */
export interface RerankerConfig extends GraphBaseConfig {
    /** MMR-specific configuration */
    mmr?: MMRConfig;
    /** RRF-specific configuration */
    rrf?: RRFConfig;
    /** Cross-encoder specific configuration */
    crossEncoder?: CrossEncoderConfig;
    /** Temporal scoring configuration */
    temporal?: TemporalConfig;
    /** Graph feature configuration */
    graphFeatures?: GraphFeatureConfig;
    /** Feature weights for different ranking signals */
    weights?: {
        /** Base relevance score weight */
        relevance?: number;
        /** Cross-encoder semantic score weight */
        crossEncoder?: number;
        /** MMR diversity score weight */
        diversity?: number;
        /** Time-based score weight */
        temporal?: number;
        /** Graph connectivity score weight */
        connectivity?: number;
        /** Node importance score weight */
        importance?: number;
    };
}

/**
 * Configuration for vector-based search
 */
export interface VectorSearchConfig {
    /** Model to use for embedding generation */
    model?: string;
    /** Similarity metric for vector search */
    metric?: 'cosine' | 'euclidean' | 'dot';
    /** Score threshold for filtering */
    scoreThreshold?: number;
    /** Whether to normalize vectors before search */
    normalize?: boolean;
    /** Whether to use approximate nearest neighbors */
    useANN?: boolean;
    /** Number of neighbors to consider in ANN */
    numNeighbors?: number;
}

/**
 * Configuration for text-based search
 */
export interface TextSearchConfig {
    /** Search algorithm to use */
    algorithm?: 'bm25' | 'tfidf' | 'fuzzy';
    /** Score threshold for filtering */
    scoreThreshold?: number;
    /** Whether to use stemming */
    useStemming?: boolean;
    /** Whether to remove stopwords */
    removeStopwords?: boolean;
    /** Language for text processing */
    language?: string;
    /** Custom stopwords list */
    stopwords?: string[];
}

/**
 * Configuration for hybrid search
 */
export interface HybridSearchConfig {
    /** Whether to use hybrid search */
    enabled?: boolean;
    /** Weight for vector search scores */
    vectorWeight?: number;
    /** Weight for text search scores */
    textWeight?: number;
    /** Weight for graph-based scores */
    graphWeight?: number;
    /** Minimum combined score threshold */
    scoreThreshold?: number;
}

/**
 * Configuration for LLM-based search
 */
export interface LLMSearchConfig {
    /** Whether to use LLM for search */
    enabled?: boolean;
    /** Model to use for query understanding */
    model?: string;
    /** Maximum tokens for query expansion */
    maxTokens?: number;
    /** Temperature for query expansion */
    temperature?: number;
    /** Whether to use query expansion */
    useQueryExpansion?: boolean;
    /** Whether to use semantic filtering */
    useSemanticFiltering?: boolean;
}

/**
 * Main search configuration
 */
export interface SearchConfig extends GraphBaseConfig {
    textWeight: number;      // Weight for BM25 scores
    embeddingWeight: number; // Weight for embedding similarity scores
    minTextScore: number;    // Minimum BM25 score threshold
    minEmbeddingScore: number; // Minimum embedding similarity threshold
    limit: number;           // Maximum number of results to return
    explain?: boolean;       // Whether to explain search decisions
    useCache?: boolean;      // Whether to use caching
    cacheTTL?: number;       // Cache TTL in seconds
    llm?: LLMSearchConfig;   // LLM-specific search config
    reranking?: {
        enabled?: boolean;   // Whether to use reranking
        maxResults?: number; // Maximum results after reranking
        weights?: {
            relevance?: number;    // Weight for base relevance score
            crossEncoder?: number; // Weight for cross-encoder score
            recency?: number;      // Weight for temporal recency
            connectivity?: number; // Weight for node connectivity
            importance?: number;   // Weight for node importance
        };
        rrf?: {
            useRankFusion?: boolean; // Whether to use RRF
            k?: number;             // RRF constant (default: 60)
        };
        mmr?: {
            lambda?: number;        // MMR trade-off parameter (default: 0.5)
        };
        graphFeatures?: {
            centerNodeId?: string;  // Central node for graph-based features
            queryNodeIds?: string[]; // Additional nodes for context
            maxPathLength?: number; // Max path length for graph features
            edgeTypes?: string[];  // Edge types to consider
        };
    };
    vector?: VectorSearchConfig;
    text?: TextSearchConfig;
    hybrid?: HybridSearchConfig;
}
