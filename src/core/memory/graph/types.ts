import { IMemoryUnit } from '../base';

/**
 * Graph node extending IMemoryUnit with temporal metadata
 */
export interface IGraphNode extends IMemoryUnit {
    type: string;        // Type of the node (e.g., 'episode', 'entity', 'concept')
    content: any;        // Node content
    metadata: Map<string, any>;
    
    // System time
    createdAt: Date;    // When we first created this node
    expiredAt?: Date;   // When this version was superseded
    
    // Business time (for episodic nodes)
    validAt?: Date;     // When this was true in the real world
    
    // Source tracking
    sourceEpisodeId?: string;  // Episode that created this node
}

/**
 * Graph edge representing relationships between nodes
 */
export interface IGraphEdge {
    id: string;
    type: string;
    sourceId: string;
    targetId: string;
    metadata: Map<string, any>;
    
    // System time
    createdAt: Date;     // When we created this edge
    expiredAt?: Date;    // When this version was superseded
    
    // Business time
    validAt?: Date;      // When this fact became true
    invalidAt?: Date;    // When this fact stopped being true
    
    // Source tracking
    episodeIds: string[];  // Episodes that reference this edge
    weight?: number;       // Optional edge weight for graph algorithms
}

/**
 * Filter options for graph queries
 */
export interface GraphFilter {
    nodeTypes?: string[];
    edgeTypes?: string[];
    
    // Temporal constraints
    temporal?: {
        // System time constraints
        createdBefore?: Date;
        createdAfter?: Date;
        expiredBefore?: Date;
        expiredAfter?: Date;
        
        // Business time constraints
        validBefore?: Date;
        validAfter?: Date;
        invalidBefore?: Date;
        invalidAfter?: Date;
    };
    
    metadata?: Map<string, any>;
    maxDistance?: number;
}

/**
 * Graph traversal options
 */
export interface TraversalOptions {
    maxDepth?: number;
    edgeTypes?: string[];
    direction?: 'outgoing' | 'incoming' | 'both';
    
    // Temporal point for traversal
    asOf?: Date;          // System time point
    validAt?: Date;       // Business time point
}

/**
 * Result type for graph operations
 */
export interface GraphResult {
    nodes: IGraphNode[];
    edges: IGraphEdge[];
}

/**
 * Temporal operation mode
 */
export enum TemporalMode {
    SYSTEM_TIME = 'system_time',    // When we knew about it
    BUSINESS_TIME = 'business_time', // When it was true
    BI_TEMPORAL = 'bi_temporal'      // Both system and business time
}
