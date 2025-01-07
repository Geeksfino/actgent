import { BaseMemorySystem } from './BaseMemorySystem';
import { IMemoryUnit, MemoryFilter, IMemoryStorage, IMemoryIndex, buildQueryFromFilter, MemoryType } from './types';

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

    async store(content: any, metadata?: Map<string, any>, isEphemeral: boolean = false): Promise<void> {
        const defaultMetadata = new Map<string, any>([
            ['type', MemoryType.WORKING],
            ['expiresAt', Date.now() + (isEphemeral ? this.ephemeralTimeToLive : this.timeToLive)]
        ]);

        const mergedMetadata = new Map<string, any>([
            ...Array.from(defaultMetadata.entries()),
            ...(metadata ? Array.from(metadata.entries()) : [])
        ]);
        
        const memory: IMemoryUnit = {
            id: this.generateId(),
            timestamp: new Date(),
            content,
            metadata: mergedMetadata
        };

        await this.storage.store(memory);
        await this.index.index(memory);
        this.cache.set(memory.id, memory);
    }

    async storeEphemeral(content: any, metadata?: Map<string, any>): Promise<void> {
        await this.store(content, metadata, true);
    }

    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        await this.cleanup();

        // Add working memory type if not specified
        const workingFilter: MemoryFilter = {
            ...filter,
            types: [...(filter.types || []), MemoryType.WORKING],
            metadataFilters: [
                ...(filter.metadataFilters || []),
                new Map<string, any>([['type', MemoryType.WORKING]])
            ]
        };

        const query = buildQueryFromFilter(workingFilter);
        const ids = await this.index.search(query);
        const memories: IMemoryUnit[] = [];

        for (const id of ids) {
            const cached = this.cache.get(id);
            if (cached) {
                if (this.isExpired(cached)) {
                    await this.storage.delete(id);
                    this.cache.get(id);
                    continue;
                }
                memories.push(cached);
                continue;
            }

            const memory = await this.storage.retrieve(id);
            if (memory && !this.isExpired(memory)) {
                this.cache.set(id, memory);
                memories.push(memory);
            }
        }

        return memories;
    }

    async update(memory: IMemoryUnit): Promise<void> {
        memory.lastAccessed = new Date();
        memory.accessCount = (memory.accessCount || 0) + 1;
        await this.storage.update(memory);
        await this.index.index(memory);
    }

    private isExpired(memory: IMemoryUnit): boolean {
        const expiresAt = memory.metadata.get('expiresAt') as number;
        return Date.now() > expiresAt;
    }

    private async cleanup(): Promise<void> {
        const filter: MemoryFilter = {
            types: [MemoryType.WORKING],
            metadataFilters: [new Map<string, any>([['type', MemoryType.WORKING]])]
        };

        const memories = await this.retrieve(filter);
        for (const memory of memories) {
            if (this.isExpired(memory)) {
                await this.storage.delete(memory.id);
                this.cache.get(memory.id);
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
