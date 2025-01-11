import { 
    IMemoryStorage, 
    IMemoryIndex, 
    IMemoryUnit, 
    MemoryType,
    MemoryFilter 
} from './types';
import { MemoryRegistry } from './MemoryRegistry';
import { MemoryContextManager } from './MemoryContextManager';
import { MemoryAssociator } from './MemoryAssociator';
import { MemoryTransitionManager } from './MemoryTransitionManager';

/**
 * Main entry point for the agent's memory system.
 * Provides a simple interface for agents to store and retrieve memories,
 * while handling the complexity of memory management internally.
 */
export class AgentMemorySystem {
    private registry: MemoryRegistry;
    private contextManager: MemoryContextManager;
    private associator: MemoryAssociator;
    private transitionManager: MemoryTransitionManager;
    private transitionTimer: NodeJS.Timer | null = null;

    constructor(
        storage: IMemoryStorage,
        index: IMemoryIndex,
        transitionInterval: number = 5 * 60 * 1000 // 5 minutes default
    ) {
        this.registry = MemoryRegistry.initialize(storage, index);
        this.contextManager = new MemoryContextManager(storage, index);
        this.associator = new MemoryAssociator(storage, index);
        
        // Initialize transition manager
        this.transitionManager = new MemoryTransitionManager(
            this.registry.getWorkingMemory(),
            this.registry.getEpisodicMemory()
        );

        // Start automatic memory management
        this.startMemoryManagement(transitionInterval);
    }

    /**
     * Remember something. The memory system will automatically determine
     * where and how to store it based on its characteristics.
     */
    public async remember(content: any, metadata?: Map<string, any>): Promise<void> {
        // Store initially in working memory
        await this.registry.getWorkingMemory().store(content, metadata);
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
        return this.rankMemories(uniqueMemories);
    }

    /**
     * Rank memories by their relevance and recency
     */
    private rankMemories(memories: IMemoryUnit[]): IMemoryUnit[] {
        return memories.sort((a, b) => {
            // Get relevance scores (default to 0 if not set)
            const relevanceA = a.metadata.get('relevance') as number || 0;
            const relevanceB = b.metadata.get('relevance') as number || 0;

            // Get timestamps (default to 0 if not set)
            const timeA = a.metadata.get('timestamp') as number || 0;
            const timeB = b.metadata.get('timestamp') as number || 0;

            // Combine relevance and recency (weighted)
            const scoreA = (relevanceA * 0.7) + (timeA * 0.3);
            const scoreB = (relevanceB * 0.7) + (timeB * 0.3);

            return scoreB - scoreA;  // Sort in descending order
        });
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
}
