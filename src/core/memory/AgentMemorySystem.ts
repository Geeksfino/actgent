import { WorkingMemory } from './WorkingMemory';
import { EpisodicMemory } from './EpisodicMemory';
import { LongTermMemory } from './LongTermMemory';
import { MemoryContextManager } from './MemoryContextManager';
import { MemoryConsolidator } from './MemoryConsolidator';
import { MemoryAssociator } from './MemoryAssociator';
import { 
    IMemoryStorage, 
    IMemoryIndex, 
    IMemoryUnit, 
    MemoryType, 
    MemoryFilter 
} from './types';
import { BaseMemorySystem } from './BaseMemorySystem';

export class AgentMemorySystem {
    private workingMemory: WorkingMemory;
    private episodicMemory: EpisodicMemory;
    private longTermMemory: LongTermMemory;
    private contextManager: MemoryContextManager;
    private consolidator: MemoryConsolidator;
    private associator: MemoryAssociator;
    private consolidationTimer: NodeJS.Timer | null = null;

    constructor(
        storage: IMemoryStorage, 
        index: IMemoryIndex,
        consolidationInterval: number = 5 * 60 * 1000 // 5 minutes default
    ) {
        this.workingMemory = new WorkingMemory(storage, index);
        this.episodicMemory = new EpisodicMemory(storage, index);
        this.longTermMemory = new LongTermMemory(storage, index);
        this.contextManager = new MemoryContextManager(storage, index);
        this.consolidator = new MemoryConsolidator(storage, index);
        this.associator = new MemoryAssociator(storage, index);

        // Start consolidation timer
        this.consolidationTimer = setInterval(() => {
            this.consolidateWorkingMemory().catch(console.error);
        }, consolidationInterval);
    }

    // Working Memory Methods
    async storeWorkingMemory(content: any, metadata: Map<string, any>): Promise<void> {
        await this.workingMemory.store(content, metadata);
    }

    async retrieveWorkingMemories(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return this.workingMemory.retrieve(filter);
    }

    // Episodic Memory Methods
    async storeEpisodicMemory(content: any, metadata: Map<string, any>): Promise<void> {
        await this.episodicMemory.store(content, metadata);
    }

    async retrieveEpisodicMemories(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return this.episodicMemory.retrieve(filter);
    }

    // Long-term Memory Methods
    async storeLongTerm(content: any, metadata: Map<string, any>): Promise<void> {
        await this.longTermMemory.store(content, metadata);
    }

    async retrieveLongTerm(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return this.longTermMemory.retrieve(filter);
    }

    // Context Management Methods
    async setContext(key: string, value: any): Promise<void> {
        // Store in context manager
        await this.contextManager.setContext(key, value);

        // Store as contextual memory
        const metadata = new Map<string, any>([
            ['type', MemoryType.CONTEXTUAL],
            ['contextSnapshot', true],
            ['contextKey', key],
            ['timestamp', Date.now()]
        ]);

        await this.episodicMemory.store({ key, value }, metadata);

        // Update relevant working memories with new context
        const workingMemories = await this.workingMemory.retrieve({
            types: [MemoryType.WORKING],
            metadataFilters: [new Map<string, any>([['contextKey', key]])]
        });

        for (const memory of workingMemories) {
            const metadata = new Map(memory.metadata);
            metadata.set('context', value);
            await this.workingMemory.update({
                ...memory,
                metadata
            });
        }
    }

    async setContextBatch(context: Map<string, any>): Promise<void> {
        // Store each context value
        for (const [key, value] of context) {
            await this.setContext(key, value);
        }
    }

    async getContext(key: string): Promise<any> {
        return this.contextManager.getContext(key);
    }

    async getAllContext(): Promise<Map<string, any>> {
        const combinedContext = new Map<string, any>();
        
        // Get context from context manager (most recent values)
        const currentContext = await this.contextManager.getAllContext();
        for (const [key, value] of currentContext) {
            combinedContext.set(key, value);
        }
        
        // Get context from contextual memories
        const relevantMemories = await this.episodicMemory.retrieve({
            types: [MemoryType.CONTEXTUAL],
            metadataFilters: [
                new Map<string, any>([['contextSnapshot', true]])
            ]
        });

        // Add memory-derived context, but don't override current context
        for (const memory of relevantMemories) {
            const { key, value } = memory.content;
            if (!combinedContext.has(key)) {
                combinedContext.set(key, value);
            }
        }

        return combinedContext;
    }

    async loadContext(filter: MemoryFilter): Promise<void> {
        const memories = await this.episodicMemory.retrieve({
            ...filter,
            types: [MemoryType.EPISODIC],
            metadataFilters: [...(filter.metadataFilters || []), new Map<string, any>([['contextSnapshot', true]])]
        });

        // Load each memory's content as context
        for (const memory of memories) {
            const { key, value } = memory.content;
            if (key && value !== undefined) {
                await this.setContext(key, value);
            }
        }
    }

    // For backward compatibility
    async storeContextAsEpisodicMemory(context: Map<string, any>): Promise<void> {
        await this.setContextBatch(context);
    }

    async clearContext(): Promise<void> {
        // Clear context from context manager
        await this.contextManager.clearContext();
        
        // Clear context from episodic memories
        const contextMemories = await this.episodicMemory.retrieve({
            types: [MemoryType.EPISODIC],
            metadataFilters: [new Map<string, any>([['contextSnapshot', true]])]
        });

        for (const memory of contextMemories) {
            const memoryId = memory.id;
            if (memoryId) {
                await this.episodicMemory.delete(memoryId);
            }
        }
    }

    // Memory Consolidation
    async consolidateWorkingMemory(): Promise<void> {
        // Get working memories that need consolidation
        const workingMemories = await this.workingMemory.retrieve({
            types: [MemoryType.WORKING]
        });

        // Group memories by context
        const contextGroups = new Map<string, IMemoryUnit[]>();
        for (const memory of workingMemories) {
            const context = memory.metadata.get('context') || 'default';
            if (!contextGroups.has(context)) {
                contextGroups.set(context, []);
            }
            contextGroups.get(context)!.push(memory);
        }

        // Consolidate each group
        for (const [context, memories] of contextGroups) {
            if (memories.length === 0) continue;

            // Create consolidated memory
            const consolidatedContent = memories.map(m => m.content);
            const metadata = new Map<string, any>([
                ['type', MemoryType.EPISODIC],
                ['context', context],
                ['consolidatedFrom', memories.map(m => m.id)],
                ['timestamp', Date.now()]
            ]);

            // Store consolidated memory
            await this.episodicMemory.store(consolidatedContent, metadata);

            // Remove original memories
            for (const memory of memories) {
                const memoryId = memory.id;
                if (memoryId) {
                    await this.workingMemory.delete(memoryId);
                }
            }
        }
    }

    // Cleanup resources
    public stopAllCleanupTimers(): void {
        this.workingMemory.stopCleanupTimer();
        if (this.consolidationTimer) {
            clearInterval(this.consolidationTimer);
            this.consolidationTimer = null;
        }
    }

    // Alias for stopAllCleanupTimers for backward compatibility
    public stopAllTimers(): void {
        this.stopAllCleanupTimers();
    }

    // Getters
    getLongTermMemory(): LongTermMemory {
        return this.longTermMemory;
    }

    getWorkingMemory(): WorkingMemory {
        return this.workingMemory;
    }

    getContextManager(): MemoryContextManager {
        return this.contextManager;
    }

    getConsolidator(): MemoryConsolidator {
        return this.consolidator;
    }

    getAssociator(): MemoryAssociator {
        return this.associator;
    }
}
