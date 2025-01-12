import { IMemoryUnit, MemoryFilter, MemoryType } from './types';
import { AbstractMemory } from './AbstractMemory';
import { IMemoryStorage, IMemoryIndex } from './types';
import { logger } from '../Logger';
import crypto from 'crypto';

export class WorkingMemory extends AbstractMemory {
    private readonly maxCapacity: number;
    protected readonly DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
    protected readonly expirationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    protected size: number = 0;

    constructor(storage: IMemoryStorage, index: IMemoryIndex, maxCapacity: number = 100) {
        super(storage, index, MemoryType.WORKING);
        this.maxCapacity = maxCapacity;
    }

    public getCapacity(): number {
        return this.maxCapacity;
    }

    public getCurrentSize(): number {
        return this.size;
    }

    protected async createEpisodicMemory(memory: IMemoryUnit): Promise<IMemoryUnit> {
        return {
            id: crypto.randomUUID(),
            content: memory.content,
            metadata: new Map(memory.metadata),
            timestamp: new Date(),
            memoryType: MemoryType.EPISODIC,
            accessCount: 0,
            lastAccessed: new Date()
        };
    }

    protected async createBatchMemory(contents: any[]): Promise<IMemoryUnit> {
        return {
            id: crypto.randomUUID(),
            content: contents,
            metadata: new Map(),
            timestamp: new Date(),
            memoryType: MemoryType.WORKING,
            accessCount: 0,
            lastAccessed: new Date()
        };
    }

    /**
     * Store content in working memory
     */
    public override async store(content: any, metadata?: Map<string, any>): Promise<IMemoryUnit> {
        const metadataMap = metadata || new Map();
        
        // Set working memory specific metadata
        if (!metadataMap.has('expiresAt')) {
            metadataMap.set('expiresAt', Date.now() + this.DEFAULT_TTL);
        }

        // Store using parent class method
        const memory = await super.store(content, metadataMap);
        this.size++;
        
        // Check capacity after storing
        await this.ensureCapacity();

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

            return [memory];
        }

        // Handle filter case
        const memories = await super.retrieve(idOrFilter);
        return memories;
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
     * Batch retrieve memories by IDs
     */
    public async batchRetrieve(ids: string[]): Promise<IMemoryUnit[]> {
        const memories = await Promise.all(
            ids.map(id => this.retrieve({ id }))
        );
        return memories.flat();
    }

    /**
     * Move a single memory to episodic storage immediately
     * Used for immediate transitions (expiration, capacity)
     */
    private async moveToEpisodicMemory(memory: IMemoryUnit): Promise<void> {
        // Create episodic memory
        const episodicMemory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content: memory.content,
            metadata: new Map(memory.metadata),
            timestamp: new Date(),
            memoryType: MemoryType.EPISODIC,
            accessCount: 0,
            lastAccessed: new Date()
        };

        // Store in episodic memory
        await this.storage.store(episodicMemory);
        await this.index.add(episodicMemory);
        await this.storage.delete(memory.id);
        this.size--;
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
                timestamp: new Date(Math.max(...groupMemories.map(m => m.timestamp.getTime()))),
                memoryType: MemoryType.EPISODIC,
                accessCount: 0,
                lastAccessed: new Date()
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
                this.size--;
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

        if (this.getCurrentSize() > this.maxCapacity) {
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
            const excessMemories = sortedMemories.slice(this.maxCapacity);
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
        // Implement cleanup logic for working memory
        // For example, remove old or infrequently accessed memories
        const memoriesToCleanup = await this.retrieve({
            types: [MemoryType.WORKING],
            orderBy: 'lastAccessed',
            limit: 10
        });

        // Delete oldest memories if capacity exceeded
        if (this.getCurrentSize() > this.maxCapacity) {
            for (const memory of memoriesToCleanup) {
                await this.delete(memory.id);
                if (this.getCurrentSize() <= this.maxCapacity) {
                    break;
                }
            }
        }
    }

    public async batchStore(contents: any[]): Promise<IMemoryUnit> {
        const batchMemory = {
            id: crypto.randomUUID(),
            content: contents,
            metadata: new Map(),
            timestamp: new Date(),
            memoryType: MemoryType.WORKING,
            accessCount: 0,
            lastAccessed: new Date()
        };

        await this.storage.store(batchMemory);
        await this.index.add(batchMemory);
        this.size++;

        return batchMemory;
    }
}
