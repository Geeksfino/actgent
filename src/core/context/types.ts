/**
 * Represents a message in a conversation
 */
export interface ConversationMessage {
    id: string;
    content: string;
    role: string;
    timestamp: Date;
    relevanceScore: number;
    importance: number;
    tokens: number;
}

/**
 * Metrics for context optimization decisions
 */
export interface ContextMetrics {
    tokenCount: number;
    messageCount: number;
    averageRelevance: number;
    oldestMessageAge: number;
}

/**
 * Interface for history management
 */
export interface IHistoryManager {
    addMessage(message: ConversationMessage): void;
    getContext(): Promise<string>;
    optimize(): Promise<void>;
}

/**
 * Interface for context optimization strategies
 */
export interface IContextOptimizer {
    shouldOptimize(context: ContextMetrics): boolean;
    optimize(messages: ConversationMessage[]): Promise<ConversationMessage[]>;
}

/**
 * Interface for context metrics measurement
 */
export interface IContextMetric {
    measure(messages: ConversationMessage[]): number;
    threshold: number;
}
