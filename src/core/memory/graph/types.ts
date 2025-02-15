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
    EVALUATE_PATHS = 'evaluate_paths',
    FACT_EXTRACTION = 'fact_extraction',
    EXTRACT_TEMPORAL = 'extract_temporal',
    EXTRACT_ENTITIES = 'extract_entities',
    PREPARE_FOR_EMBEDDING = 'prepare_for_embedding',
    CONSOLIDATE_EPISODES = 'consolidate_episodes',
    LABEL_COMMUNITY = 'label_community',
    SUMMARIZE_CHUNK = 'summarize_chunk',
    COMBINE_SUMMARIES = 'combine_summaries',
    SUMMARIZE_NODE = 'summarize_node',  

    // Entity resolution tasks
    DEDUPE_NODES = 'dedupe_node',
    DEDUPE_EDGE = 'dedupe_edge',
    DEDUPE_BATCH = 'dedupe_batch',
    DEDUPE_BATCH_EDGES = 'dedupe_batch_edges',
    INVALIDATE_EDGES = 'invalidate_edges',
    RESOLVE_FACTS = 'resolve_facts',

    // Evaluation tasks
    EVALUATE_COMMUNITY = 'evaluate_community',
    EVALUATE_SEARCH = 'evaluate_search',
    EXPAND_QUERY = 'expand_query'
}

/**
 * Type of episode content
 */
export type EpisodeType = 'message' | 'text' | 'json';

/**
 * Type of episode content values
 */
export type EpisodeTypeValues = 'text' | 'message' | 'json';

/**
 * Text content
 */
export interface TextContent {
    data: string;
}

/**
 * Message
 */
export interface Message {
    role: "user" | "assistant" | string;
    body: string;
    timestamp: string;
    turnId: string;
}

/**
 * Message content
 */
export interface MessageContent {
    messages: Message[];
}

/**
 * Json content
 */
export interface JsonContent {
    jsonData: any;
}

/**
 * Episode content
 */
export interface EpisodeContent {
    type: EpisodeTypeValues;
    content: TextContent | MessageContent | JsonContent;
    metadata?: {
        session_id?: string;
        turn_id?: string;
        [key: string]: any;
    };
}

/**
 * Base class for all episodes in the graph memory system.
 * Episodes are the fundamental units of information that can be stored and processed.
 */
export class Episode {
    /**
     * Unique identifier for this episode
     */
    episodeId: string;

    /**
     * Type of episode content
     */
    type: EpisodeType;

    /**
     * ID of the session this episode belongs to
     */
    sessionId: string;

    /**
     * Reference time for this episode, used for temporal ordering
     */
    referenceTime: Date;

    /**
     * Optional metadata associated with this episode
     */
    metadata?: Record<string, any>;

    constructor(episodeId: string, type: EpisodeType, sessionId: string, referenceTime: Date, metadata?: Record<string, any>) {
        this.episodeId = episodeId;
        this.type = type;
        this.sessionId = sessionId;
        this.referenceTime = referenceTime;
        this.metadata = metadata;
    }
}

/**
 * Episode containing message-based content (e.g. conversation turns)
 */
export class MessageEpisode extends Episode {
    /**
     * Array of messages that make up this episode
     */
    content: Array<{
        id: string;
        role: string;
        body: string;
        timestamp: Date;
        turnId: string;
    }>;

    constructor(
        episodeId: string,
        sessionId: string,
        referenceTime: Date,
        content: Array<{
            id: string;
            role: string;
            body: string;
            timestamp: Date;
            turnId: string;
        }>,
        metadata?: Record<string, any>
    ) {
        super(episodeId, 'message', sessionId, referenceTime, metadata);
        this.content = content;
    }
}

/**
 * Episode containing text content
 */
export class TextEpisode extends Episode {
    /**
     * Text content of this episode
     */
    content: string;

    constructor(
        episodeId: string,
        sessionId: string,
        referenceTime: Date,
        content: string,
        metadata?: Record<string, any>
    ) {
        super(episodeId, 'text', sessionId, referenceTime, metadata);
        this.content = content;
    }
}

/**
 * Episode containing JSON content
 */
export class JsonEpisode extends Episode {
    /**
     * JSON content of this episode
     */
    content: Record<string, any>;

    constructor(
        episodeId: string,
        sessionId: string,
        referenceTime: Date,
        content: Record<string, any>,
        metadata?: Record<string, any>
    ) {
        super(episodeId, 'json', sessionId, referenceTime, metadata);
        this.content = content;
    }
}

/**
 * LLM call statistics
 */
export interface LLMCallStats {
    task: string;
    duration: number;
    success: boolean;
    metadata?: {
        inputEntities?: number;
        outputEntities?: number;
    };
}

/**
 * Processing statistics
 */
export interface ProcessingStats {
    llmCalls: LLMCallStats[];
}
