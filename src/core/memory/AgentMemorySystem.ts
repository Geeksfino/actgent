import { LongTermMemory } from './LongTermMemory';
import { WorkingMemory } from './WorkingMemory';
import { MemoryContextManager } from './MemoryContextManager';
import { MemoryConsolidator } from './MemoryConsolidator';
import { MemoryAssociator } from './MemoryAssociator';
import { IMemoryUnit, MemoryFilter, IMemoryStorage, IMemoryIndex, MemoryType } from './types';

export class AgentMemorySystem {
    private longTermMemory: LongTermMemory;
    private workingMemory: WorkingMemory;
    private contextManager: MemoryContextManager;
    private consolidator: MemoryConsolidator;
    private associator: MemoryAssociator;
    private storage: IMemoryStorage;
    private consolidationTimer: NodeJS.Timer | null = null;
    private consolidationInterval: number;

    constructor(
        storage: IMemoryStorage, 
        index: IMemoryIndex,
        consolidationInterval: number = 5 * 60 * 1000 // 5 minutes
    ) {
        this.storage = storage;
        this.longTermMemory = new LongTermMemory(storage, index);
        this.workingMemory = new WorkingMemory(storage, index);
        this.contextManager = new MemoryContextManager(storage, index);
        this.consolidator = new MemoryConsolidator(storage, index);
        this.associator = new MemoryAssociator(storage, index);
        this.consolidationInterval = consolidationInterval;
        this.startConsolidationTimer();
    }

    async storeLongTerm(content: any, metadata?: Map<string, any>): Promise<void> {
        const mergedMetadata = new Map<string, any>(metadata || []);
        await this.longTermMemory.store(content, mergedMetadata);
        // If this is a contextual memory, update the context
        if (mergedMetadata.get('type') === MemoryType.CONTEXTUAL) {
            const contextKey = mergedMetadata.get('contextKey');
            if (typeof contextKey === 'string' && content[contextKey] !== undefined) {
                await this.contextManager.setContext(contextKey, content[contextKey]);
            }
        }
    }

    async storeWorkingMemory(content: any, metadata?: Map<string, any>): Promise<void> {
        const mergedMetadata = new Map<string, any>(metadata || []);
        await this.workingMemory.store(content, mergedMetadata);
        // If this is a contextual memory, update the context
        if (mergedMetadata.get('type') === MemoryType.CONTEXTUAL) {
            const contextKey = mergedMetadata.get('contextKey');
            if (typeof contextKey === 'string' && content[contextKey] !== undefined) {
                await this.contextManager.setContext(contextKey, content[contextKey]);
            }
        }
        await this.consolidator.updateWorkingMemorySize(1);
        // Check if consolidation is needed after storing
        await this.checkConsolidation();
    }

    async storeEphemeral(content: any, metadata?: Map<string, any>): Promise<void> {
        const mergedMetadata = new Map<string, any>(metadata || []);
        mergedMetadata.set('type', MemoryType.WORKING);
        mergedMetadata.set('ephemeral', true);
        await this.store(content, mergedMetadata);
    }

    async store(content: any, metadata: Map<string, any>): Promise<void> {
        const memoryType = metadata.get('type') as MemoryType;
        
        // Create a new metadata map to avoid modifying the input
        const updatedMetadata = new Map<string, any>(metadata);

        // Only add context if not already present in metadata
        const context = await this.contextManager.getAllContext();
        for (const [key, value] of context) {
            if (!updatedMetadata.has(key)) {
                updatedMetadata.set(key, value);
            }
        }
        
        switch (memoryType) {
            case MemoryType.WORKING:
                await this.workingMemory.store(content, updatedMetadata);
                break;
            case MemoryType.EPISODIC:
            case MemoryType.SEMANTIC:
            case MemoryType.CONTEXTUAL:
                await this.longTermMemory.store(content, updatedMetadata);
                break;
            default:
                throw new Error(`Invalid memory type: ${memoryType}`);
        }
    }

    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const memories = await this.storage.retrieveByFilter(filter);
        
        // Update access count for each memory
        await Promise.all(memories.map(async memory => {
            memory.accessCount = (memory.accessCount || 0) + 1;
            memory.lastAccessed = new Date();
            await this.storage.update(memory);
        }));

        return memories;
    }

    // Context Management
    setContext(key: string, value: any): void {
        this.contextManager.setContext(key, value);
        // Increment context switch count for working memories
        this.updateContextSwitchCount().catch(console.error);
    }

    getContext(key: string): any {
        return this.contextManager.getContext(key);
    }

    clearContext(): void {
        this.contextManager.clearContext();
    }

    async loadContext(filter: any = {}): Promise<void> {
        await this.contextManager.loadContext(filter);
    }

    async getAllContext(): Promise<Map<string, any>> {
        return this.contextManager.getAllContext();
    }

    async persistContext(): Promise<void> {
        await this.contextManager.persistContext();
    }

    async storeContextAsEpisodicMemory(context: Map<string, any>): Promise<void> {
        await this.contextManager.storeContextAsEpisodicMemory(context);
    }

    // Memory Association
    async associateMemories(sourceId: string, targetId: string): Promise<void> {
        await this.associator.associate(sourceId, targetId);
    }

    async dissociateMemories(sourceId: string, targetId: string): Promise<void> {
        await this.associator.dissociate(sourceId, targetId);
    }

    async getAssociatedMemories(id: string): Promise<IMemoryUnit[]> {
        return this.associator.findRelatedMemories(id);
    }

    // Memory Consolidation
    private startConsolidationTimer(): void {
        if (this.consolidationTimer) {
            clearInterval(this.consolidationTimer);
        }
        this.consolidationTimer = setInterval(() => {
            this.checkConsolidation().catch(console.error);
        }, this.consolidationInterval);
    }

    private async checkConsolidation(): Promise<void> {
        const workingMemories = await this.workingMemory.retrieve({
            types: [MemoryType.WORKING]
        });

        for (const memory of workingMemories) {
            if (memory.accessCount && memory.accessCount > 5) {
                await this.consolidateMemory(memory);
            }
        }
    }

    private async consolidateMemory(memory: IMemoryUnit): Promise<void> {
        try {
            await this.consolidator.consolidate(memory);
        } catch (error) {
            console.error(`Failed to consolidate memory ${memory.id}:`, error);
        }
    }

    private async updateContextSwitchCount(): Promise<void> {
        const workingMemories = await this.workingMemory.retrieve({
            types: [MemoryType.WORKING]
        });

        for (const memory of workingMemories) {
            const switchCount = (memory.metadata.get('contextSwitches') || 0) + 1;
            memory.metadata.set('contextSwitches', switchCount);
            await this.workingMemory.update(memory);
            // Check if consolidation is needed after context switch
            await this.checkConsolidation();
        }
    }

    // Cleanup resources
    cleanup(): void {
        this.workingMemory.stopCleanupTimer();
        this.contextManager.cleanup();
        if (this.consolidationTimer) {
            clearInterval(this.consolidationTimer);
            this.consolidationTimer = null;
        }
    }

    stopAllTimers(): void {
        if (this.consolidationTimer) {
            clearInterval(this.consolidationTimer);
            this.consolidationTimer = null;
        }
        this.workingMemory.stopCleanupTimer();
    }

    // Getters for accessing individual memory systems
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
