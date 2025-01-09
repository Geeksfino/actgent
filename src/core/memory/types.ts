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
    content: {
        timeSequence: number;
        location: string;
        actors: string[];
        actions: string[];
        emotions?: Map<string, number>;
        consolidationStatus?: ConsolidationStatus;
        originalMemories?: string[];  // IDs of memories that were consolidated
        relatedTo?: string[];        // IDs of related memories
        timestamp: Date;
    };
    metadata: Map<string, any>;
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
    CONTEXTUAL = 'contextual',
    LONG_TERM = 'long_term'
}

/**
 * Enum for memory consolidation status
 */
export enum ConsolidationStatus {
    NEW = 'new',
    CONSOLIDATED = 'consolidated',
    ABSTRACT = 'abstract'
}

/**
 * Interface for emotional context
 */
export interface EmotionalContext {
    valence: number;      // -1 to 1, negative to positive
    arousal: number;      // 0 to 1, calm to excited
    dominance: number;    // 0 to 1, submissive to dominant
}

/**
 * Base metadata interface that all memory types must implement
 */
export interface BaseMetadata {
    type: MemoryType;
}

/**
 * Working memory specific metadata
 */
export interface WorkingMetadata extends BaseMetadata {
    type: MemoryType.WORKING;
    expiresAt: number;
}

/**
 * Episodic memory specific metadata
 */
export interface EpisodicMetadata extends BaseMetadata {
    type: MemoryType.EPISODIC;
    importanceScore?: number;
    emotionalSignificance?: number;
    consolidationStatus?: ConsolidationStatus;
    consolidatedFrom?: string;
    consolidatedInto?: string;
    location?: string;
    actors?: string;
}

/**
 * Convert a metadata object to a Map
 */
export function metadataToMap(metadata: BaseMetadata): Map<string, any> {
    return new Map(Object.entries(metadata));
}

/**
 * Convert a Map back to a typed metadata object
 */
export function mapToMetadata<T extends BaseMetadata>(map: Map<string, any>): T {
    const obj: any = {};
    map.forEach((value, key) => {
        obj[key] = value;
    });
    return obj as T;
}

/**
 * Create working memory metadata
 */
export function createWorkingMetadata(expiresAt: number): Map<string, any> {
    const metadata: WorkingMetadata = {
        type: MemoryType.WORKING,
        expiresAt
    };
    return metadataToMap(metadata);
}

/**
 * Create episodic memory metadata
 */
export function createEpisodicMetadata(params: Partial<Omit<EpisodicMetadata, 'type'>>): Map<string, any> {
    const metadata: EpisodicMetadata = {
        type: MemoryType.EPISODIC,
        ...params
    };
    return metadataToMap(metadata);
}

/**
 * Type guard to check if metadata map represents working memory
 */
export function isWorkingMemory(metadata: Map<string, any>): boolean {
    return metadata.get('type') === MemoryType.WORKING;
}

/**
 * Type guard to check if metadata map represents episodic memory
 */
export function isEpisodicMemory(metadata: Map<string, any>): boolean {
    return metadata.get('type') === MemoryType.EPISODIC;
}

/**
 * Interface for memory metadata
 */
export interface IMemoryMetadata {
    type: MemoryType;
    importanceScore?: number;
    emotionalSignificance?: number;
    consolidationStatus?: ConsolidationStatus;
    [key: string]: any;
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
