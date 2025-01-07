import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryFilter } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Memory cache implementation for optimizing memory access
 */
export class MemoryCache {
    private cache: Map<string, IMemoryUnit>;
    private maxSize: number;

    constructor(maxSize: number = 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    set(id: string, memory: IMemoryUnit): void {
        if (this.cache.size >= this.maxSize) {
            // Remove oldest entry when cache is full
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(id, memory);
    }

    get(id: string): IMemoryUnit | undefined {
        return this.cache.get(id);
    }

    clear(): void {
        this.cache.clear();
    }
}

/**
 * Abstract base class for all memory systems
 */
export abstract class BaseMemorySystem {
    protected storage: IMemoryStorage;
    protected index: IMemoryIndex;
    protected cache: Map<string, IMemoryUnit>;
    protected cacheSize: number;
    protected cacheExpiryMs: number;
    protected lastCacheCleanup: number;
    protected cleanupIntervalMs: number;

    constructor(
        storage: IMemoryStorage,
        index: IMemoryIndex,
        maxCacheSize: number = 1000,
        cacheExpiryMs: number = 5 * 60 * 1000, // 5 minutes
        cleanupIntervalMs: number = 60 * 1000 // 1 minute
    ) {
        this.storage = storage;
        this.index = index;
        this.cache = new Map();
        this.cacheSize = maxCacheSize;
        this.cacheExpiryMs = cacheExpiryMs;
        this.cleanupIntervalMs = cleanupIntervalMs;
        this.lastCacheCleanup = Date.now();
    }

    /**
     * Store new memory content with optional metadata
     */
    abstract store(content: any, metadata?: Map<string, any>): Promise<void>;

    /**
     * Retrieve memories based on filter criteria
     */
    abstract retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]>;

    /**
     * Protected utility method to generate unique memory IDs
     */
    protected generateId(): string {
        return uuidv4();
    }

    /**
     * Protected utility method to validate memory unit
     */
    protected validateMemoryUnit(memory: IMemoryUnit): boolean {
        return (
            typeof memory.id === 'string' &&
            memory.id.length > 0 &&
            memory.timestamp instanceof Date &&
            memory.content !== undefined &&
            memory.content !== null
        );
    }

    protected async updateCacheEntry(id: string, memory: IMemoryUnit): Promise<void> {
        // Update access statistics
        memory.accessCount = (memory.accessCount || 0) + 1;
        memory.lastAccessed = new Date();

        // Add to cache
        this.cache.set(id, memory);

        // Check if cache cleanup is needed
        const now = Date.now();
        if (now - this.lastCacheCleanup > this.cleanupIntervalMs) {
            await this.cleanupCache();
        }
    }

    protected async cleanupCache(): Promise<void> {
        const now = Date.now();
        this.lastCacheCleanup = now;

        // If cache size is within limits and no entries are expired, return early
        if (this.cache.size <= this.cacheSize) {
            const hasExpiredEntries = Array.from(this.cache.values()).some(
                memory => now - memory.lastAccessed!.getTime() > this.cacheExpiryMs
            );
            if (!hasExpiredEntries) {
                return;
            }
        }

        // Sort entries by a score combining recency, access count, and priority
        const entries = Array.from(this.cache.entries()).map(([id, memory]) => ({
            id,
            memory,
            score: this.calculateCacheScore(memory, now)
        }));

        entries.sort((a, b) => b.score - a.score);

        // Keep only the top entries within cache size limit
        const entriesToKeep = entries
            .slice(0, this.cacheSize)
            .filter(entry => now - entry.memory.lastAccessed!.getTime() <= this.cacheExpiryMs);

        // Clear cache and add back the entries to keep
        this.cache.clear();
        for (const entry of entriesToKeep) {
            this.cache.set(entry.id, entry.memory);
        }
    }

    private calculateCacheScore(memory: IMemoryUnit, now: number): number {
        const recency = 1 - (now - memory.lastAccessed!.getTime()) / this.cacheExpiryMs;
        const accessFrequency = Math.log1p(memory.accessCount || 0);
        const priority = memory.priority || 0;

        return (recency * 0.4) + (accessFrequency * 0.3) + (priority * 0.3);
    }

    protected async batchOperation<T>(
        items: T[],
        operation: (item: T) => Promise<void>,
        batchSize: number = 50
    ): Promise<void> {
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            await Promise.all(batch.map(operation));
        }
    }
}
