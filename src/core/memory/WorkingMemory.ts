import { IMemoryUnit, MemoryFilter, MemoryType } from './types';
import { BaseMemorySystem } from './BaseMemorySystem';
import { IMemoryStorage, IMemoryIndex } from './types';

export class WorkingMemory extends BaseMemorySystem {
    protected readonly MAX_WORKING_MEMORY_SIZE = 100;
    protected readonly DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
    protected readonly expirationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.startCleanupTimer();
    }

    /**
     * Store content in working memory
     */
    public async store(content: any, metadata: any = {}): Promise<void> {
        const memoryId = crypto.randomUUID();
        const metadataMap = metadata instanceof Map ? metadata : new Map(Object.entries(metadata || {}));
        metadataMap.set('id', memoryId);
        metadataMap.set('type', MemoryType.WORKING);

        // Store the memory
        const memory: IMemoryUnit = {
            id: memoryId,
            content,
            metadata: metadataMap,
            timestamp: new Date()
        };

        // Check if already expired - if so, just skip storing
        const expiresAt = metadataMap.get('expiresAt');
        if (expiresAt && Date.now() > expiresAt) {
            return;
        }

        // Store in working memory
        await this.storage.store(memory);

        // Check capacity after storing
        await this.ensureCapacity();

        // Set expiration timer
        if (expiresAt) {
            const timeout = setTimeout(async () => {
                const currentMemory = await this.storage.retrieve(memoryId);
                if (currentMemory) {
                    await this.storage.delete(memoryId);
                }
                this.expirationTimers.delete(memoryId);
            }, expiresAt - Date.now());
            this.expirationTimers.set(memoryId, timeout);
        }
    }

    /**
     * Retrieve memories by filter or id
     */
    public async retrieve(idOrFilter: string | MemoryFilter): Promise<IMemoryUnit[]> {
        // Handle string ID case
        if (typeof idOrFilter === 'string') {
            const memory = await this.storage.retrieve(idOrFilter);
            if (!memory || memory.metadata.get('type') !== MemoryType.WORKING) {
                return [];
            }

            const expiresAt = memory.metadata.get('expiresAt');
            const now = Date.now();
            if (typeof expiresAt === 'number' && now > expiresAt) {
                await this.moveToEpisodicMemory(memory);
                return [];
            }

            return [memory];
        }

        // Handle filter case
        const filter = idOrFilter || {};
        const memories = await this.storage.retrieveByFilter({
            ...filter,
            types: [MemoryType.WORKING]
        });

        const now = Date.now();
        const validMemories: IMemoryUnit[] = [];

        for (const memory of memories) {
            const expiresAt = memory.metadata.get('expiresAt');
            if (typeof expiresAt === 'number' && now > expiresAt) {
                await this.moveToEpisodicMemory(memory);
                continue;
            }
            validMemories.push(memory);
        }

        return validMemories;
    }

    /**
     * Move a single memory to episodic storage immediately
     * Used for immediate transitions (expiration, capacity)
     */
    private async moveToEpisodicMemory(memory: IMemoryUnit): Promise<void> {
        const episodicMetadata = new Map(memory.metadata);
        episodicMetadata.set('type', MemoryType.EPISODIC);
        episodicMetadata.delete('expiresAt');  // Episodic memories don't expire
        episodicMetadata.set('originalType', MemoryType.WORKING);
        episodicMetadata.set('consolidationTime', Date.now());
        episodicMetadata.set('transitionType', 'immediate');

        const episodicMemory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: memory.content,
            metadata: episodicMetadata,
            timestamp: new Date()
        };

        await this.storage.store(episodicMemory);
        await this.index.index(episodicMemory);
        await this.storage.delete(memory.id);
    }

    /**
     * Consolidate multiple memories to episodic storage in batch
     * Used for context changes and periodic cleanup
     */
    public async consolidateToEpisodic(): Promise<void> {
        const memories = await this.storage.retrieveByFilter({
            types: [MemoryType.WORKING]
        });

        // Group memories by context
        const contextGroups = new Map<string, IMemoryUnit[]>();
        for (const memory of memories) {
            const context = memory.metadata.get('context') || 'default';
            if (!contextGroups.has(context)) {
                contextGroups.set(context, []);
            }
            contextGroups.get(context)!.push(memory);
        }

        // Process each context group
        for (const [context, groupMemories] of contextGroups) {
            // Create consolidated episodic memory for the group
            const consolidatedMetadata = new Map<string, any>();
            consolidatedMetadata.set('type', MemoryType.EPISODIC);
            consolidatedMetadata.set('context', context);
            consolidatedMetadata.set('originalType', MemoryType.WORKING);
            consolidatedMetadata.set('consolidationTime', Date.now());
            consolidatedMetadata.set('transitionType', 'batch');
            consolidatedMetadata.set('originalIds', groupMemories.map(m => m.id));

            const consolidatedMemory: IMemoryUnit = {
                id: crypto.randomUUID(),
                content: {
                    memories: groupMemories.map(m => m.content),
                    context
                },
                metadata: consolidatedMetadata,
                timestamp: new Date()
            };

            // Store consolidated memory and cleanup originals
            await this.storage.store(consolidatedMemory);
            await this.index.index(consolidatedMemory);
            await Promise.all(groupMemories.map(m => this.storage.delete(m.id)));
        }
    }

    /**
     * Update a memory unit
     */
    public async update(memory: IMemoryUnit): Promise<void> {
        await this.storage.update(memory);
        await this.updateExpirationTimer(memory);
    }

    /**
     * Delete a memory unit
     */
    public async delete(id: string): Promise<void> {
        await this.storage.delete(id);
        this.clearExpirationTimer(id);
    }

    /**
     * Update memory unit
     */
    public async updateMemory(memory: IMemoryUnit): Promise<void> {
        await this.update(memory);
    }

    /**
     * Delete memory unit
     */
    public async deleteMemory(id: string): Promise<void> {
        await this.delete(id);
    }

    /**
     * Update expiration timer for a memory
     */
    private async updateExpirationTimer(memory: IMemoryUnit): Promise<void> {
        const memoryId = memory.id;
        
        // Clear existing timer if any
        const existingTimer = this.expirationTimers.get(memoryId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new timer
        const expirationTime = memory.metadata.get('expiresAt');
        if (expirationTime) {
            const timer = setTimeout(async () => {
                const currentMemory = await this.storage.retrieve(memoryId);
                if (currentMemory) {
                    await this.storage.delete(memoryId);
                }
                this.expirationTimers.delete(memoryId);
            }, expirationTime - Date.now());

            this.expirationTimers.set(memoryId, timer);
        }
    }

    /**
     * Clear expiration timer for a memory unit
     */
    private clearExpirationTimer(id: string): void {
        const timer = this.expirationTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.expirationTimers.delete(id);
        }
    }

    /**
     * Check if memory needs consolidation
     */
    public isConsolidationNeeded(memory: IMemoryUnit): boolean {
        const accessCount = memory.accessCount || 0;
        const lastAccessed = memory.lastAccessed?.getTime() || 0;
        const now = Date.now();

        // Consolidate if:
        // 1. Accessed frequently (more than 2 times)
        // 2. Not accessed recently (more than 1 hour)
        return accessCount >= 2 && (now - lastAccessed) > 60 * 60 * 1000;
    }

    /**
     * Get memories that need consolidation
     */
    public async getConsolidationCandidates(): Promise<IMemoryUnit[]> {
        const memories = await this.retrieve({});
        return memories.filter(memory => this.isConsolidationNeeded(memory));
    }

    /**
     * Cleanup expired memories
     */
    public async cleanupExpiredMemories(): Promise<void> {
        const memories = await this.retrieve({});
        const now = Date.now();

        await Promise.all(memories.map(async memory => {
            const expiresAt = memory.metadata.get('expiresAt');
            if (expiresAt && now > expiresAt) {
                await this.storage.delete(memory.id);
            }
        }));
    }

    /**
     * Cleanup expired memories
     */
    public async cleanup(): Promise<void> {
        const memories = await this.retrieve({});
        const now = Date.now();

        await Promise.all(memories.map(async memory => {
            const expiresAt = memory.metadata.get('expiresAt');
            if (expiresAt && now > expiresAt) {
                await this.storage.delete(memory.id);
            }
        }));
    }

    /**
     * Stop cleanup and clear timers
     */
    public override stopCleanupTimer(): void {
        super.stopCleanupTimer();
        
        // Clear all expiration timers
        for (const timer of this.expirationTimers.values()) {
            clearTimeout(timer);
        }
        this.expirationTimers.clear();
    }

    /**
     * Ensure working memory capacity
     */
    private async ensureCapacity(): Promise<void> {
        const memories = await this.storage.retrieveByFilter({
            types: [MemoryType.WORKING]
        });

        if (memories.length > this.MAX_WORKING_MEMORY_SIZE) {
            // Move oldest or least relevant memories to episodic
            const memoriesToMove = memories
                .sort((a, b) => {
                    const aRelevance = a.metadata.get('relevance') || 0;
                    const bRelevance = b.metadata.get('relevance') || 0;
                    if (aRelevance === bRelevance) {
                        return (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0);
                    }
                    return aRelevance - bRelevance;
                })
                .slice(0, memories.length - this.MAX_WORKING_MEMORY_SIZE);

            await Promise.all(memoriesToMove.map(memory => 
                this.moveToEpisodicMemory(memory)
            ));
        }
    }
}
