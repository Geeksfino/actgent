import { IMemoryUnit } from '../base';

/**
 * Temporal metadata for graph nodes and edges
 */
export interface ITemporalMetadata {
    eventTime: Date;      // Timeline T: When the event actually occurred
    ingestionTime: Date;  // Timeline T': When the data was ingested
    validFrom?: Date;     // Start of validity period
    validTo?: Date;       // End of validity period
}

/**
 * Graph node extending IMemoryUnit with temporal metadata
 */
export interface IGraphNode extends IMemoryUnit {
    type: string;        // Type of the node (e.g., 'episode', 'entity', 'concept')
    temporal: ITemporalMetadata;
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
    temporal: ITemporalMetadata;
    weight?: number;      // Optional edge weight for graph algorithms
}

/**
 * Filter options for graph queries
 */
export interface GraphFilter {
    nodeTypes?: string[];
    edgeTypes?: string[];
    temporal?: {
        from?: Date;
        to?: Date;
        timelineType?: 'event' | 'ingestion';
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
    temporal?: {
        at?: Date;
        timelineType?: 'event' | 'ingestion';
    };
}

/**
 * Result type for graph operations
 */
export interface GraphResult {
    nodes: IGraphNode[];
    edges: IGraphEdge[];
}
