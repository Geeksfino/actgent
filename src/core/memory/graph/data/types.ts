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
}

/**
 * Graph edge with generic content type
 */
export interface IGraphEdge<T = any> extends IGraphUnit {
    sourceId: string;
    targetId: string;
    invalidAt?: Date;
    content: T;
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
 * Interface for a memory unit in the graph memory system
 */
export interface IGraphMemoryUnit extends IGraphNode {
    memoryType: GraphMemoryType;
    importance: number;
    lastAccessed?: Date;
    accessCount: number;
    episodeIds?: string[];
}

/**
 * Graph Memory Type
 */
export enum GraphMemoryType {
    EPISODIC = 'episodic',
    SEMANTIC = 'semantic',
    PROCEDURAL = 'procedural',
    WORKING = 'working'
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
 * Node types in the graph
 */
export const GraphNodeType = {
    EPISODE: 'episode',
    ENTITY: 'entity',
    SEMANTIC: 'semantic'
} as const;

export type GraphNodeTypeValues = typeof GraphNodeType[keyof typeof GraphNodeType];

/**
 * Content type for episode nodes
 */
export interface EpisodeContent {
    body: string;
    source: string;
    sourceDescription: string;
    timestamp: Date;  // When the episode occurred
    sessionId: string;
}

/**
 * Type guard for episode nodes
 */
export function isEpisodeNode(node: IGraphNode): node is IGraphNode<EpisodeContent> {
    return node.type === GraphNodeType.EPISODE;
}
