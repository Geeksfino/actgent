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
        await this.workingMemory.store({
            id: 'current_context',
            content: this.currentContext,
            metadata: new Map([['type', 'context']]),
            timestamp: new Date()
        });

        // Emit context change event
        this.contextChanges$.next(this.currentContext);
    }

    public onContextChange(listener: (context: WorkingMemoryContext) => void): void {
        this.contextChanges$.subscribe(listener);
    }
}
