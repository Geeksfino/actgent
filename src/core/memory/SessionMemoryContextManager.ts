import { 
    IMemoryStorage, 
    IMemoryIndex, 
    MemoryType, 
    MemoryFilter, 
    IMemoryUnit, 
    IMemoryContextManager,
    ConsolidationMetrics,
    SessionMemoryContext,
    EmotionalState,
    EmotionalContextImpl
} from './types';
import crypto from 'crypto';

/**
 * Manages the active session context of an agent.
 * This component is responsible for maintaining the agent's current state during a session,
 * including:
 * - Current conversation state and history
 * - Active goals and tasks for the session
 * - Temporary preferences and settings
 * - Emotional state and trends
 * - Topic history and interaction phase
 * 
 * The context is primarily stored in WorkingMemory and is designed to be temporary,
 * lasting only for the duration of a session. When a session ends, the context can
 * be cleared and only relevant information will be persisted to long-term memory
 * through the AgentMemorySystem.
 */
export class SessionMemoryContextManager implements IMemoryContextManager {
    private storage: IMemoryStorage;
    private index: IMemoryIndex;
    private contextCache: Map<string, { value: any, timestamp: number }>;
    private listeners: ((context: SessionMemoryContext) => void)[];

    private context: SessionMemoryContext = {
        userGoals: new Set<string>(),
        domainContext: new Map<string, any>(),
        interactionHistory: [],
        emotionalTrends: [],
        emotionalState: new EmotionalContextImpl(),
        topicHistory: [],
        userPreferences: new Map(),
        interactionPhase: 'introduction'
    };

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        this.storage = storage;
        this.index = index;
        this.contextCache = new Map();
        this.listeners = [];
    }

    async setContext(key: string, value: any): Promise<void> {
        // Update appropriate context field based on key
        switch (key) {
            case 'goal':
                this.context.userGoals.add(value);
                break;
            case 'domain':
                this.context.domainContext.set(value.key, value.value);
                break;
            case 'interaction':
                this.context.interactionHistory.push(value);
                if (this.context.interactionHistory.length > 10) {
                    this.context.interactionHistory.shift();
                }
                break;
            case 'emotion':
                const emotion = value as EmotionalState;
                this.context.emotionalState.addEmotion(emotion);
                this.context.emotionalTrends.push(emotion);
                if (this.context.emotionalTrends.length > 10) {
                    this.context.emotionalTrends.shift();
                }
                break;
            case 'topic':
                this.context.topicHistory.push(value);
                if (this.context.topicHistory.length > 10) {
                    this.context.topicHistory.shift();
                }
                break;
            case 'preference':
                this.context.userPreferences.set(value.key, value.value);
                break;
            case 'phase':
                this.context.interactionPhase = value;
                break;
        }

        // Store in working memory for short-term recall
        const metadata = new Map<string, any>([
            ['type', MemoryType.CONTEXTUAL],
            ['key', key],
            ['timestamp', Date.now()]
        ]);

        const consolidationMetrics: ConsolidationMetrics = {
            semanticSimilarity: 0,
            contextualOverlap: 0,
            temporalProximity: 0,
            sourceReliability: 0,
            confidenceScore: 0,
            accessCount: 0,
            lastAccessed: new Date(),
            createdAt: new Date(),
            importance: 1.0,
            relevance: 1.0
        };

        const memory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: { key, value },
            metadata,
            timestamp: new Date(),
            priority: 1.0,
            consolidationMetrics,
            associations: new Set<string>()
        };

        await this.storage.store(memory);

        // Notify listeners
        this.notifyContextChange();
    }

    async getContext(key: string): Promise<any> {
        switch (key) {
            case 'goals':
                return Array.from(this.context.userGoals);
            case 'domain':
                return new Map(this.context.domainContext);
            case 'interactions':
                return [...this.context.interactionHistory];
            case 'emotions':
                return this.context.emotionalState.getEmotionalTrend();
            case 'topics':
                return [...this.context.topicHistory];
            case 'preferences':
                return new Map(this.context.userPreferences);
            case 'phase':
                return this.context.interactionPhase;
            case 'all':
                return { ...this.context };
            default:
                return null;
        }
    }

    async clearContext(): Promise<void> {
        this.context = {
            userGoals: new Set<string>(),
            domainContext: new Map<string, any>(),
            interactionHistory: [],
            emotionalTrends: [],
            emotionalState: new EmotionalContextImpl(),
            topicHistory: [],
            userPreferences: new Map(),
            interactionPhase: 'introduction'
        };

        // Clear working memory context
        const contextMemories = await this.storage.retrieveByFilter({
            types: [MemoryType.CONTEXTUAL]
        });

        for (const memory of contextMemories) {
            await this.storage.delete(memory.id);
        }

        this.notifyContextChange();
    }

    async loadContextFromWorkingMemory(): Promise<void> {
        const memories = await this.storage.retrieveByFilter({
            types: [MemoryType.CONTEXTUAL]
        });

        // Group memories by key and get most recent for each
        for (const memory of memories) {
            const key = memory.metadata.get('key');
            const value = memory.content.value;
            
            if (key) {
                await this.setContext(key, value);
            }
        }
    }

    onContextChange(listener: (context: SessionMemoryContext) => void): void {
        this.listeners.push(listener);
    }

    private notifyContextChange(): void {
        const contextSnapshot = { ...this.context };
        for (const listener of this.listeners) {
            try {
                listener(contextSnapshot);
            } catch (error) {
                console.error('Error in context change listener:', error);
            }
        }
    }

    getCurrentContext(): SessionMemoryContext {
        return { ...this.context };
    }
}
