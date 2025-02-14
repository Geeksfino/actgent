import { GraphTask } from '../types';

/**
 * Base interface for graph storage and indexing operations
 */
export interface IBaseGraphOperation<T> {
    store(item: T): Promise<void>;
    retrieve(id: string): Promise<T | null>;
    retrieveByFilter(filter: GraphFilter): Promise<T[]>;
    update(item: T): Promise<void>;
    delete(id: string): Promise<void>;
}

/**
 * Base interface for graph units (nodes and edges)
 */
export interface IGraphUnit {
    id: string;
    type: string;
    metadata: Map<string, any>;
    createdAt: Date;
    expiredAt?: Date;
    validAt?: Date;
}

/**
 * Relationship between nodes with timestamp
 */
export interface INodeRelationship {
    target: string;  // Target node ID
    valid_at?: string; // ISO timestamp, optional since not all relationships have temporal context
    confidence?: number; // Confidence score of the relationship
    metadata?: Record<string, any>; // Additional metadata about the relationship
}

/**
 * Collection of relationships grouped by type
 */
export interface INodeRelationships {
    [key: string]: INodeRelationship[]; // Dynamic relationship types as keys
}

/**
 * Graph node with generic content type
 */
export interface IGraphNode<T = any> extends IGraphUnit {
    content: T;
    embedding?: Float32Array | number[];  // Support both Float32Array and number[] for embeddings
    edges?: IGraphEdge[];  // Make edges optional since they are stored separately
    relationships?: INodeRelationships;  // Optional relationships field
}

/**
 * Graph edge with generic content type
 */
export interface IGraphEdge<T = any> extends IGraphUnit {
    sourceId: string;
    targetId: string;
    invalidAt?: Date;
    content: T;
    fact?: string;
}

/**
 * Episode-specific filter options
 */
export interface EpisodeFilter {
    entityIds?: string[];  // Find episodes referencing these entities
    source?: string;       // Filter by episode source
    timeRange?: {
        start: Date;
        end: Date;
    };
}

/**
 * Filter options for graph queries
 */
export interface GraphFilter {
    nodeTypes?: string[];
    edgeTypes?: string[];
    nodeIds?: string[];
    includeNeighbors?: boolean;
    timeWindow?: {
        start: Date;
        end: Date;
    };
    maxResults?: number;
    temporal?: {
        createdAfter?: Date;
        createdBefore?: Date;
        expiredAfter?: Date;
        expiredBefore?: Date;
        validAfter?: Date;  // Point-in-time validity check
        validBefore?: Date;
        validAt?: Date;
        asOf?: Date;     // Current time reference
        invalidAfter?: Date;
        invalidBefore?: Date;
    };
    metadata?: Record<string, any>;
    embedding?: number[];
    similarityThreshold?: number;
    limit?: number;
    episode?: EpisodeFilter;
    sessionId?: string;
}

/**
 * Graph traversal options
 */
export interface TraversalOptions {
    maxDepth?: number;
    edgeTypes?: string[];
    direction?: 'outbound' | 'inbound' | 'any';
    asOf?: Date;
    validAt?: Date;
}

/**
 * Interface for graph storage operations
 */
export interface IGraphStorage<N = any, E = any> {
    // Node operations
    addNode(node: IGraphNode<N>): Promise<string>;
    getNode(id: string): Promise<IGraphNode<N> | null>;
    updateNode(id: string, updates: Partial<IGraphNode<N>>): Promise<void>;
    deleteNode(id: string): Promise<void>;

    // Edge operations
    addEdge(edge: IGraphEdge<E>): Promise<string>;
    getEdge(id: string): Promise<IGraphEdge<E> | null>;
    updateEdge(id: string, updates: Partial<IGraphEdge<E>>): Promise<void>;
    deleteEdge(id: string): Promise<void>;

    // Query operations
    query(filter: GraphFilter): Promise<{nodes: IGraphNode<N>[], edges: IGraphEdge<E>[]}>; 
    traverse(startNodeId: string, options: TraversalOptions): Promise<{nodes: IGraphNode<N>[], edges: IGraphEdge<E>[]}>; 
    
    // Graph traversal operations
    findPaths(options: {
        startId: string;
        endId: string;
        maxLength?: number;
        edgeTypes?: string[];
        limit?: number;
    }): Promise<Array<{
        nodes: IGraphNode<N>[];
        edges: IGraphEdge<E>[];
        length: number;
    }>>;
    
    findConnectedNodes(options: {
        startId: string;
        edgeTypes?: string[];
        nodeTypes?: string[];
        direction?: 'incoming' | 'outgoing' | 'both';
        limit?: number;
    }): Promise<IGraphNode<N>[]>;
    
    getEdges(nodeIds: string[]): Promise<IGraphEdge<E>[]>;
}

/**
 * Interface for graph indexing operations
 */
export interface IGraphIndex<N = any, E = any> {
    indexNode(node: IGraphNode<N>): Promise<void>;
    indexEdge(edge: IGraphEdge<E>): Promise<void>;
    searchByEmbedding(embedding: number[]): Promise<string[]>;
    searchByMetadata(metadata: Record<string, any>): Promise<string[]>;
}

/**
 * Episode types in the graph
 */
export const EpisodeType = {
    MESSAGE: 'message',
    TEXT: 'text',
    JSON: 'json'
} as const;

export type EpisodeTypeValues = typeof EpisodeType[keyof typeof EpisodeType];

/**
 * Node types in the graph, following a cognitive memory model
 */
export const GraphNodeType = {
    // Episodic Memory Layer
    EPISODE: 'episode',           // Raw conversation/text data
    ENTITY_MENTION: 'mention',    // Entity mention in an episode
    EXPERIENCE: 'experience',     // Composite experience
    
    // Semantic Memory Layer (knowledge and concepts)
    ENTITY: {
        // Core entity types (mutually exclusive)
        AGENT: 'entity.agent',        // People, AI, organizations that can act
        OBJECT: 'entity.object',      // Physical or digital things
        LOCATION: 'entity.location',  // Places, coordinates, addresses
        CONCEPT: 'entity.concept',    // Abstract ideas, theories, methods
        TIME: 'entity.time',         // Temporal entities (dates, periods, events)
    } as const,
    
    // Working Memory Layer (current context and state)
    CONTEXT: 'context',          // Current execution context
    STATE: 'state',             // System or environment state
    
    // Procedural Memory Layer (skills and procedures)
    PROCEDURE: 'procedure',      // Methods, functions, algorithms
    SKILL: 'skill',             // Learned capabilities
    
    // Community Layer (emergent patterns)
    COMMUNITY: 'community',      // Clusters of related entities
    PATTERN: 'pattern'          // Recurring structures or behaviors
} as const;

// Flatten entity types for easier type checking
export type EntityType = typeof GraphNodeType.ENTITY[keyof typeof GraphNodeType.ENTITY];
export type GraphNodeTypeValues = 
    | typeof GraphNodeType.EPISODE
    | typeof GraphNodeType.ENTITY_MENTION
    | typeof GraphNodeType.EXPERIENCE
    | typeof GraphNodeType.CONTEXT
    | typeof GraphNodeType.STATE
    | typeof GraphNodeType.PROCEDURE
    | typeof GraphNodeType.SKILL
    | typeof GraphNodeType.COMMUNITY
    | typeof GraphNodeType.PATTERN
    | EntityType;

/**
 * Edge types in the graph, defining allowed relationships
 */
export const GraphEdgeType = {
    // Entity relationships
    SAME_AS: 'SAME_AS',
    ALIAS_OF: 'ALIAS_OF',
    REFERS_TO: 'REFERS_TO',
    CONTAINS: 'CONTAINS',
    PART_OF: 'PART_OF',
    RELATED_TO: 'RELATED_TO',
    TEMPORAL: 'TEMPORAL',
    LOCATION: 'LOCATION',
    ATTRIBUTE: 'ATTRIBUTE',
    INSTANCE_OF: 'INSTANCE_OF',
    SUBCLASS_OF: 'SUBCLASS_OF',
    PROPERTY_OF: 'PROPERTY_OF',
    ACTION_ON: 'ACTION_ON',
    ACTION_BY: 'ACTION_BY',
    AFFECTS: 'AFFECTS',
    CAUSES: 'CAUSES',
    PRECEDES: 'PRECEDES',
    FOLLOWS: 'FOLLOWS',
    APPEARS_IN: 'APPEARS_IN',
    MENTIONS: 'MENTIONS',
    NEXT_EPISODE: 'NEXT_EPISODE',
    PREV_EPISODE: 'PREV_EPISODE',
    MENTIONED_IN: 'MENTIONED_IN'
} as const;

export type GraphEdgeTypeValues = typeof GraphEdgeType[keyof typeof GraphEdgeType];

/**
 * Base interface for entity content
 */
export interface EntityContent {
    name: string;
    type: GraphNodeTypeValues;
    summary?: string;
    metadata?: Record<string, any>;
}

/**
 * Content type for episode nodes
 */
export interface EpisodeContent {
    type: EpisodeTypeValues;
    actor?: string;          // For message type
    content: string;         // Raw content
    metadata?: {
        session_id?: string;
        turn_id?: string;
        [key: string]: any;
    };
}

/**
 * Memory type classification
 */
export enum MemoryType {
    EPISODIC = 'episodic',     // Direct experiences
    SEMANTIC = 'semantic',      // Knowledge and facts
    WORKING = 'working',       // Current context
    PROCEDURAL = 'procedural'  // Skills and procedures
}

/**
 * Interface for a memory unit in the graph memory system
 */
export interface IGraphMemoryUnit extends IGraphNode {
    memoryType: MemoryType;
    importance: number;
    lastAccessed?: Date;
    accessCount: number;
    episodeIds?: string[];
}

/**
 * Temporal operation mode
 */
export enum TemporalMode {
    SYSTEM_TIME = 'system_time',
    EPISODE_TIME = 'episode_time',
    BUSINESS_TIME = 'business_time',
    BI_TEMPORAL = 'bi_temporal'
}

/**
 * Core Temporal Mode
 */
export enum CoreTemporalMode {
    CURRENT = 'current',
    HISTORICAL = 'historical',
    ALL = 'all'
}

/**
 * Type guard for episode nodes
 */
export function isEpisodeNode(node: IGraphNode): node is IGraphNode<EpisodeContent> {
    return node.type === GraphNodeType.EPISODE;
}
