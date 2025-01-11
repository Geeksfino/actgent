import { 
    IMemoryStorage, 
    IMemoryIndex, 
    IMemoryUnit, 
    MemoryType,
    MemoryFilter,
    SessionMemoryContext
} from './types';
import { MemoryRegistry } from './MemoryRegistry';
import { SessionMemoryContextManager } from './SessionMemoryContextManager';
import { MemoryAssociator } from './MemoryAssociator';
import { MemoryTransitionManager } from './MemoryTransitionManager';

/**
 * Main entry point for the agent's memory system.
 * Provides a simple interface for agents to store and retrieve memories,
 * while handling the complexity of memory management internally.
 */
export class AgentMemorySystem {
    private registry: MemoryRegistry;
    private sessionContext: SessionMemoryContextManager;
    private associator: MemoryAssociator;
    private transitionManager: MemoryTransitionManager;
    private transitionTimer: NodeJS.Timer | null = null;

    constructor(
        storage: IMemoryStorage,
        index: IMemoryIndex,
        transitionInterval: number = 5 * 60 * 1000 // 5 minutes default
    ) {
        this.registry = MemoryRegistry.initialize(storage, index);
        this.sessionContext = new SessionMemoryContextManager(storage, index);
        this.associator = new MemoryAssociator(storage, index);
        
        // Initialize transition manager
        this.transitionManager = new MemoryTransitionManager(
            this.registry.getWorkingMemory(),
            this.registry.getEpisodicMemory()
        );

        // Load initial context from working memory
        this.sessionContext.loadContextFromWorkingMemory().catch(console.error);

        // Add context change listener for transitions
        this.sessionContext.onContextChange((context) => {
            // Notify transition manager of context changes
            this.transitionManager.checkAndTransition().catch(console.error);
        });

        // Start automatic memory management
        this.startMemoryManagement(transitionInterval);
    }

    /**
     * Remember something. The memory system will automatically determine
     * where and how to store it based on its characteristics.
     */
    public async remember(content: any, metadata?: Map<string, any>): Promise<void> {
        // Store in working memory
        await this.registry.getWorkingMemory().store(content, metadata);
        
        // Update context based on content type
        if (metadata?.get('type') === MemoryType.CONTEXTUAL) {
            const key = metadata.get('key');
            const value = content.value;
            if (key) {
                await this.sessionContext.setContext(key, value);
            }
        }
    }

    /**
     * Update agent's session context with new information
     */
    public async updateContext(key: string, value: any): Promise<void> {
        await this.sessionContext.setContext(key, value);
    }

    /**
     * Get current context information
     */
    public async getContext(key: string): Promise<any> {
        return this.sessionContext.getContext(key);
    }

    /**
     * Get complete current session context state
     */
    public getCurrentContext(): SessionMemoryContext {
        return this.sessionContext.getCurrentContext();
    }

    /**
     * Register a listener for session context changes
     */
    public onContextChange(listener: (context: SessionMemoryContext) => void): void {
        this.sessionContext.onContextChange(listener);
    }

    /**
     * Recall memories based on a query. The memory system will search
     * across all relevant memory stores.
     */
    public async recall(query: string | MemoryFilter): Promise<IMemoryUnit[]> {
        const filter: MemoryFilter = typeof query === 'string' 
            ? { query }  // Use query field for string searches
            : query;     // Use provided filter directly

        // Add current context to filter
        const context = this.sessionContext.getCurrentContext();
        filter.metadataFilters = filter.metadataFilters || [];
        filter.metadataFilters.push(new Map([
            ['context', context]
        ]));

        // Search across all memory types
        const memories = await Promise.all([
            this.registry.getWorkingMemory().retrieve(filter),
            this.registry.getEpisodicMemory().retrieve(filter),
            this.registry.getSemanticMemory().retrieve(filter),
            this.registry.getProceduralMemory().retrieve(filter)
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
        return this.rankMemories(uniqueMemories, context);
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
        const memoryEmotion = memoryContext.emotionalState?.getCurrentEmotion();
        const currentEmotion = context.emotionalState?.getCurrentEmotion();
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
        await this.associator.associate(memoryId1, memoryId2);
    }

    /**
     * Remove association between two memories
     */
    public async dissociate(memoryId1: string, memoryId2: string): Promise<void> {
        await this.associator.dissociate(memoryId1, memoryId2);
    }

    /**
     * Find memories related to a given memory
     */
    public async findRelatedMemories(memoryId: string, maxResults: number = 10): Promise<IMemoryUnit[]> {
        return this.associator.findRelatedMemories(memoryId, maxResults);
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
                this.registry.getWorkingMemory().delete(id),
                this.registry.getEpisodicMemory().delete(id),
                this.registry.getSemanticMemory().delete(id),
                this.registry.getProceduralMemory().delete(id)
            ]);
        }));
    }

    private startMemoryManagement(interval: number): void {
        this.transitionTimer = setInterval(() => {
            // Periodically check for memories that need to be moved or consolidated
            Promise.all([
                this.transitionManager.checkAndTransition(),
            ]).catch(console.error);
        }, interval);
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        if (this.transitionTimer) {
            clearInterval(this.transitionTimer);
            this.transitionTimer = null;
        }
    }
}
