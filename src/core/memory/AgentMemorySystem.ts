import { WorkingMemory } from './WorkingMemory';
import { EpisodicMemory } from './EpisodicMemory';
import { LongTermMemory } from './LongTermMemory';
import { MemoryContextManager } from './MemoryContextManager';
import { MemoryAssociator } from './MemoryAssociator';
import { MemoryTransitionManager } from './MemoryTransitionManager';
import { 
    IMemoryStorage, 
    IMemoryIndex, 
    IMemoryUnit, 
    MemoryType, 
    MemoryFilter 
} from './types';
import { BaseMemorySystem } from './BaseMemorySystem';
import * as crypto from 'crypto';

export class AgentMemorySystem extends BaseMemorySystem {
    protected workingMemory: WorkingMemory;
    protected episodicMemory: EpisodicMemory;
    protected longTermMemory: LongTermMemory;
    protected contextManager: MemoryContextManager;
    protected transitionManager: MemoryTransitionManager;
    protected associator: MemoryAssociator;
    private transitionTimer: NodeJS.Timer | null = null;

    constructor(
        storage: IMemoryStorage, 
        index: IMemoryIndex,
        transitionInterval: number = 5 * 60 * 1000 // 5 minutes default
    ) {
        super(storage, index);
        this.workingMemory = new WorkingMemory(storage, index);
        this.episodicMemory = new EpisodicMemory(storage, index);
        this.longTermMemory = new LongTermMemory(storage, index);
        this.contextManager = new MemoryContextManager(storage, index);
        this.associator = new MemoryAssociator(storage, index);
        
        // Initialize transition manager
        this.transitionManager = new MemoryTransitionManager(
            this.workingMemory,
            this.episodicMemory,
            this.longTermMemory
        );

        // Start transition timer
        this.transitionTimer = setInterval(() => {
            this.transitionManager.checkAndTransition().catch(console.error);
        }, transitionInterval);
    }

    // Memory access methods
    public getWorkingMemory(): WorkingMemory {
        return this.workingMemory;
    }

    public getEpisodicMemory(): EpisodicMemory {
        return this.episodicMemory;
    }

    public getLongTermMemory(): LongTermMemory {
        return this.longTermMemory;
    }

    public getTransitionManager(): MemoryTransitionManager {
        return this.transitionManager;
    }

    public getContextManager(): MemoryContextManager {
        return this.contextManager;
    }

    public getAssociator(): MemoryAssociator {
        return this.associator;
    }

    // Memory operations
    public async storeWorkingMemory(content: string, metadata?: Map<string, any>): Promise<IMemoryUnit> {
        const memoryId = crypto.randomUUID();
        const metadataMap = metadata || new Map<string, any>();
        metadataMap.set('id', memoryId);
        metadataMap.set('type', MemoryType.WORKING);

        const memory: IMemoryUnit = {
            id: memoryId,
            content,
            metadata: metadataMap,
            timestamp: new Date()
        };

        await this.workingMemory.store(content, metadataMap);
        return memory;
    }

    public async updateWorkingMemory(memory: IMemoryUnit): Promise<void> {
        await this.workingMemory.update(memory);
    }

    public async retrieveWorkingMemories(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return this.workingMemory.retrieve(filter);
    }

    // Episodic Memory Methods
    public async storeEpisodicMemory(content: string, metadata?: Map<string, any>): Promise<IMemoryUnit> {
        const memoryId = crypto.randomUUID();
        const metadataMap = metadata || new Map<string, any>();
        metadataMap.set('id', memoryId);
        metadataMap.set('type', MemoryType.EPISODIC);

        const memory: IMemoryUnit = {
            id: memoryId,
            content,
            metadata: metadataMap,
            timestamp: new Date()
        };

        await this.episodicMemory.store(content, metadataMap);
        return memory;
    }

    public async retrieveEpisodicMemories(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return this.episodicMemory.retrieve(filter);
    }

    // Long-term Memory Methods
    public async storeLongTerm(content: string, metadata?: Map<string, any>): Promise<IMemoryUnit> {
        const memoryId = crypto.randomUUID();
        const metadataMap = metadata || new Map<string, any>();
        metadataMap.set('id', memoryId);
        metadataMap.set('type', MemoryType.LONG_TERM);

        const memory: IMemoryUnit = {
            id: memoryId,
            content,
            metadata: metadataMap,
            timestamp: new Date()
        };

        await this.longTermMemory.store(content, metadataMap);
        return memory;
    }

    public async retrieveLongTerm(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return this.longTermMemory.retrieve(filter);
    }

    // Context Management Methods
    public async setContext(key: string, value: any): Promise<void> {
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

    public async setContextBatch(context: Map<string, any>): Promise<void> {
        // Store each context value
        for (const [key, value] of context) {
            await this.setContext(key, value);
        }
    }

    public async getContext(key: string): Promise<any> {
        return this.contextManager.getContext(key);
    }

    public async getAllContext(): Promise<Map<string, any>> {
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

    public async loadContext(filter: MemoryFilter): Promise<void> {
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
    public async storeContextAsEpisodicMemory(context: Map<string, any>): Promise<void> {
        await this.setContextBatch(context);
    }

    public async clearContext(): Promise<void> {
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
                await this.delete(memoryId);
            }
        }
    }

    // Cleanup resources
    public stopAllCleanupTimers(): void {
        if (this.transitionTimer) {
            clearInterval(this.transitionTimer);
            this.transitionTimer = null;
        }
        this.workingMemory.stopCleanupTimer();
    }

    // Alias for stopAllCleanupTimers for backward compatibility
    public stopAllTimers(): void {
        this.stopAllCleanupTimers();
    }

    public async store(content: any, metadata?: Map<string, any>): Promise<void> {
        // Store in working memory by default
        await this.workingMemory.store(content, metadata);
    }

    public async retrieve(idOrFilter: string | MemoryFilter): Promise<IMemoryUnit[]> {
        if (typeof idOrFilter === 'string') {
            const memory = await this.storage.retrieve(idOrFilter);
            return memory ? [memory] : [];
        }

        // Search across all memory types by default
        return this.storage.retrieveByFilter(idOrFilter);
    }

    protected async cleanup(): Promise<void> {
        // Use public methods or create new public methods for cleanup
        await Promise.all([
            this.workingMemory.performCleanup(),  // New public method
            this.episodicMemory.performCleanup(), // New public method
            this.longTermMemory.performCleanup()  // New public method
        ]);
    }

    async deleteMemory(id: string): Promise<void> {
        const memory = await this.storage.retrieve(id);
        if (!memory) {
            throw new Error(`Memory with id ${id} not found`);
        }

        await this.delete(id);
        
        // Remove from working memory if present
        await this.workingMemory.delete(id);
        
        // Update associations
        if (memory.associations) {
            for (const associatedId of memory.associations) {
                const associatedMemory = await this.storage.retrieve(associatedId);
                if (associatedMemory && associatedMemory.associations) {
                    associatedMemory.associations = associatedMemory.associations.filter(aid => aid !== id);
                    await this.storage.update(associatedMemory);
                }
            }
        }
    }

    private async processMemoryUnit(memory: IMemoryUnit): Promise<void> {
        await this.workingMemory.store(memory.content, memory.metadata);
        await this.transitionManager.checkAndTransition(memory);
    }

    public async checkAndTransition(memory?: IMemoryUnit): Promise<void> {
        if (memory) {
            await this.transitionManager.checkAndTransition(memory);
        }
    }
}
