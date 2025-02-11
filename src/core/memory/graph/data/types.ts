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
 * Graph node with generic content type
 */
export interface IGraphNode<T = any> extends IGraphUnit {
    content: T;
    embedding?: Float32Array | number[];  // Support both Float32Array and number[] for embeddings
    edges: IGraphEdge[];
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
 * Node types in the graph, following a cognitive memory model
 */
export const GraphNodeType = {
    // Episodic Memory Layer (experiences and autobiographical events)
    EPISODE: 'episode',           // Direct experience/interaction (e.g., conversation turn, user action)
    EXPERIENCE: 'experience',     // Composite experience (e.g., a meeting, a trip)
    
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
    | typeof GraphNodeType.EXPERIENCE
    | typeof GraphNodeType.CONTEXT
    | typeof GraphNodeType.STATE
    | typeof GraphNodeType.PROCEDURE
    | typeof GraphNodeType.SKILL
    | typeof GraphNodeType.COMMUNITY
    | typeof GraphNodeType.PATTERN
    | EntityType;

/**
 * Type guard for episode nodes
 */
export function isEpisodeNode(node: IGraphNode): node is IGraphNode<EpisodeContent> {
    return node.type === GraphNodeType.EPISODE;
}

/**
 * Edge types in the graph, defining allowed relationships
 */
export const GraphEdgeType = {
    // Temporal relationships
    PRECEDES: 'precedes',           // A happens before B
    CONTAINS: 'contains',           // A includes B in time
    
    // Semantic relationships
    IS_A: 'is_a',                   // Type hierarchy
    PART_OF: 'part_of',            // Composition
    RELATED_TO: 'related_to',      // Generic semantic relation
    SIMILAR_TO: 'similar_to',      // Semantic similarity
    
    // Causal relationships
    CAUSES: 'causes',               // A leads to B
    INFLUENCES: 'influences',       // A affects B
    
    // Social relationships
    KNOWS: 'knows',                 // Social connection
    MEMBER_OF: 'member_of',        // Group membership
    
    // Spatial relationships
    LOCATED_IN: 'located_in',      // Physical/virtual location
    NEAR: 'near',                  // Spatial proximity
    
    // Procedural relationships
    REQUIRES: 'requires',           // Dependency
    USES: 'uses',                  // Utilization
    
    // Reference relationships
    REFERS_TO: 'refers_to',        // Reference/mention
    DESCRIBES: 'describes'         // Description/elaboration
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
    body: string;
    source: string;
    sourceDescription: string;
    timestamp: Date;
    sessionId: string;
}

/**
 * Content type for experience nodes (composite episodes)
 */
export interface ExperienceContent {
    title: string;
    description: string;
    startTime: Date;
    endTime?: Date;
    episodeIds: string[];  // References to constituent episodes
    location?: string;     // Optional location reference
    participants?: string[]; // Optional participant references
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
