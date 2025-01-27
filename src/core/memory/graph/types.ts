/**
 * Configuration for graph operations
 */
export interface GraphConfig {
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
