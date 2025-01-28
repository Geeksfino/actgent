/**
 * Configuration for graph operations
 */
export interface GraphConfig {
    // Storage configuration
    storage: {
        type: 'memory' | 'neo4j';  // Extensible for future storage types
        maxCapacity?: number;      // Maximum nodes in memory
        options?: Record<string, any>;  // Storage-specific options
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

    // LLM configuration
    llm: {
        client: any; // OpenAI-compatible client
        config?: LLMConfig;
    }
}

/**
 * Configuration for LLM requests
 */
export interface LLMConfig {
    model: string;
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
    EVALUATE_PATHS = 'evaluate_paths',
    EXTRACT_TEMPORAL = 'extract_temporal',
    PREPARE_FOR_EMBEDDING = 'prepare_for_embedding',
    CONSOLIDATE_EPISODES = 'consolidate_episodes',

    // Entity resolution tasks
    DEDUPE_NODE = 'dedupe_node',
    DEDUPE_EDGE = 'dedupe_edge',
    DEDUPE_BATCH = 'dedupe_batch',
    DEDUPE_BATCH_EDGES = 'dedupe_batch_edges',

    // Evaluation tasks
    EVALUATE_COMMUNITY = 'evaluate_community',
    EVALUATE_SEARCH = 'evaluate_search'
}
