import { IMemoryUnit, MemoryFilter, MemoryType } from './types';
import { AbstractMemory } from './AbstractMemory';
import { IMemoryStorage, IMemoryIndex } from './types';
import { logger } from '../Logger';
import crypto from 'crypto';

export class WorkingMemory extends AbstractMemory {
    protected readonly MAX_WORKING_MEMORY_SIZE = 100;
    protected readonly DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
    protected readonly expirationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index, MemoryType.WORKING);
    }

    /**
     * Store content in working memory
     */
    public override async store(content: any, metadata: any = {}): Promise<IMemoryUnit> {
        const metadataMap = metadata instanceof Map ? metadata : new Map(Object.entries(metadata || {}));
        
        // Set working memory specific metadata
        if (!metadataMap.has('expiresAt')) {
            metadataMap.set('expiresAt', Date.now() + this.DEFAULT_TTL);
        }

        // Store using parent class method
        const memory = await super.store(content, metadataMap);

        // Check capacity after storing
        await this.ensureCapacity();

        // Set expiration timer
        const expiresAt = metadataMap.get('expiresAt');
        if (expiresAt) {
            const timeout = setTimeout(async () => {
                const currentMemory = await this.storage.retrieve(memory.id);
                if (currentMemory) {
                    await this.moveToEpisodicMemory(currentMemory);
                }
                this.expirationTimers.delete(memory.id);
            }, expiresAt - Date.now());
            this.expirationTimers.set(memory.id, timeout);
        }

        return memory;
    }

    /**
     * Retrieve memories by filter or id
     */
    public override async retrieve(idOrFilter: string | MemoryFilter): Promise<IMemoryUnit[]> {
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
        const memories = await super.retrieve(idOrFilter);
        const now = Date.now();
        const validMemories: IMemoryUnit[] = [];

        for (const memory of memories) {
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
     * Retrieve all memories
     */
    public async retrieveAll(): Promise<IMemoryUnit[]> {
        return this.retrieve({
            types: [MemoryType.WORKING]
        });
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
        await this.index.add(episodicMemory);
        await this.storage.delete(memory.id);
    }

    /**
     * Consolidate multiple memories to episodic storage in batch
     * Used for context changes and periodic cleanup
     */
    public async consolidateToEpisodic(): Promise<void> {
        const memories = await this.retrieve({
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
                        // For arrays/sets, combine unique values
                        const uniqueValues = new Set(values.flat());
                        consolidatedMetadata.set(key, Array.from(uniqueValues));
                    } else {
                        // For other values, take the most recent
                        consolidatedMetadata.set(key, values[values.length - 1]);
                    }
                }
            }

            // Create consolidated episodic memory
            const episodicMemory: IMemoryUnit = {
                id: crypto.randomUUID(),
                content: groupMemories.map(m => m.content),
                metadata: consolidatedMetadata,
                timestamp: new Date(Math.max(...groupMemories.map(m => m.timestamp.getTime())))
            };

            // Store consolidated memory and clean up originals
            logger.debug('Storing consolidated episodic memory: %o', episodicMemory);
            await this.storage.store(episodicMemory);
            await this.index.add(episodicMemory);

            // Delete original memories and clear timers
            for (const memory of groupMemories) {
                this.clearExpirationTimer(memory.id);
                await this.storage.delete(memory.id);
                await this.index.delete(memory.id);
            }
        }
    }

    /**
     * Ensure working memory stays within capacity
     */
    private async ensureCapacity(): Promise<void> {
        const memories = await this.retrieve({
            types: [MemoryType.WORKING]
        });

        if (memories.length > this.MAX_WORKING_MEMORY_SIZE) {
            // Sort by priority and recency
            const sortedMemories = memories.sort((a, b) => {
                const aPriority = a.metadata.get('priority') || 0;
                const bPriority = b.metadata.get('priority') || 0;
                if (aPriority !== bPriority) {
                    return bPriority - aPriority;
                }
                return b.timestamp.getTime() - a.timestamp.getTime();
            });

            // Move excess memories to episodic
            const excessMemories = sortedMemories.slice(this.MAX_WORKING_MEMORY_SIZE);
            for (const memory of excessMemories) {
                await this.moveToEpisodicMemory(memory);
            }
        }
    }

    /**
     * Clear expiration timer for a memory
     */
    private clearExpirationTimer(id: string): void {
        const timer = this.expirationTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.expirationTimers.delete(id);
        }
    }

    /**
     * Cleanup expired memories
     */
    public async cleanup(): Promise<void> {
        const memories = await this.retrieve({
            types: [MemoryType.WORKING]
        });

        const now = Date.now();
        for (const memory of memories) {
            const expiresAt = memory.metadata.get('expiresAt');
            if (typeof expiresAt === 'number' && now > expiresAt) {
                await this.moveToEpisodicMemory(memory);
            }
        }
    }
}
