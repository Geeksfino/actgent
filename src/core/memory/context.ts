/**
 * Session context interface representing the agent's current state
 * during an interaction session.
 */
export interface WorkingMemoryContext {
    /** Type of context change */
    contextType: 'capacity_warning' | 'goal_completion' | 'emotional_peak' | 'context_change';
    /** Timestamp of the context change */
    timestamp: Date;
    /** Active goals for the current session */
    userGoals: Set<string>;
    /** Domain-specific context data */
    domainContext: Map<string, any>;
    /** Recent interaction history */
    interactionHistory: string[];
    /** Emotional state trends */
    emotionalTrends: EmotionalTrendEntry[];
    /** Current emotional state */
    emotionalState: EmotionalState;
    /** Topic history */
    topicHistory: string[];
    /** User preferences */
    userPreferences: Map<string, any>;
    /** Current phase of interaction */
    interactionPhase: 'introduction' | 'conversation' | 'task' | 'conclusion';
}

/**
 * Represents the emotional state of an agent
 */
export interface EmotionalState {
    /** Valence (positive/negative) from -1 to 1 */
    valence: number;
    /** Arousal (intensity) from 0 to 1 */
    arousal: number;
}

/**
 * Entry in the emotional trend history
 */
export interface EmotionalTrendEntry {
    timestamp: Date;
    emotion: EmotionalState;
}

/**
 * Manages emotional context and trends
 */
export interface EmotionalContext {
    /** Current emotional state */
    currentEmotion: EmotionalState;
    /** History of emotional states */
    emotionalTrends: EmotionalTrendEntry[];
    /** Add a new emotional state */
    addEmotion(emotion: EmotionalState): void;
    /** Get emotional trend data for a time range */
    getEmotionalTrend(timeRange: { start: Date; end: Date }): EmotionalTrendEntry[];
}
