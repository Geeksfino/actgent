import { 
    IMemoryUnit, 
    IMemoryStorage, 
    IMemoryIndex,
    SessionMemoryContext,
    EmotionalState,
    EmotionalContext,
    EmotionalTrendEntry,
    MemoryType,
    MemoryFilter,
    IMemoryContextManager,
    ConsolidationMetrics,
    EmotionalContextImpl
} from './types';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { Subject, Observable } from 'rxjs';

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
export class SessionMemoryContextManager extends EventEmitter implements IMemoryContextManager {
    private storage: IMemoryStorage;
    private index: IMemoryIndex;
    private contextCache: Map<string, { value: any, timestamp: number }>;
    private currentContext: SessionMemoryContext;
    private contextChanges$ = new Subject<SessionMemoryContext>();
    private emotionalContext: EmotionalContext;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super();
        this.storage = storage;
        this.index = index;
        this.contextCache = new Map();

        const initialEmotionalState: EmotionalState = {
            valence: 0,
            arousal: 0
        };

        this.emotionalContext = {
            currentEmotion: initialEmotionalState,
            emotionalTrends: [],
            addEmotion(emotion: EmotionalState) {
                this.emotionalTrends.push({
                    timestamp: new Date(),
                    emotion
                });
                this.currentEmotion = emotion;
            },
            getEmotionalTrend(timeRange: { start: Date; end: Date }): EmotionalTrendEntry[] {
                return this.emotionalTrends.filter(
                    (entry: EmotionalTrendEntry) => entry.timestamp >= timeRange.start && entry.timestamp <= timeRange.end
                );
            }
        };

        this.currentContext = {
            contextType: 'context_change',
            timestamp: new Date(),
            userGoals: new Set<string>(),
            domainContext: new Map<string, any>(),
            interactionHistory: [],
            emotionalTrends: [],
            emotionalState: initialEmotionalState,
            topicHistory: [],
            userPreferences: new Map<string, any>(),
            interactionPhase: 'introduction'
        };
    }

    public getContextChanges(): Observable<SessionMemoryContext> {
        return this.contextChanges$.asObservable();
    }

    public getCurrentContext(): SessionMemoryContext {
        return { ...this.currentContext };
    }

    async setContext(key: string, value: any): Promise<void> {
        // Update appropriate context field based on key
        switch (key) {
            case 'goal':
                this.currentContext.userGoals.add(value);
                break;
            case 'domain':
                this.currentContext.domainContext.set(value.key, value.value);
                break;
            case 'interaction':
                this.currentContext.interactionHistory.push(value);
                if (this.currentContext.interactionHistory.length > 10) {
                    this.currentContext.interactionHistory.shift();
                }
                break;
            case 'emotion':
                this.updateEmotionalState(value);
                break;
            case 'topic':
                this.currentContext.topicHistory.push(value);
                if (this.currentContext.topicHistory.length > 10) {
                    this.currentContext.topicHistory.shift();
                }
                break;
            case 'preference':
                this.currentContext.userPreferences.set(value.key, value.value);
                break;
            case 'phase':
                this.currentContext.interactionPhase = value;
                break;
        }

        this.emitContextChange('context_change');

        // Store in working memory for short-term recall
        const memory = await this.createContextMemory(key, value);

        await this.storage.store(memory);
    }

    private async createContextMemory(key: string, value: any): Promise<IMemoryUnit> {
        return {
            id: crypto.randomUUID(),
            content: { key, value },
            metadata: new Map([['type', 'context']]),
            timestamp: new Date(),
            memoryType: MemoryType.CONTEXTUAL,
            accessCount: 0,
            lastAccessed: new Date()
        };
    }

    async getContext(key: string): Promise<any> {
        switch (key) {
            case 'goals':
                return Array.from(this.currentContext.userGoals);
            case 'domain':
                return new Map(this.currentContext.domainContext);
            case 'interactions':
                return [...this.currentContext.interactionHistory];
            case 'emotions':
                return this.emotionalContext.getEmotionalTrend({ start: new Date(0), end: new Date() });
            case 'topics':
                return [...this.currentContext.topicHistory];
            case 'preferences':
                return new Map(this.currentContext.userPreferences);
            case 'phase':
                return this.currentContext.interactionPhase;
            case 'all':
                return { ...this.currentContext };
            default:
                return null;
        }
    }

    async clearContext(): Promise<void> {
        this.currentContext = {
            contextType: 'context_change',
            timestamp: new Date(),
            userGoals: new Set<string>(),
            domainContext: new Map<string, any>(),
            interactionHistory: [],
            emotionalTrends: [],
            emotionalState: this.emotionalContext.currentEmotion,
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

        this.emitContextChange('context_change');
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

    private emitContextChange(type: SessionMemoryContext['contextType']): void {
        this.currentContext = {
            ...this.currentContext,
            contextType: type,
            timestamp: new Date()
        };
        this.contextChanges$.next(this.currentContext);
        this.emit('context_change', this.currentContext);
    }

    public onContextChange(handler: (context: SessionMemoryContext) => void): void {
        this.on('context_change', handler);
    }

    public onEmotionalPeak(handler: (emotion: EmotionalState) => void): void {
        this.on('emotional_peak', handler);
    }

    public onGoalCompletion(handler: (goalId: string) => void): void {
        this.on('goal_completed', handler);
    }

    private isSignificantContextChange(prev: SessionMemoryContext, curr: SessionMemoryContext): boolean {
        // Implement context change detection logic
        return false; // Placeholder
    }

    private isEmotionalPeak(prev: EmotionalState, curr: EmotionalState): boolean {
        // Implement emotional peak detection logic
        return false; // Placeholder
    }

    public updateEmotionalState(emotion: EmotionalState): void {
        this.emotionalContext.addEmotion(emotion);
        this.currentContext.emotionalState = emotion;
        this.currentContext.emotionalTrends = this.emotionalContext.emotionalTrends;
        this.emitContextChange('emotional_peak');
    }
}
