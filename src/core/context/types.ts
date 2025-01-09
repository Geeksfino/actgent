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
    metadata?: {
        environment?: any;
        domain?: string;
        goals?: string[];
        flow?: InteractionFlowType;
        references?: string[];
        [key: string]: any;
    };
}

/**
 * Types of interaction flows in a conversation
 */
export enum InteractionFlowType {
    QUESTION = 'question',
    ANSWER = 'answer',
    CLARIFICATION = 'clarification',
    CORRECTION = 'correction',
    INSTRUCTION = 'instruction',
    FEEDBACK = 'feedback'
}

/**
 * Represents a user goal
 */
export interface UserGoal {
    id: string;
    description: string;
    priority: number;
    status: 'active' | 'completed' | 'paused';
    createdAt: Date;
    updatedAt: Date;
    parentGoalId?: string;  // For hierarchical goals
    metadata?: {
        domain?: string;
        deadline?: Date;
        progress?: number;
        [key: string]: any;
    };
}

/**
 * Represents domain-specific context
 */
export interface DomainContext {
    domain: string;
    subDomain?: string;
    confidence: number;
    rules: Map<string, any>;
    priority: number;
    activeSince: Date;
    metadata?: {
        parentDomain?: string;
        requiredGoals?: string[];
        [key: string]: any;
    };
}

/**
 * Represents a flow of interaction in conversation
 */
export interface InteractionFlow {
    messageId: string;
    references: string[];  // IDs of referenced messages
    flow: InteractionFlowType;
    domain?: string;
    goals?: string[];  // IDs of related goals
    confidence: number;
    metadata?: {
        sentiment?: string;
        urgency?: number;
        [key: string]: any;
    };
}

/**
 * Metrics for context optimization decisions
 */
export interface ContextMetrics {
    tokenCount: number;
    messageCount: number;
    averageRelevance: number;
    oldestMessageAge: number;
    activeGoalsCount: number;
    domainSwitchFrequency: number;
}

/**
 * Interface for history management
 */
export interface IHistoryManager {
    addMessage(message: ConversationMessage): void;
    getContext(): Promise<string>;
    optimize(): Promise<void>;
    addInteractionFlow(flow: InteractionFlow): void;
    resolveReferences(messageId: string): Promise<ConversationMessage[]>;
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
