/**
 * Session context interface representing the agent's current state
 * during an interaction session.
 */
export interface SessionMemoryContext {
    /** Type of context change */
    contextType: 'capacity_warning' | 'goal_completion' | 'emotional_peak' | 'context_change';
    /** Timestamp of the context change */
    timestamp: Date;
    /** Optional metadata */
    metadata?: Map<string, any>;
    /** Active goals for the current session */
    userGoals: Set<string>;
    /** Domain-specific context */
    domainContext: Map<string, any>;
    /** History of interactions */
    interactionHistory: Array<{
        timestamp: Date;
        type: string;
        content: any;
    }>;
    /** Emotional trends over time */
    emotionalTrends: EmotionalTrendEntry[];
    /** Current emotional state */
    emotionalState: EmotionalState;
    /** History of discussed topics */
    topicHistory: string[];
    /** User preferences */
    userPreferences: Map<string, any>;
    /** Current phase of interaction */
    interactionPhase: 'introduction' | 'main' | 'conclusion';
}

/**
 * Emotional state
 */
export interface EmotionalState {
    /** Emotional valence (-1 to 1) */
    valence: number;
    /** Emotional arousal (-1 to 1) */
    arousal: number;
    /** Dominant emotion label */
    emotion?: string;
}

/**
 * Emotional trend entry
 */
export interface EmotionalTrendEntry {
    timestamp: Date;
    emotion: EmotionalState;
}

/**
 * Emotional context interface
 */
export interface EmotionalContext {
    /** Current emotional state */
    currentEmotion: EmotionalState;
    /** Emotional history */
    emotionalTrends: EmotionalTrendEntry[];
    /** Add a new emotional state */
    addEmotion(emotion: EmotionalState): void;
    /** Get emotional trend over time */
    getEmotionalTrend(timeRange: { start: Date; end: Date }): EmotionalTrendEntry[];
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
 * User instruction types for memory operations
 */
export interface UserInstruction {
    /** Command type for memory operations */
    command: 'remember' | 'save' | 'forget';
    /** Target of the command (e.g., memory ID or content) */
    target: string;
    /** Optional context information */
    context?: string;
    /** Additional metadata */
    metadata?: Map<string, any>;
}
