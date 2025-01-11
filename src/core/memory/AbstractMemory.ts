import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryFilter, MemoryType } from './types';
import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Memory cache implementation for optimizing memory access
 */
class MemoryCache {
    private cache: Map<string, IMemoryUnit> = new Map();
    private maxSize: number = 1000;

    public get(id: string): IMemoryUnit | undefined {
        const memory = this.cache.get(id);
        if (memory) {
            memory.accessCount = (memory.accessCount || 0) + 1;
            memory.lastAccessed = new Date();
            this.cache.set(id, memory);
        }
        return memory;
    }

    public set(id: string, memory: IMemoryUnit): void {
        if (!id) {
            return;
        }
        if (this.cache.size >= this.maxSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(id, memory);
    }

    public delete(id: string): void {
        this.cache.delete(id);
    }

    public clear(): void {
        this.cache.clear();
    }
}

/**
 * Abstract base class for all memory types
 */
export abstract class AbstractMemory extends EventEmitter {
    protected storage: IMemoryStorage;
    protected index: IMemoryIndex;
    protected cache: MemoryCache;
    protected memoryType: MemoryType;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

    constructor(storage: IMemoryStorage, index: IMemoryIndex, type: MemoryType) {
        super();
        this.storage = storage;
        this.index = index;
        this.cache = new MemoryCache();
        this.memoryType = type;
        this.startCleanupTimer();
    }

    /**
     * Start cleanup timer
     */
    protected startCleanupTimer(): void {
        if (!this.cleanupTimer) {
            this.cleanupTimer = setInterval(() => {
                this.cleanup().catch(error => {
                    console.error('Error during cleanup:', error);
                });
            }, this.CLEANUP_INTERVAL);
        }
    }

    /**
     * Stop cleanup timer
     */
    public stopCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * Store memory unit with specific type
     */
    protected async storeWithType(content: any, metadata: any): Promise<IMemoryUnit> {
        // Convert metadata to Map if it's not already
        const metadataMap = metadata instanceof Map ? metadata : new Map(Object.entries(metadata || {}));

        // Create memory unit
        const memory: IMemoryUnit = {
            id: metadataMap.get('id') || this.generateId(),
            content,
            metadata: metadataMap,
            timestamp: new Date(),
            accessCount: 0,
            lastAccessed: new Date()
        };

        // Set memory type
        memory.metadata.set('type', this.memoryType.toString());

        // Store memory
        await this.storage.store(memory);
        await this.index.add(memory);
        this.cache.set(memory.id, memory);

        // Emit memory stored event
        this.emit('memoryStored', memory);

        return memory;
    }

    /**
     * Retrieve memories of specific type
     */
    protected async retrieveWithType(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        // Create a new filter object with the specified type
        const memoryFilter: MemoryFilter = {
            ...filter,
            types: [this.memoryType],
            ...(filter.query && { query: filter.query }),
            ...(filter.dateRange && { dateRange: filter.dateRange }),
            ...(filter.metadataFilters && { metadataFilters: filter.metadataFilters })
        };

        const memories = await this.storage.retrieveByFilter(memoryFilter);
        if (memories.length > 0) {
            // Update access counts for all retrieved memories
            await Promise.all(memories.map(async memory => {
                memory.accessCount = (memory.accessCount || 0) + 1;
                memory.lastAccessed = new Date();
                await this.update(memory);
            }));
        }
        return memories;
    }

    /**
     * Store content with metadata
     */
    public async store(content: any, metadata?: any): Promise<IMemoryUnit> {
        return this.storeWithType(content, metadata);
    }

    /**
     * Retrieve memories based on filter
     */
    public async retrieve(idOrFilter: string | MemoryFilter): Promise<IMemoryUnit[]> {
        if (typeof idOrFilter === 'string') {
            const memory = await this.storage.retrieve(idOrFilter);
            return memory ? [memory] : [];
        }
        return this.retrieveWithType(idOrFilter);
    }

    /**
     * Update memory unit
     */
    public async update(memory: IMemoryUnit): Promise<void> {
        await this.storage.update(memory);
        await this.index.update(memory);
        this.cache.set(memory.id, memory);
    }

    /**
     * Delete memory unit
     */
    public async delete(id: string): Promise<void> {
        await this.storage.delete(id);
        await this.index.delete(id);
        this.cache.delete(id);
    }

    /**
     * Generate unique ID
     */
    protected generateId(): string {
        return crypto.randomUUID();
    }

    /**
     * Set memory index
     */
    public setIndex(index: IMemoryIndex): void {
        this.index = index;
    }

    /**
     * Get memory type
     */
    public getType(): MemoryType {
        return this.memoryType;
    }

    /**
     * Build search query from filter
     */
    protected buildQuery(filter: MemoryFilter): string {
        const queryParts: string[] = [];

        if (filter.types?.length) {
            queryParts.push(`type:(${filter.types.join(' OR ')})`);
        }

        if (filter.dateRange) {
            if (filter.dateRange.start) {
                queryParts.push(`timestamp >= ${filter.dateRange.start.toISOString()}`);
            }
            if (filter.dateRange.end) {
                queryParts.push(`timestamp <= ${filter.dateRange.end.toISOString()}`);
            }
        }

        if (filter.id) {
            queryParts.push(`id:${filter.id}`);
        }

        if (filter.metadataFilters?.length) {
            for (const metadataFilter of filter.metadataFilters) {
                for (const [key, value] of metadataFilter.entries()) {
                    queryParts.push(`metadata.${key}:${value}`);
                }
            }
        }

        if (filter.contentFilters?.length) {
            for (const contentFilter of filter.contentFilters) {
                for (const [key, value] of contentFilter.entries()) {
                    queryParts.push(`content.${key}:${value}`);
                }
            }
        }

        if (filter.query) {
            queryParts.push(filter.query);
        }

        return queryParts.join(' AND ');
    }

    /**
     * Abstract cleanup method to be implemented by derived classes
     */
    public abstract cleanup(): Promise<void>;
}
