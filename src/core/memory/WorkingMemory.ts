import { IMemoryUnit, MemoryFilter, MemoryType } from './types';
import { BaseMemorySystem } from './BaseMemorySystem';
import { IMemoryStorage, IMemoryIndex } from './types';
import { logger } from '../Logger';

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
            logger.debug('Memory already expired, skipping store: %o', memory);
            return;
        }

        // Store in working memory
        await this.storage.store(memory);
        await this.index.index(memory);
        logger.debug('Stored memory: %o', memory);

        // Check capacity after storing
        await this.ensureCapacity();

        // Set expiration timer
        if (expiresAt) {
            const timeout = setTimeout(async () => {
                const currentMemory = await this.storage.retrieve(memoryId);
                if (currentMemory) {
                    await this.moveToEpisodicMemory(currentMemory);
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
                logger.debug('Memory not found or not working memory: %s', idOrFilter);
                return [];
            }

            const expiresAt = memory.metadata.get('expiresAt');
            const now = Date.now();
            if (typeof expiresAt === 'number' && now > expiresAt) {
                logger.debug('Memory expired, moving to episodic: %o', memory);
                await this.moveToEpisodicMemory(memory);
                return [];
            }

            return [memory];
        }

        // Handle filter case
        const filter = idOrFilter || {};
        const types = filter.types || [MemoryType.WORKING];
        if (!types.includes(MemoryType.WORKING)) {
            logger.debug('Filter does not include working memories: %o', filter);
            return [];
        }

        const memories = await this.storage.retrieveByFilter(filter);
        const now = Date.now();
        const validMemories: IMemoryUnit[] = [];

        for (const memory of memories) {
            if (memory.metadata.get('type') !== MemoryType.WORKING) {
                continue;
            }

            const expiresAt = memory.metadata.get('expiresAt');
            if (typeof expiresAt === 'number' && now > expiresAt) {
                logger.debug('Memory expired, moving to episodic: %o', memory);
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
        // Clear expiration timer first
        this.clearExpirationTimer(memory.id);

        const episodicMetadata = new Map(memory.metadata);
        episodicMetadata.set('type', MemoryType.EPISODIC);
        episodicMetadata.delete('expiresAt');  // Episodic memories don't expire
        episodicMetadata.set('originalType', MemoryType.WORKING);
        episodicMetadata.set('consolidationTime', Date.now());
        episodicMetadata.set('transitionType', 'immediate');
        episodicMetadata.set('originalId', memory.id);

        // Preserve important metadata
        const preserveKeys = ['priority', 'relevance', 'importance', 'tags', 'category', 'source'];
        for (const key of preserveKeys) {
            const value = memory.metadata.get(key);
            if (value !== undefined) {
                episodicMetadata.set(key, value);
            }
        }

        const episodicMemory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: memory.content,
            metadata: episodicMetadata,
            timestamp: memory.timestamp // Preserve original timestamp
        };

        logger.debug('Moving memory to episodic: %o', episodicMemory);
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
            // Consolidate metadata from all memories
            const consolidatedMetadata = new Map<string, any>();
            consolidatedMetadata.set('type', MemoryType.EPISODIC);
            consolidatedMetadata.set('context', context);
            consolidatedMetadata.set('originalType', MemoryType.WORKING);
            consolidatedMetadata.set('consolidationTime', Date.now());
            consolidatedMetadata.set('transitionType', 'batch');
            consolidatedMetadata.set('originalIds', groupMemories.map(m => m.id));

            // Consolidate important metadata
            const preserveKeys = ['priority', 'relevance', 'importance', 'tags', 'category', 'source'];
            for (const key of preserveKeys) {
                const values = groupMemories
                    .map(m => m.metadata.get(key))
                    .filter(v => v !== undefined);
                
                if (values.length > 0) {
                    if (key === 'priority' || key === 'relevance' || key === 'importance') {
                        // For numeric values, take the maximum
                        consolidatedMetadata.set(key, Math.max(...values.map(v => Number(v))));
                    } else if (key === 'tags' || key === 'category') {
                        // For arrays or sets, combine unique values
                        const uniqueValues = new Set(values.flat());
                        consolidatedMetadata.set(key, Array.from(uniqueValues));
                    } else {
                        // For other values, take the most common
                        const valueCounts = new Map<any, number>();
                        values.forEach(v => valueCounts.set(v, (valueCounts.get(v) || 0) + 1));
                        const [mostCommon] = Array.from(valueCounts.entries())
                            .sort((a, b) => b[1] - a[1])[0];
                        consolidatedMetadata.set(key, mostCommon);
                    }
                }
            }

            // Create consolidated memory
            const consolidatedMemory: IMemoryUnit = {
                id: crypto.randomUUID(),
                content: {
                    memories: groupMemories.map(m => ({
                        id: m.id,
                        content: m.content,
                        metadata: Object.fromEntries(m.metadata),
                        timestamp: m.timestamp
                    })),
                    context
                },
                metadata: consolidatedMetadata,
                timestamp: new Date(Math.max(...groupMemories.map(m => m.timestamp.getTime())))
            };

            // Store consolidated memory and cleanup originals
            logger.debug('Storing consolidated memory: %o', consolidatedMemory);
            await this.storage.store(consolidatedMemory);
            await this.index.index(consolidatedMemory);

            // Clear expiration timers and delete originals
            for (const memory of groupMemories) {
                this.clearExpirationTimer(memory.id);
                await this.storage.delete(memory.id);
            }
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
                    await this.moveToEpisodicMemory(currentMemory);
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

    /**
     * Get statistics about the working memory state
     */
    async getStats(): Promise<{ capacityUsage: number; totalMemories: number }> {
        const memories = await this.retrieve({ types: [MemoryType.WORKING] });
        return {
            totalMemories: memories.length,
            capacityUsage: memories.length / this.MAX_WORKING_MEMORY_SIZE
        };
    }

    /**
     * Update context
     */
    public async updateContext(newContext: string): Promise<void> {
        const memories = await this.retrieve({ types: [MemoryType.WORKING] });
        
        for (const memory of memories) {
            const metadata = new Map(memory.metadata);
            const currentContext = metadata.get('context');
            
            if (currentContext && currentContext !== newContext) {
                // Increment context switch count
                const switches = (metadata.get('contextSwitches') || 0) + 1;
                metadata.set('contextSwitches', switches);
                
                // Update context
                metadata.set('context', newContext);
                
                await this.update({
                    ...memory,
                    metadata
                });
            }
        }
    }
}
