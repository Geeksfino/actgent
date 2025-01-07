import { LongTermMemory } from './LongTermMemory';
import { WorkingMemory } from './WorkingMemory';
import { ContextManager } from './ContextManager';
import { MemoryConsolidator } from './MemoryConsolidator';
import { MemoryAssociator } from './MemoryAssociator';
import { IMemoryUnit, MemoryFilter, IMemoryStorage, IMemoryIndex, MemoryType } from './types';

export class AgentMemorySystem {
    private longTermMemory: LongTermMemory;
    private workingMemory: WorkingMemory;
    private contextManager: ContextManager;
    private consolidator: MemoryConsolidator;
    private associator: MemoryAssociator;
    private consolidationTimer: NodeJS.Timer | null = null;
    private consolidationInterval: number;

    constructor(
        storage: IMemoryStorage, 
        index: IMemoryIndex,
        consolidationInterval: number = 5 * 60 * 1000 // 5 minutes
    ) {
        this.longTermMemory = new LongTermMemory(storage, index);
        this.workingMemory = new WorkingMemory(storage, index);
        this.contextManager = new ContextManager(storage, index);
        this.consolidator = new MemoryConsolidator(storage, index);
        this.associator = new MemoryAssociator(storage, index);
        this.consolidationInterval = consolidationInterval;
        this.startConsolidationTimer();
    }

    async storeLongTerm(content: any, metadata?: Map<string, any>): Promise<void> {
        await this.longTermMemory.store(content, metadata);
    }

    async storeWorkingMemory(content: any, metadata?: Map<string, any>): Promise<void> {
        await this.workingMemory.store(content, metadata);
        await this.consolidator.updateWorkingMemorySize(1);
        // Check if consolidation is needed after storing
        await this.checkConsolidation();
    }

    async retrieveMemories(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const [longTermResults, workingResults] = await Promise.all([
            this.longTermMemory.retrieve(filter),
            this.workingMemory.retrieve(filter)
        ]);

        return [...longTermResults, ...workingResults];
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

    async loadContext(): Promise<void> {
        await this.contextManager.loadContext();
    }

    getAllContext(): Map<string, any> {
        return this.contextManager.getAllContext();
    }

    async persistContext(): Promise<void> {
        await this.contextManager.persistContext();
    }

    async storeContextAsEpisodicMemory(metadata?: Map<string, any>): Promise<void> {
        await this.contextManager.storeContextAsEpisodicMemory(metadata);
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
        const candidates = await this.consolidator.getConsolidationCandidates();
        for (const memory of candidates) {
            try {
                await this.consolidator.consolidate(memory);
            } catch (error) {
                console.error(`Failed to consolidate memory ${memory.id}:`, error);
            }
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

    // Getters for accessing individual memory systems
    getLongTermMemory(): LongTermMemory {
        return this.longTermMemory;
    }

    getWorkingMemory(): WorkingMemory {
        return this.workingMemory;
    }

    getContextManager(): ContextManager {
        return this.contextManager;
    }

    getConsolidator(): MemoryConsolidator {
        return this.consolidator;
    }

    getAssociator(): MemoryAssociator {
        return this.associator;
    }
}
