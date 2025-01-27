/**
 * Configuration for LLM requests
 */
export interface LLMConfig {
    model: string;
    temperature: number;
    maxTokens: number;
}

/**
 * Configuration for graph operations
 */
export interface GraphConfig {
    llm: {
        client: any; // OpenAI-compatible client
        config?: LLMConfig;
    };
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

    // Evaluation tasks
    EVALUATE_COMMUNITY = 'evaluate_community',
    EVALUATE_SEARCH = 'evaluate_search'
}
