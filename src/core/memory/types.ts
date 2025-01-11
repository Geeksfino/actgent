/**
 * Base interface for all memory units
 */
export interface IMemoryUnit {
    id: string;
    content: any;
    metadata: Map<string, any>;
    timestamp: Date;
    accessCount?: number;
    lastAccessed?: Date;
    priority?: number;
    consolidationMetrics?: ConsolidationMetrics;
    associations?: Set<string>;
}

/**
 * Emotional context interface
 */
export interface EmotionalContext {
    emotions: Map<string, number>;
    valence: number;
    arousal: number;
    dominance: number;
    confidence: number;
    getSize(): number;
}

/**
 * Emotional context implementation
 */
export class EmotionalContextImpl implements EmotionalContext {
    constructor(
        public emotions: Map<string, number> = new Map(),
        public valence: number = 0.5,
        public arousal: number = 0.5,
        public dominance: number = 0.5,
        public confidence: number = 0.5
    ) {}

    getSize(): number {
        return this.emotions.size;
    }
}

/**
 * Memory context interface
 */
export interface MemoryContext {
    emotionalState: EmotionalContext;
    topicHistory: string[];
    userPreferences: Map<string, any>;
    interactionPhase: 'introduction' | 'main' | 'conclusion';
}

/**
 * Enhanced memory context interface
 */
export interface EnhancedMemoryContext extends MemoryContext {
    userGoals: Set<string>;
    domainContext: Map<string, any>;
    interactionHistory: string[];
    emotionalTrends: Array<{
        timestamp: Date;
        emotions: EmotionalContext;
    }>;
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
        emotions: EmotionalContext;
        context: MemoryContext;
        coherenceScore: number;
        userInstruction?: string;
        consolidationStatus?: ConsolidationStatus;
        originalMemories?: string[];  // IDs of memories that were consolidated
        relatedTo?: string[];        // IDs of related memories
        timestamp: Date;
    };
    metadata: Map<string, any>;
}

/**
 * Enum for relation types in semantic memory
 */
export enum RelationType {
    IS_A = 'is_a',
    HAS_A = 'has_a',
    PART_OF = 'part_of',
    SIMILAR_TO = 'similar_to',
    RELATED_TO = 'related_to',
    CAUSES = 'causes',
    FOLLOWS = 'follows',
    USED_FOR = 'used_for',
    LOCATED_IN = 'located_in',
    MEMBER_OF = 'member_of'
}

/**
 * Concept node in semantic memory
 */
export interface ConceptNode {
    id: string;
    name: string;
    label?: string;
    confidence: number;
    source: string;
    lastVerified: Date;
    properties: Map<string, any>;
}

/**
 * Concept relation in semantic memory
 */
export interface ConceptRelation {
    id: string;
    sourceId: string;
    targetId: string;
    type: RelationType;
    weight: number;
    confidence: number;
}

/**
 * Interface for semantic memory units, representing knowledge and concepts
 */
export interface ISemanticMemoryUnit extends IMemoryUnit {
    concept: string;
    conceptGraph: {
        nodes: Map<string, ConceptNode>;
        relations: ConceptRelation[];
    };
    confidence: number;
    source: string;
    lastVerified: Date;
    consolidationStatus?: ConsolidationStatus;
}

/**
 * Enum for different types of memory
 */
export enum MemoryType {
    WORKING = 'working',
    LONG_TERM = 'long_term',
    DECLARATIVE = 'declarative',
    SEMANTIC = 'semantic',
    EPISODIC = 'episodic',
    PROCEDURAL = 'procedural',
    CONTEXTUAL = 'contextual'
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
 * Transition criteria for memory management
 */
export interface TransitionCriteria {
    contextualCoherence: number;  // How well the memory fits in current context (0-1)
    emotionalSalience: number;    // Emotional significance (0-1)
    goalRelevance: number;        // Relevance to current goals (0-1)
    generality: number;           // How general/abstract the information is (0-1)
    consistency: number;          // Consistency with existing knowledge (0-1)
}

/**
 * Base transition trigger interface
 */
export interface BaseTransitionTrigger {
    type: 'context_change' | 'time_elapsed' | 'user_instruction' | 'emotional_peak' | 'goal_relevance';
    condition: (memory: IMemoryUnit, context: MemoryContext) => Promise<boolean>;
    priority: number;
    threshold: number;
    lastCheck: Date;
}

/**
 * Enhanced transition trigger definition
 */
export interface EnhancedTransitionTrigger extends BaseTransitionTrigger {
    metadata: {
        userInstruction?: {
            command: 'remember' | 'save' | 'forget';
            target: string;
        };
        contextChange?: {
            from: string;
            to: string;
            significance: number;
        };
        emotionalPeak?: {
            emotion: string;
            intensity: number;
        };
        goalRelevance?: {
            goal: string;
            relevanceScore: number;
        };
    };
}

/**
 * Enhanced transition config
 */
export interface EnhancedTransitionConfig {
    accessCountThreshold: number;
    timeThresholdMs: number;
    capacityThreshold: number;
    importanceThreshold: number;
    contextSwitchThreshold: number;
    emotionalSalienceThreshold: number;
    coherenceThreshold: number;
    consistencyThreshold: number;
    topicContinuityThreshold: number;
    emotionalContinuityThreshold: number;
    temporalProximityThreshold: number;
    goalAlignmentThreshold: number;
    emotionalIntensityThreshold: number;
    emotionalNoveltyThreshold: number;
    emotionalRelevanceThreshold: number;
}

/**
 * Enhanced transition criteria
 */
export interface EnhancedTransitionCriteria extends TransitionCriteria {
    topicContinuity: number;
    emotionalContinuity: number;
    temporalProximity: number;
    goalAlignment: number;
    emotionalFactors: {
        intensity: number;
        novelty: number;
        relevance: number;
    };
}

/**
 * User instruction types
 */
export interface UserInstruction {
    command: 'remember' | 'save' | 'forget';
    target: string;
    context?: string;
    metadata?: Map<string, any>;
}

/**
 * Transition trigger definition
 */
export interface TransitionTrigger {
    type: 'context_change' | 'time_elapsed' | 'user_instruction' | 'repeated_mention' | 'emotional_significance';
    threshold: number;
    metadata: Map<string, any>;
    lastCheck: Date;
    priority: number;
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
    id?: string;
    ids?: string[];
    types?: MemoryType[];
    metadataFilters?: Map<string, any>[];
    contentFilters?: Map<string, any>[];
    query?: string;
    dateRange?: {
        start?: Date;
        end?: Date;
    };
    minPriority?: number;
    maxPriority?: number;
    type?: MemoryType;
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
    batchRetrieve(ids: string[]): Promise<(IMemoryUnit | null)[]>;
    update(memory: IMemoryUnit): Promise<void>;
    delete(id: string): Promise<void>;
}

/**
 * Interface for memory indexing operations
 */
export interface IMemoryIndex {
    add(memory: IMemoryUnit): Promise<void>;
    search(query: string): Promise<string[]>;
    update(memory: IMemoryUnit): Promise<void>;
    delete(id: string): Promise<void>;
    index?: (memory: IMemoryUnit) => Promise<void>;
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
 * Consolidation metrics
 */
export interface ConsolidationMetrics {
    semanticSimilarity?: number;
    contextualOverlap?: number;
    temporalProximity?: number;
    sourceReliability?: number;
    confidenceScore?: number;
    accessCount?: number;
    lastAccessed?: Date;
    createdAt?: Date;
    importance?: number;
    relevance?: number;
}

/**
 * Consolidation result
 */
export interface ConsolidationResult {
    success: boolean;
    metrics?: ConsolidationMetrics;
    preservedRelations: string[];    // IDs of preserved relationships
    mergedIds: string[];            // IDs of merged memory units
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

    if (filter.id) {
        queryParts.push(`id:${filter.id}`);
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

    if (filter.query) {
        queryParts.push(filter.query);
    }

    return queryParts.join(' AND ');
}
