import { z } from 'zod';

/**
 * Memory Consolidation
 */
export interface ConsolidationMetrics {
    semanticSimilarity: number;    // Semantic similarity with existing memories (0-1)
    contextualOverlap: number;     // Overlap with current context (0-1)
    temporalProximity: number;     // Time-based relevance (0-1)
    sourceReliability: number;     // Reliability of memory source (0-1)
    confidenceScore: number;       // Confidence in memory accuracy (0-1)
    accessCount: number;           // Number of times accessed
    lastAccessed: Date;           // Last access timestamp
    createdAt: Date;              // Creation timestamp
    importance: number;           // Overall importance score (0-1)
    relevance: number;            // Current relevance score (0-1)
}

/**
 * Consolidation result
 */
export interface ConsolidationResult {
    success: boolean;
    metrics: ConsolidationMetrics;
    preservedRelations: string[];  // IDs of preserved memory relations
    mergedIds: string[];          // IDs of merged memories
}

/**
 * Base interface for all memory units
 */
export interface IMemoryUnit {
    id: string;
    content: any;
    metadata: Map<string, any>;
    timestamp: Date;        // Legacy timestamp, kept for backward compatibility
    memoryType: MemoryType;
    accessCount?: number;
    lastAccessed?: Date;
    priority?: number;
    consolidationMetrics?: ConsolidationMetrics;
    associations?: Set<string>;
    
    // Temporal fields
    createdAt: Date;      // When we knew about it (system time)
    expiredAt?: Date;     // When this version was superseded (system time)
    validAt?: Date;       // When it was true (business time)
    invalidAt?: Date;     // When it stopped being true (business time)
}

/**
 * Memory Types
 */
export enum MemoryType {
    WORKING = 'working',
    LONG_TERM = 'long_term',
    DECLARATIVE = 'declarative',
    SEMANTIC = 'semantic',
    EPISODIC = 'episodic',
    PROCEDURAL = 'procedural',
    CONTEXTUAL = 'contextual',
    SYSTEM = 'system',
    GENERIC = 'generic',
    EPHEMERAL = 'ephemeral'
}

/**
 * Interface for all memory types
 */
export interface IMemory<T extends IMemoryUnit> {
    /**
     * Store content with metadata
     */
    store(content: Omit<T, 'memoryType'>): Promise<void>;

    /**
     * Retrieve a memory unit by ID
     */
    retrieve(id: string): Promise<T | null>;

    /**
     * Query memory units based on filter
     */
    query(filter: MemoryFilter): Promise<T[]>;

    /**
     * Delete a memory unit
     */
    delete(id: string): Promise<void>;

    /**
     * Clear all memory units
     */
    clear(): Promise<void>;

    /**
     * Subscribe to memory events
     */
    onEvent(callback: (unit: T) => void): void;

    /**
     * Type guard to ensure retrieved memory unit is of correct type
     */
    isMemoryUnitOfType(unit: any): unit is T;

    /**
     * Create a new memory unit with the given content and metadata
     * @param content The content to store, can be either a string or an object of type C
     * @param schema Optional schema for validating object content
     * @param metadata Optional metadata for the memory unit
     */
    createMemoryUnit<C>(content: C | string, schema?: z.ZodType<C>, metadata?: Map<string, any>): T;
}

/**
 * Filter type for memory queries
 */
export interface MemoryFilter {
    id?: string;
    ids?: string[];
    types?: MemoryType[];
    query?: string;
    dateRange?: {
        start?: Date;
        end?: Date;
    };
    metadataFilters?: Map<string, any>[];
    contentFilters?: Map<string, any>[];
    orderBy?: 'lastAccessed' | 'accessCount' | 'timestamp';
    limit?: number;
    temporal?: {
        createdAfter?: Date;
        createdBefore?: Date;
        expiredAfter?: Date;
        expiredBefore?: Date;
        validAfter?: Date;
        validBefore?: Date;
        invalidAfter?: Date;
        invalidBefore?: Date;
    };
}

/**
 * Base metadata interface that all memory types must implement
 */
export interface BaseMetadata {
    type: MemoryType;
}

/**
 * Interface for memory metadata
 */
export interface IMemoryMetadata {
    type: MemoryType;
    importanceScore?: number;
    emotionalSignificance?: number;
    consolidationStatus?: 'pending' | 'completed' | 'failed';
}

/**
 * Interface for memory association operations
 */
export interface IMemoryAssociation {
    associate(sourceId: string, targetId: string): Promise<void>;
    dissociate(sourceId: string, targetId: string): Promise<void>;
    getAssociations(id: string): Promise<string[]>;
    findRelatedMemories(id: string, maxResults?: number): Promise<IMemoryUnit[]>;
}