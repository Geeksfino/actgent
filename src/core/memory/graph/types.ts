import { OpenAI } from 'openai';
import { EmbedderProvider } from './embedder';
import { IGraphNode } from './data/types';

/**
 * Configuration for graph operations
 */
export interface GraphConfig {
    // Storage configuration
    storage?: {
        type: 'memory' | 'neo4j';  // Extensible for future storage types
        config?: any;  // Storage-specific options
    };

    // Embedder configuration
    embedder?: {
        provider: EmbedderProvider;
        config?: any;
    };

    // Episode configuration
    episode?: {
        validateTimestamp?: boolean;  // Whether to enforce timestamp validation
        autoSetValidAt?: boolean;     // Auto-set validAt to match episode timestamp
    };

    // Query configuration
    query?: {
        maxResults?: number;  // Default max results for queries
        defaultTimeWindow?: {  // Default time window for temporal queries
            start: Date;
            end: Date;
        };
    };

    // Search configuration
    search?: {
        textWeight: number;      // Weight for BM25 scores
        embeddingWeight: number; // Weight for embedding similarity scores
        minTextScore: number;    // Minimum BM25 score threshold
        minEmbeddingScore: number; // Minimum embedding similarity threshold
        limit: number;           // Maximum number of results to return
    };

    // LLM configuration
    llm: LLMConfig & {
        client: OpenAI;  // The instantiated OpenAI client
    };
}

/**
 * Configuration for LLM requests
 */
export interface LLMConfig {
    model: string;
    apiKey: string;
    baseURL?: string;
    streamMode?: boolean;
    temperature: number;
    maxTokens: number;
}

/**
 * Unified enum for all graph processing tasks
 */
export enum GraphTask {
    // LLM-based tasks
    RERANK_RESULTS = 'rerank_results',
    REFINE_COMMUNITIES = 'refine_communities',
    FACT_EXTRACTION = 'evaluate_paths',
    EXTRACT_TEMPORAL = 'extract_temporal',
    EXTRACT_ENTITIES = 'extract_entities',
    PREPARE_FOR_EMBEDDING = 'prepare_for_embedding',
    CONSOLIDATE_EPISODES = 'consolidate_episodes',
    LABEL_COMMUNITY = 'label_community',
    SUMMARIZE_CHUNK = 'summarize_chunk',
    COMBINE_SUMMARIES = 'combine_summaries',
    SUMMARIZE_NODE = 'summarize_node',  

    // Entity resolution tasks
    DEDUPE_NODE = 'dedupe_node',
    DEDUPE_EDGE = 'dedupe_edge',
    DEDUPE_BATCH = 'dedupe_batch',
    DEDUPE_BATCH_EDGES = 'dedupe_batch_edges',
    INVALIDATE_EDGES = 'invalidate_edges',

    // Evaluation tasks
    EVALUATE_COMMUNITY = 'evaluate_community',
    EVALUATE_SEARCH = 'evaluate_search',
    EXPAND_QUERY = 'expand_query'
}
