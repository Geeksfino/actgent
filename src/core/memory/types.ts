/**
 * Base interface for all memory units
 */
export interface IMemoryUnit {
    id: string;
    content: any;
    metadata: Map<string, any>;
    timestamp: Date;
    priority?: number;
    accessCount?: number;
    lastAccessed?: Date;
    associations?: string[]; // IDs of related memories
}

/**
 * Interface for episodic memory units, representing experiences and events
 */
export interface IEpisodicMemoryUnit extends IMemoryUnit {
    timeSequence: number;
    location: string;
    actors: string[];
    actions: string[];
    emotions: Map<string, number>;
    consolidationStatus?: ConsolidationStatus;
}

/**
 * Interface for semantic memory units, representing knowledge and concepts
 */
export interface ISemanticMemoryUnit extends IMemoryUnit {
    concept: string;
    relations: Map<string, string[]>;
    confidence: number;
    source: string;
    consolidationStatus?: ConsolidationStatus;
}

/**
 * Enum for different types of memory
 */
export enum MemoryType {
    WORKING = 'working',
    EPISODIC = 'episodic',
    SEMANTIC = 'semantic',
    PROCEDURAL = 'procedural',
    PERCEPTUAL = 'perceptual',
    SOCIAL = 'social',
    CONTEXTUAL = 'contextual'
}

/**
 * Enum for memory consolidation status
 */
export enum ConsolidationStatus {
    UNCONSOLIDATED = 'unconsolidated',
    IN_PROGRESS = 'in_progress',
    CONSOLIDATED = 'consolidated'
}

/**
 * Filter type for memory queries
 */
export interface MemoryFilter {
    types?: MemoryType[];
    metadataFilters?: Map<string, any>[];
    contentFilters?: Map<string, any>[];
    contextFilter?: Map<string, any>;
    dateRange?: {
        start: Date;
        end: Date;
    };
    ids?: string[];
    query?: string;
    minPriority?: number;
    maxPriority?: number;
    consolidationStatus?: ConsolidationStatus;
    minAccessCount?: number;
    associatedWith?: string[]; // Filter memories associated with these IDs
    // Time range for backward compatibility
    startTime?: Date;
    endTime?: Date;
    // Direct metadata filter for backward compatibility
    metadata?: Map<string, any>;
}

/**
 * Interface for memory retrieval operations
 */
export interface IMemoryRetrieval {
    query(filter: MemoryFilter): Promise<IMemoryUnit[]>;
    exists(id: string): Promise<boolean>;
    getAssociatedMemories(id: string): Promise<IMemoryUnit[]>;
}

/**
 * Interface for memory storage operations
 */
export interface IMemoryStorage {
    store(memory: IMemoryUnit): Promise<void>;
    retrieve(id: string): Promise<IMemoryUnit | null>;
    retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]>;
    update(memory: IMemoryUnit): Promise<void>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
    batchStore(memories: IMemoryUnit[]): Promise<void>;
    batchRetrieve(ids: string[]): Promise<(IMemoryUnit | null)[]>;
}

/**
 * Interface for memory indexing operations
 */
export interface IMemoryIndex {
    add(memory: IMemoryUnit): Promise<void>;
    index(memory: IMemoryUnit): Promise<void>;  // Alias for add for backward compatibility
    search(query: string): Promise<string[]>;
    update(memory: IMemoryUnit): Promise<void>;
    remove(id: string): Promise<void>;
    batchIndex(memories: IMemoryUnit[]): Promise<void>;
}

/**
 * Interface for memory consolidation operations
 */
export interface IMemoryConsolidation {
    consolidate(memory: IMemoryUnit): Promise<void>;
    getConsolidationCandidates(): Promise<IMemoryUnit[]>;
    isConsolidationNeeded(memory: IMemoryUnit): boolean;
    updateWorkingMemorySize(delta: number): Promise<void>;
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

/**
 * Interface for memory context management operations
 */
export interface IMemoryContextManager {
    setContext(key: string, value: any): Promise<void>;
    getContext(key: string): Promise<any>;
    getAllContext(): Promise<Map<string, any>>;
    clearContext(): Promise<void>;
    storeContextAsEpisodicMemory(context: Map<string, any>): Promise<void>;
}

/**
 * Helper function to build query string from memory filter
 */
export function buildQueryFromFilter(filter: MemoryFilter): string {
    const queryParts: string[] = [];

    if (filter.types?.length) {
        queryParts.push(`type:(${filter.types.join(' OR ')})`);
    }

    if (filter.dateRange) {
        if (filter.dateRange.start) {
            queryParts.push(`timestamp >= ${filter.dateRange.start.toISOString()}`);
        }
        if (filter.dateRange.end) {
            queryParts.push(`timestamp <= ${filter.dateRange.end.toISOString()}`);
        }
    }

    if (filter.ids?.length) {
        queryParts.push(`id:(${filter.ids.join(' OR ')})`);
    }

    if (filter.minPriority !== undefined) {
        queryParts.push(`priority >= ${filter.minPriority}`);
    }

    if (filter.maxPriority !== undefined) {
        queryParts.push(`priority <= ${filter.maxPriority}`);
    }

    if (filter.consolidationStatus) {
        queryParts.push(`consolidationStatus:${filter.consolidationStatus}`);
    }

    if (filter.minAccessCount !== undefined) {
        queryParts.push(`accessCount >= ${filter.minAccessCount}`);
    }

    if (filter.associatedWith?.length) {
        queryParts.push(`associations:(${filter.associatedWith.join(' OR ')})`);
    }

    if (filter.metadataFilters?.length) {
        for (const metadataFilter of filter.metadataFilters) {
            for (const [key, value] of metadataFilter.entries()) {
                queryParts.push(`metadata.${key}:${value}`);
            }
        }
    }

    if (filter.contentFilters?.length) {
        for (const contentFilter of filter.contentFilters) {
            for (const [key, value] of contentFilter.entries()) {
                queryParts.push(`content.${key}:${value}`);
            }
        }
    }

    if (filter.contextFilter?.size) {
        for (const [key, value] of filter.contextFilter.entries()) {
            queryParts.push(`context.${key}:${value}`);
        }
    }

    if (filter.query) {
        queryParts.push(filter.query);
    }

    return queryParts.join(' AND ');
}
