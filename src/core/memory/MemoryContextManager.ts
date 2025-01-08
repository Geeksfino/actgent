import { WorkingMemory } from './WorkingMemory';
import { EpisodicMemory } from './EpisodicMemory';
import { LongTermMemory } from './LongTermMemory';
import { IMemoryStorage, IMemoryIndex, MemoryType, MemoryFilter, IMemoryUnit, IMemoryContextManager } from './types';
import crypto from 'crypto';

export class MemoryContextManager implements IMemoryContextManager {
    private storage: IMemoryStorage;
    private index: IMemoryIndex;
    private currentContext: Map<string, any>;
    private workingMemory: WorkingMemory;
    private episodicMemory: EpisodicMemory;
    private longTermMemory: LongTermMemory;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        this.storage = storage;
        this.index = index;
        this.currentContext = new Map();
        this.workingMemory = new WorkingMemory(storage, index);
        this.episodicMemory = new EpisodicMemory(storage, index);
        this.longTermMemory = new LongTermMemory(storage, index);
    }

    async setContext(key: string, value: any): Promise<void> {
        this.currentContext.set(key, value);
    }

    async getContext(key: string): Promise<any> {
        return this.currentContext.get(key);
    }

    async getAllContext(): Promise<Map<string, any>> {
        return new Map(this.currentContext);
    }

    async clearContext(): Promise<void> {
        this.currentContext.clear();
    }

    async loadContext(filter: MemoryFilter): Promise<void> {
        const memories = await this.storage.retrieveByFilter({
            ...filter,
            types: [MemoryType.CONTEXTUAL]
        });

        // Load context from all memories
        for (const memory of memories) {
            if (typeof memory.content === 'object') {
                for (const [key, value] of Object.entries(memory.content)) {
                    await this.setContext(key, value);
                }
            }
        }
    }

    async persistContext(): Promise<void> {
        // Store all current context in episodic memory
        await this.episodicMemory.store(
            Object.fromEntries(this.currentContext),
            new Map<string, any>([
                ['type', MemoryType.CONTEXTUAL],
                ['timestamp', new Date('2025-01-07T22:13:44+08:00').toISOString()]
            ])
        );
    }

    async storeContextAsEpisodicMemory(metadata: Map<string, any>): Promise<void> {
        // Create memory unit with current context
        const memory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: Object.fromEntries(this.currentContext),
            metadata: new Map([
                ...Array.from(metadata.entries()),
                ['type', MemoryType.CONTEXTUAL],
                ['timestamp', new Date('2025-01-07T22:13:44+08:00').toISOString()]
            ]),
            timestamp: new Date('2025-01-07T22:13:44+08:00'),
            accessCount: 0
        };

        // Store in long-term memory
        await this.storage.store(memory);
        await this.index.index(memory);
    }

    async getContextHistory(): Promise<IMemoryUnit[]> {
        const filter: MemoryFilter = {
            types: [MemoryType.CONTEXTUAL]
        };

        return this.storage.retrieveByFilter(filter);
    }

    cleanup(): void {
        this.workingMemory.stopCleanupTimer();
    }
}
