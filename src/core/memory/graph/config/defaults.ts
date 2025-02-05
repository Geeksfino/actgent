import { 
    RerankerConfig,
    MMRConfig,
    RRFConfig,
    CrossEncoderConfig,
    TemporalConfig,
    GraphFeatureConfig,
    VectorSearchConfig,
    TextSearchConfig,
    HybridSearchConfig,
    LLMSearchConfig,
    SearchConfig
} from './types';

/**
 * Default MMR configuration
 */
export const DEFAULT_MMR_CONFIG: MMRConfig = {
    lambda: 0.7,
    diversityMetric: 'cosine',
    minDiversityScore: 0.1
};

/**
 * Default RRF configuration
 */
export const DEFAULT_RRF_CONFIG: RRFConfig = {
    k: 60,
    useRankFusion: true,
    useAsPreranker: false
};

/**
 * Default cross-encoder configuration
 */
export const DEFAULT_CROSS_ENCODER_CONFIG: CrossEncoderConfig = {
    model: 'cross-encoder/ms-marco-MiniLM-L-6-v2',
    batchSize: 32,
    scoreThreshold: 0.5
};

/**
 * Default temporal configuration
 */
export const DEFAULT_TEMPORAL_CONFIG: TemporalConfig = {
    decayRate: 0.1
};

/**
 * Default graph feature configuration
 */
export const DEFAULT_GRAPH_FEATURE_CONFIG: GraphFeatureConfig = {
    maxPathLength: 3,
    edgeTypes: []
};

/**
 * Default reranker configuration
 */
export const DEFAULT_RERANKER_CONFIG: RerankerConfig = {
    enabled: true,
    maxResults: 10,
    mmr: DEFAULT_MMR_CONFIG,
    rrf: DEFAULT_RRF_CONFIG,
    crossEncoder: DEFAULT_CROSS_ENCODER_CONFIG,
    temporal: DEFAULT_TEMPORAL_CONFIG,
    graphFeatures: DEFAULT_GRAPH_FEATURE_CONFIG,
    weights: {
        relevance: 1.0,
        crossEncoder: 0.8,
        diversity: 0.6,
        temporal: 0.4,
        connectivity: 0.5,
        importance: 0.7
    }
};

/**
 * Default vector search configuration
 */
export const DEFAULT_VECTOR_SEARCH_CONFIG: VectorSearchConfig = {
    model: 'all-MiniLM-L6-v2',
    metric: 'cosine',
    scoreThreshold: 0.6,
    normalize: true,
    useANN: false,
    numNeighbors: 50
};

/**
 * Default text search configuration
 */
export const DEFAULT_TEXT_SEARCH_CONFIG: TextSearchConfig = {
    algorithm: 'bm25',
    scoreThreshold: 0.3,
    useStemming: true,
    removeStopwords: true,
    language: 'english'
};

/**
 * Default hybrid search configuration
 */
export const DEFAULT_HYBRID_SEARCH_CONFIG: HybridSearchConfig = {
    enabled: true,
    vectorWeight: 0.7,
    textWeight: 0.2,
    graphWeight: 0.1,
    scoreThreshold: 0.5
};

/**
 * Default LLM search configuration
 */
export const DEFAULT_LLM_SEARCH_CONFIG: LLMSearchConfig = {
    enabled: false,
    model: 'gpt-3.5-turbo',
    maxTokens: 100,
    temperature: 0.7,
    useQueryExpansion: false,
    useSemanticFiltering: false
};

/**
 * Default search configuration
 */
export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
    enabled: true,         // Enable search by default
    textWeight: 0.3,        // Lower weight for text similarity
    embeddingWeight: 0.7,   // Higher weight for semantic similarity
    minTextScore: 0.05,     // Much lower text threshold
    minEmbeddingScore: 0.1, // Much lower embedding threshold
    limit: 50,              // Default limit
    explain: false,         // Don't explain by default
    useCache: true,         // Use caching by default
    cacheTTL: 3600,        // 1 hour cache TTL
    reranking: {
        enabled: true,      // Enable reranking by default
        maxResults: 20,     // Return top 20 results after reranking
        weights: {
            relevance: 0.4,     // Base relevance score
            crossEncoder: 0.3,  // Cross-encoder refinement
            recency: 0.1,      // Temporal recency
            connectivity: 0.1,  // Graph connectivity
            importance: 0.1     // Node importance
        },
        rrf: {
            useRankFusion: true,  // Use RRF by default
            k: 60                 // Default RRF constant
        },
        mmr: {
            lambda: 0.5           // Balance between relevance and diversity
        },
        graphFeatures: {
            maxPathLength: 3,     // Consider paths up to length 3
            edgeTypes: ['next', 'related', 'reference']  // Default edge types
        }
    }
};
