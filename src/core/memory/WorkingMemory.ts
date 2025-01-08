import { BaseMemorySystem } from './BaseMemorySystem';
import { IMemoryUnit, MemoryFilter, IMemoryStorage, IMemoryIndex, buildQueryFromFilter, MemoryType } from './types';
import { LongTermMemory } from './LongTermMemory'; // Import LongTermMemory

export class WorkingMemory extends BaseMemorySystem {
    private timeToLive: number;
    private cleanupInterval: number;
    private cleanupTimer: NodeJS.Timer | null = null;
    private ephemeralTimeToLive: number;

    constructor(
        storage: IMemoryStorage, 
        index: IMemoryIndex, 
        timeToLive: number = 300000, // 5 minutes in milliseconds
        cleanupInterval: number = 60000, // 1 minute in milliseconds
        ephemeralTimeToLive: number = 30000 // 30 seconds in milliseconds
    ) {
        super(storage, index);
        this.timeToLive = timeToLive;
        this.cleanupInterval = cleanupInterval;
        this.ephemeralTimeToLive = ephemeralTimeToLive;
        this.startCleanupTimer();
    }

    async store(content: any, metadata: Map<string, any>): Promise<void> {
        const memory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content,
            metadata,
            timestamp: new Date(),
            accessCount: 0
        };

        await this.storage.store(memory);
        await this.index.index(memory);

        // Set up expiry if specified
        const expiresAt = metadata.get('expiresAt');
        if (expiresAt) {
            const timeout = expiresAt - Date.now();
            if (timeout > 0) {
                setTimeout(async () => {
                    // Move to long-term memory
                    const longTermMemory: IMemoryUnit = {
                        ...memory,
                        id: `lt_${memory.id}`,
                        metadata: new Map([
                            ...Array.from(memory.metadata.entries()),
                            ['type', MemoryType.EPISODIC],
                            ['originalId', memory.id],
                            ['movedFromWorking', true]
                        ])
                    };

                    await this.storage.store(longTermMemory);
                    await this.index.index(longTermMemory);
                    await this.storage.delete(memory.id);
                }, timeout);
            }
        }
    }

    async storeEphemeral(content: any, metadata?: Map<string, any>): Promise<void> {
        const mergedMetadata = new Map<string, any>(metadata || []);
        mergedMetadata.set('ephemeral', true);
        await this.store(content, mergedMetadata);
    }

    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const memories = await this.storage.retrieveByFilter({
            ...filter,
            types: [MemoryType.WORKING]
        });

        // Filter out expired memories
        const now = new Date('2025-01-07T22:13:44+08:00').getTime();
        return memories.filter(memory => {
            const expiresAt = memory.metadata.get('expiresAt');
            return !expiresAt || expiresAt > now;
        });
    }

    async update(memory: IMemoryUnit): Promise<void> {
        if (!memory.metadata.has('type')) {
            memory.metadata.set('type', MemoryType.WORKING);
        }
        await this.storage.update(memory);
        await this.index.update(memory);
    }

    async consolidate(): Promise<void> {
        const now = new Date('2025-01-07T22:13:44+08:00').getTime();
        const memories = await this.storage.retrieveByFilter({
            types: [MemoryType.WORKING]
        });

        for (const memory of memories) {
            const expiresAt = memory.metadata.get('expiresAt');
            if (expiresAt && expiresAt <= now) {
                // Create a new long-term memory
                const longTermMemory: IMemoryUnit = {
                    ...memory,
                    id: `lt_${memory.id}`,
                    metadata: new Map([
                        ...Array.from(memory.metadata.entries()),
                        ['type', MemoryType.EPISODIC],
                        ['originalId', memory.id],
                        ['movedFromWorking', true]
                    ])
                };

                // Store in long-term memory and remove from working memory
                await this.storage.store(longTermMemory);
                await this.index.index(longTermMemory);
                await this.storage.delete(memory.id);
            }
        }
    }

    private async checkForConsolidation(memory: IMemoryUnit): Promise<void> {
        const accessThreshold = 5;
        const expiresAt = memory.metadata.get('expiresAt') as number;

        if ((memory.accessCount || 0) >= accessThreshold || Date.now() >= expiresAt) {
            await this.moveToLongTermMemory(memory);
        }
    }

    private async moveToLongTermMemory(memory: IMemoryUnit): Promise<void> {
        // Create a copy of the memory for long-term storage
        const longTermMemory = {
            ...memory,
            metadata: new Map(memory.metadata)
        };
        
        // Update the memory type to EPISODIC for long-term storage
        longTermMemory.metadata.set('type', MemoryType.EPISODIC);
        
        // Store in long-term memory
        const ltm = new LongTermMemory(this.storage, this.index);
        await ltm.store(longTermMemory.content, longTermMemory.metadata);

        // Remove from working memory
        await this.storage.delete(memory.id);
    }

    private isExpired(memory: IMemoryUnit): boolean {
        const expiresAt = memory.metadata.get('expiresAt') as number;
        return Date.now() > expiresAt;
    }

    private async cleanup(): Promise<void> {
        // Get all working memories directly from storage
        const memories = await this.storage.retrieveByFilter({
            types: [MemoryType.WORKING]
        });

        for (const memory of memories) {
            if (this.isExpired(memory)) {
                await this.moveToLongTermMemory(memory);
            }
        }
    }

    private startCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.cleanupTimer = setInterval(() => {
            this.cleanup().catch(console.error);
        }, this.cleanupInterval);
    }

    public stopCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
}
