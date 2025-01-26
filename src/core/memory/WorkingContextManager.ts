import { 
    WorkingMemoryContext,
    EmotionalState,
    EmotionalContext,
    EmotionalTrendEntry,
} from './context';
import { Subject, Observable } from 'rxjs';
import { WorkingMemory } from './modules/working/WorkingMemory';

/**
 * Manages the active working context of an agent.
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
export class WorkingContextManager {
    private contextCache: Map<string, { value: any, timestamp: number }>;
    private currentContext: WorkingMemoryContext;
    private contextChanges$ = new Subject<WorkingMemoryContext>();
    private emotionalContext: EmotionalContext;
    private workingMemory: WorkingMemory;

    constructor(workingMemory: WorkingMemory) {
        this.workingMemory = workingMemory;
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

    public getContextChanges(): Observable<WorkingMemoryContext> {
        return this.contextChanges$.asObservable();
    }

    public getCurrentContext(): WorkingMemoryContext {
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
                if (typeof value === 'object' && 'valence' in value && 'arousal' in value) {
                    this.emotionalContext.addEmotion(value);
                    this.currentContext.emotionalState = value;
                    this.currentContext.emotionalTrends = this.emotionalContext.emotionalTrends;
                }
                break;
            case 'topic':
                this.currentContext.topicHistory.push(value);
                break;
            case 'preference':
                this.currentContext.userPreferences.set(value.key, value.value);
                break;
            case 'phase':
                this.currentContext.interactionPhase = value;
                break;
            default:
                throw new Error(`Unknown context key: ${key}`);
        }

        // Store updated context in working memory
        const now = new Date();
        const contextDomain = this.currentContext && 'domain' in this.currentContext ? this.currentContext.domain : 'general';
        await this.workingMemory.store({
            id: crypto.randomUUID(),
            content: this.currentContext,
            metadata: new Map([
                ['type', 'working_context'],
                ['domain', contextDomain]
            ]),
            timestamp: now,
            createdAt: now,
            validAt: now
        });

        // Emit context change event
        this.contextChanges$.next(this.currentContext);
    }

    public onContextChange(listener: (context: WorkingMemoryContext) => void): void {
        this.contextChanges$.subscribe(listener);
    }

    /**
     * Set a context value with timestamp
     */
    public async setContextWithTimestamp(key: string, value: { content: any, timestamp: Date }): Promise<void> {
        this.contextCache.set(key, { value: value.content, timestamp: value.timestamp.getTime() });
        this.updateCurrentContext();
        this.contextChanges$.next(this.currentContext);
    }

    /**
     * Update the current context based on cache
     */
    private updateCurrentContext(): void {
        // Update context based on cache values
        // This will vary based on your context structure
        this.currentContext = {
            ...this.currentContext,
            timestamp: new Date(),
            // Add other context updates as needed
        };
    }

    /**
     * Initialize context manager
     */
    public initialize(): void {
        this.contextCache = new Map();
        
        // Initialize with default values
        const defaultEmotionalState: EmotionalState = {
            valence: 0,  // Neutral valence
            arousal: 0   // Low arousal
        };

        this.currentContext = {
            contextType: 'context_change',
            timestamp: new Date(),
            userGoals: new Set<string>(),
            domainContext: new Map<string, any>(),
            interactionHistory: [],
            emotionalTrends: [],
            emotionalState: defaultEmotionalState,
            topicHistory: [],
            userPreferences: new Map<string, any>(),
            interactionPhase: 'introduction'
        };

        // Create emotional context with required methods
        this.emotionalContext = {
            currentEmotion: defaultEmotionalState,
            emotionalTrends: [],
            addEmotion: (emotion: EmotionalState) => {
                this.emotionalContext.currentEmotion = emotion;
                this.emotionalContext.emotionalTrends.push({
                    timestamp: new Date(),
                    emotion: emotion
                });
            },
            getEmotionalTrend: (timeRange: { start: Date; end: Date }) => {
                return this.emotionalContext.emotionalTrends.filter(entry => 
                    entry.timestamp >= timeRange.start && entry.timestamp <= timeRange.end
                );
            }
        };
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.contextCache.clear();
        this.contextChanges$.complete();
    }
}
