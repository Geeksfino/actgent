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
 * Emotional state
 */
export interface EmotionalState {
    valence: number;  // -1 to 1, negative to positive
    arousal: number;  // 0 to 1, calm to excited
    dominance?: number;  // 0 to 1, submissive to dominant
    category?: string;  // e.g., 'joy', 'sadness', 'anger', etc.
}

/**
 * Emotional context interface
 */
export interface EmotionalContext {
    /**
     * Get current emotional state
     */
    getCurrentEmotion(): EmotionalState | null;

    /**
     * Get emotional trend over time
     */
    getEmotionalTrend(): EmotionalState[];

    /**
     * Add a new emotional state
     */
    addEmotion(emotion: EmotionalState): void;

    /**
     * Get average valence across emotional history
     */
    getAverageValence(): number;

    /**
     * Get average arousal across emotional history
     */
    getAverageArousal(): number;

    /**
     * Clear emotional history
     */
    clear(): void;

    /**
     * Get number of emotional states in history
     */
    getSize(): number;
}

/**
 * Emotional context implementation
 */
export class EmotionalContextImpl implements EmotionalContext {
    private emotions: EmotionalState[] = [];
    private maxHistory: number = 10;

    addEmotion(emotion: EmotionalState): void {
        this.emotions.push(emotion);
        if (this.emotions.length > this.maxHistory) {
            this.emotions.shift();
        }
    }

    getCurrentEmotion(): EmotionalState | null {
        return this.emotions[this.emotions.length - 1] || null;
    }

    getEmotionalTrend(): EmotionalState[] {
        return [...this.emotions];
    }

    getAverageValence(): number {
        if (this.emotions.length === 0) return 0;
        return this.emotions.reduce((sum, e) => sum + e.valence, 0) / this.emotions.length;
    }

    getAverageArousal(): number {
        if (this.emotions.length === 0) return 0;
        return this.emotions.reduce((sum, e) => sum + e.arousal, 0) / this.emotions.length;
    }

    clear(): void {
        this.emotions = [];
    }

    getSize(): number {
        return this.emotions.length;
    }
}

/**
 * Session context interface representing the agent's current state
 * during an interaction session.
 */
export interface SessionMemoryContext {
    /** Active goals for the current session */
    userGoals: Set<string>;
    
    /** Domain-specific context information */
    domainContext: Map<string, any>;
    
    /** History of interactions in the current session */
    interactionHistory: string[];
    
    /** Recent emotional states */
    emotionalTrends: EmotionalState[];
    
    /** Current emotional context */
    emotionalState: EmotionalContext;
    
    /** History of topics discussed in the session */
    topicHistory: string[];
    
    /** User preferences for the current session */
    userPreferences: Map<string, any>;
    
    /** Current phase of the interaction */
    interactionPhase: 'introduction' | 'main' | 'conclusion';
}

/**
 * Interface for memory context management operations
 */
export interface IMemoryContextManager {
    /**
     * Set a context value for a specific key
     * @param key The context key (e.g., 'goal', 'emotion', 'topic')
     * @param value The value to set
     */
    setContext(key: string, value: any): Promise<void>;

    /**
     * Get context value for a specific key
     * @param key The context key or 'all' for entire context
     */
    getContext(key: string): Promise<any>;

    /**
     * Clear all context and working memory context
     */
    clearContext(): Promise<void>;

    /**
     * Load context from working memory
     */
    loadContextFromWorkingMemory(): Promise<void>;

    /**
     * Register a listener for context changes
     * @param listener Function to call when context changes
     */
    onContextChange(listener: (context: SessionMemoryContext) => void): void;

    /**
     * Get current context state
     */
    getCurrentContext(): SessionMemoryContext;
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
        context: SessionMemoryContext;
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
 * Memory Types
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
 * Memory Status
 */
export enum ConsolidationStatus {
    NEW = 'new',
    PROCESSING = 'processing',
    CONSOLIDATED = 'consolidated',
    FAILED = 'failed'
}

/**
 * Memory Transition
 */
export enum TransitionTrigger {
    TIME_BASED = 'time_based',
    CONTEXT_BASED = 'context_based',
    EMOTION_BASED = 'emotion_based',
    CAPACITY_BASED = 'capacity_based',
    USER_INSTRUCTED = 'user_instructed',
    CONSOLIDATION_BASED = 'consolidation_based'
}

/**
 * Transition metadata
 */
export interface TransitionMetadata {
    userInstruction?: {
        command: string;
        target: string;
    };
    emotionalPeak?: {
        intensity: number;
        emotion: EmotionalState;
    };
    goalRelevance?: {
        score: number;
        goals: string[];
    };
    timeThreshold?: {
        elapsed: number;
        timestamp: Date;
    };
    capacityLimit?: {
        current: number;
        max: number;
    };
}

/**
 * Transition configuration
 */
export interface TransitionConfig {
    trigger: TransitionTrigger;
    condition: (memory: IMemoryUnit, context: SessionMemoryContext) => Promise<boolean>;
    priority: number;
    threshold: number;
    metadata?: TransitionMetadata;
}

/**
 * Transition criteria
 */
export interface TransitionCriteria {
    contextualCoherence: number;  // How well memory fits current context (0-1)
    emotionalSalience: number;    // Emotional significance (0-1)
    goalRelevance: number;        // Relevance to current goals (0-1)
    topicContinuity: number;      // Continuity with current topics (0-1)
    temporalProximity: number;    // Time-based relevance (0-1)
}

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
 * Relation types
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

/**
 * User instruction types
 */
export interface UserInstruction {
    command: 'remember' | 'save' | 'forget';
    target: string;
    context?: string;
    metadata?: Map<string, any>;
}
