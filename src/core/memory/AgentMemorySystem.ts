import { 
    IMemoryUnit, 
    IMemoryStorage, 
    IMemoryIndex,
    MemoryEvent,
    MemoryEventType,
    MemoryFilter,
    SessionMemoryContext,
    EmotionalState
} from './types';
import { SessionMemoryContextManager } from './SessionMemoryContextManager';
import { WorkingMemory } from './WorkingMemory';
import { EpisodicMemory } from './EpisodicMemory';
import { ProceduralMemory } from './ProceduralMemory';
import { MemoryTransitionManager } from './MemoryTransitionManager';
import { Subject, interval, Observable } from 'rxjs';
import { map, filter, distinctUntilChanged } from 'rxjs/operators';

/**
 * Main entry point for the agent's memory system.
 * Provides a simple interface for agents to store and retrieve memories,
 * while handling the complexity of memory management internally.
 */
export class AgentMemorySystem {
    private readonly contextChanges$ = new Subject<SessionMemoryContext>();

    private workingMemory: WorkingMemory;
    private episodicMemory: EpisodicMemory;
    private proceduralMemory: ProceduralMemory;
    private transitionManager: MemoryTransitionManager;
    private contextManager: SessionMemoryContextManager;

    constructor(
        storage: IMemoryStorage,
        index: IMemoryIndex
    ) {
        this.workingMemory = new WorkingMemory(storage, index);
        this.episodicMemory = new EpisodicMemory(storage, index);
        this.proceduralMemory = new ProceduralMemory(storage, index);
        this.transitionManager = new MemoryTransitionManager(
            this.workingMemory,
            this.episodicMemory
        );
        this.contextManager = new SessionMemoryContextManager(storage, index);

        this.setupEventHandlers();

        // Load initial context from working memory
        this.contextManager.loadContextFromWorkingMemory().catch(console.error);
    }

    private setupEventHandlers(): void {
        // Monitor working memory size
        interval(1000).pipe(
            map(() => ({
                size: this.workingMemory.getCurrentSize(),
                capacity: this.workingMemory.getCapacity()
            })),
            filter(({ size, capacity }) => size > capacity * 0.8),
            distinctUntilChanged()
        ).subscribe(() => this.handleCapacityWarning());

        // Monitor context changes
        this.contextManager.getContextChanges().subscribe(context => {
            this.handleContextChange(context);
        });
    }

    /**
     * Handle memory access
     */
    private handleMemoryAccess(memoryId: string): void {
        this.transitionManager.onMemoryAccess(memoryId);
    }

    /**
     * Handle capacity warning
     */
    private handleCapacityWarning(): void {
        const context: SessionMemoryContext = {
            contextType: 'capacity_warning',
            timestamp: new Date(),
            userGoals: new Set(),
            domainContext: new Map(),
            interactionHistory: [],
            emotionalTrends: [],
            emotionalState: { valence: 0, arousal: 0 },
            topicHistory: [],
            userPreferences: new Map(),
            interactionPhase: 'main'
        };
        this.transitionManager.onContextChange(context);
    }

    /**
     * Handle context change
     */
    private handleContextChange(context: SessionMemoryContext): void {
        this.transitionManager.onContextChange(context);
    }

    /**
     * Handle emotional peak
     */
    private handleEmotionalPeak(emotion: EmotionalState): void {
        this.transitionManager.onEmotionalChange(emotion);
    }

    /**
     * Handle goal completion
     */
    private handleGoalCompletion(goalId: string): void {
        this.transitionManager.emitEvent({
            type: MemoryEventType.GOAL_COMPLETED,
            memory: null,
            metadata: new Map([['goalId', goalId]]),
            timestamp: new Date()
        });
    }

    private isEmotionalPeak(prevEmotion: EmotionalState, currentEmotion: EmotionalState): boolean {
        const THRESHOLD = 0.5;
        return Math.abs(currentEmotion.valence - prevEmotion.valence) > THRESHOLD ||
               Math.abs(currentEmotion.arousal - prevEmotion.arousal) > THRESHOLD;
    }

    private async updateEmotionalState(prevState: EmotionalState, currentState: EmotionalState): Promise<void> {
        if (this.isEmotionalPeak(prevState, currentState)) {
            this.handleEmotionalPeak(currentState);
        }
    }

    /**
     * Store a new memory unit
     */
    public async store(memory: IMemoryUnit): Promise<void> {
        await this.workingMemory.store(memory.content, memory.metadata);
        
        // Check capacity after storing
        if (this.workingMemory.getCurrentSize() >= this.workingMemory.getCapacity() * 0.8) {
            this.handleCapacityWarning();
        }
    }

    /**
     * Remember something. The memory system will automatically determine
     * where and how to store it based on its characteristics.
     */
    public async remember(content: any, metadata: Map<string, any> = new Map()): Promise<void> {
        const memoryType = metadata?.get('type') || 'episodic';
        
        // Store in working memory
        await this.store({ 
            content, 
            metadata,
            id: crypto.randomUUID(),
            timestamp: new Date(),
            memoryType
        });
        
        // Update context based on content type
        if (memoryType === 'contextual') {
            const key = metadata.get('contextKey');
            const value = content;
            if (key) {
                await this.contextManager.setContext(key, value);
            }
        }
    }

    /**
     * Update agent's session context with new information
     */
    public async updateContext(key: string, value: any): Promise<void> {
        await this.contextManager.setContext(key, value);
    }

    /**
     * Get current context information
     */
    public async getContext(key: string): Promise<any> {
        return this.contextManager.getContext(key);
    }

    /**
     * Get complete current session context state
     */
    public getCurrentContext(): SessionMemoryContext {
        return this.contextManager.getCurrentContext();
    }

    /**
     * Register a listener for session context changes
     */
    public onContextChange(listener: (context: SessionMemoryContext) => void): void {
        this.contextManager.onContextChange(listener);
    }

    /**
     * Recall memories based on a query. The memory system will search
     * across all relevant memory stores.
     */
    public async recall(query: string | MemoryFilter): Promise<IMemoryUnit[]> {
        const filter: MemoryFilter = typeof query === 'string' 
            ? { query }  // Use query field for string searches
            : query;     // Use provided filter directly

        // Search across all memory types
        const memories = await Promise.all([
            this.workingMemory.retrieve({}), // Retrieve all from working memory
            this.episodicMemory.retrieve(filter),
            this.proceduralMemory.retrieve(filter)
        ]);

        // Get all memories
        const allMemories = memories.flat();

        // If we have a specific memory ID, also get related memories
        if (filter.ids && filter.ids.length === 1) {
            const relatedMemories = await this.findRelatedMemories(filter.ids[0]);
            allMemories.push(...relatedMemories);
        }

        // Remove duplicates and sort by relevance/recency
        const uniqueMemories = Array.from(new Set(allMemories));
        return this.rankMemories(uniqueMemories, this.contextManager.getCurrentContext());
    }

    /**
     * Rank memories by their relevance, recency, and contextual alignment
     */
    private rankMemories(memories: IMemoryUnit[], context: SessionMemoryContext): IMemoryUnit[] {
        return memories.sort((a, b) => {
            // Get relevance scores (default to 0 if not set)
            const relevanceA = a.metadata.get('relevance') as number || 0;
            const relevanceB = b.metadata.get('relevance') as number || 0;

            // Get timestamps (default to 0 if not set)
            const timeA = a.metadata.get('timestamp') as number || 0;
            const timeB = b.metadata.get('timestamp') as number || 0;

            // Calculate contextual alignment
            const contextScoreA = this.calculateContextualAlignment(a, context);
            const contextScoreB = this.calculateContextualAlignment(b, context);

            // Combine relevance, recency, and context (weighted)
            const scoreA = (relevanceA * 0.4) + (timeA * 0.3) + (contextScoreA * 0.3);
            const scoreB = (relevanceB * 0.4) + (timeB * 0.3) + (contextScoreB * 0.3);

            return scoreB - scoreA;  // Sort in descending order
        });
    }

    /**
     * Calculate how well a memory aligns with current context
     */
    private calculateContextualAlignment(memory: IMemoryUnit, context: SessionMemoryContext): number {
        let score = 0;
        const memoryContext = memory.metadata.get('context') as SessionMemoryContext | undefined;
        
        if (!memoryContext) return 0;

        // Check topic alignment
        const memoryTopics = memoryContext.topicHistory || [];
        const commonTopics = memoryTopics.filter((topic: string) => context.topicHistory.includes(topic));
        if (commonTopics.length > 0) {
            score += 0.3 * (commonTopics.length / Math.max(memoryTopics.length, context.topicHistory.length));
        }

        // Check goal alignment
        const memoryGoals = memoryContext.userGoals || new Set<string>();
        const commonGoals = Array.from(memoryGoals).filter((goal: string) => context.userGoals.has(goal));
        if (commonGoals.length > 0) {
            score += 0.4 * (commonGoals.length / Math.max(memoryGoals.size, context.userGoals.size));
        }

        // Check emotional alignment
        const memoryEmotion = memoryContext.emotionalState;
        const currentEmotion = context.emotionalState;
        if (memoryEmotion && currentEmotion) {
            const valenceDiff = Math.abs(memoryEmotion.valence - currentEmotion.valence);
            const arousalDiff = Math.abs(memoryEmotion.arousal - currentEmotion.arousal);
            score += 0.3 * (1 - ((valenceDiff + arousalDiff) / 4)); // Normalize to 0-1
        }

        return score;
    }

    /**
     * Associate two memories together
     */
    public async associate(memoryId1: string, memoryId2: string): Promise<void> {
        // TO DO: implement associate logic
    }

    /**
     * Remove association between two memories
     */
    public async dissociate(memoryId1: string, memoryId2: string): Promise<void> {
        // TO DO: implement dissociate logic
    }

    /**
     * Find memories related to a given memory
     */
    public async findRelatedMemories(memoryId: string, maxResults: number = 10): Promise<IMemoryUnit[]> {
        // TO DO: implement findRelatedMemories logic
        return [];
    }

    /**
     * Forget a specific memory or set of memories
     */
    public async forget(idOrFilter: string | MemoryFilter): Promise<void> {
        const filter: MemoryFilter = typeof idOrFilter === 'string'
            ? { ids: [idOrFilter] }
            : idOrFilter;

        // For each memory ID, remove from all memory stores
        const ids = filter.ids || [];
        await Promise.all(ids.map(async id => {
            await Promise.all([
                this.workingMemory.delete(id),
                this.episodicMemory.delete(id),
                this.proceduralMemory.delete(id)
            ]);
        }));
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
    }
}
