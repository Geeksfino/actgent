import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryFilter, MemoryType } from './types';
import crypto from 'crypto';
import { Logger } from '../Logger';

/**
 * Memory cache implementation for optimizing memory access
 */
class MemoryCache {
    private cache: Map<string, IMemoryUnit> = new Map();
    private maxSize: number = 1000;
    private logger = Logger.getInstance();

    set(id: string, memory: IMemoryUnit): void {
        if (this.cache.size >= this.maxSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.logger.debug('Cache eviction', { id: firstKey });
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(id, memory);
        this.logger.debug('Cache set', { id, type: memory.memoryType });
    }

    get(id: string): IMemoryUnit | undefined {
        const memory = this.cache.get(id);
        this.logger.debug('Cache access', { 
            id, 
            hit: !!memory,
            type: memory?.memoryType 
        });
        return memory;
    }

    delete(id: string): void {
        this.cache.delete(id);
        this.logger.debug('Cache delete', { id });
    }

    clear(): void {
        const size = this.cache.size;
        this.cache.clear();
        this.logger.debug('Cache cleared', { entriesCleared: size });
    }
}

/**
 * Abstract base class for memory implementations
 */
export abstract class AbstractMemory {
    protected readonly storage: IMemoryStorage;
    protected readonly index: IMemoryIndex;
    protected readonly memoryType: MemoryType;
    protected readonly cache: MemoryCache = new MemoryCache();
    protected readonly logger = Logger.getInstance();

    constructor(storage: IMemoryStorage, index: IMemoryIndex, memoryType: MemoryType) {
        this.storage = storage;
        this.index = index;
        this.memoryType = memoryType;
        this.logger.debug('Memory system initialized', { type: memoryType });
    }

    protected generateId(): string {
        return crypto.randomUUID();
    }

    protected async storeWithType(content: any, metadata: Map<string, any> = new Map()): Promise<IMemoryUnit> {
        const memory: IMemoryUnit = {
            id: this.generateId(),
            content,
            metadata: metadata || new Map(),
            timestamp: new Date(),
            memoryType: this.memoryType,
            accessCount: 0,
            lastAccessed: new Date()
        };

        this.logger.debug('Storing memory', { 
            id: memory.id, 
            type: memory.memoryType,
            metadata: Object.fromEntries(memory.metadata)
        });

        await this.storage.store(memory);
        await this.index.add(memory);
        return memory;
    }

    public async store(content: any, metadata?: Map<string, any>): Promise<IMemoryUnit> {
        const memory = await this.storeWithType(content, metadata || new Map());
        this.logger.info('Memory stored', { 
            id: memory.id, 
            type: memory.memoryType 
        });
        return memory;
    }

    public async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        this.logger.debug('Retrieving memories', { filter });

        // Check cache first for id-based queries
        if (filter.id) {
            const cached = this.cache.get(filter.id);
            if (cached) {
                await this.updateAccessStats(cached);
                this.logger.debug('Cache hit', { id: filter.id });
                return [cached];
            }
            this.logger.debug('Cache miss', { id: filter.id });
        }

        const memories = await this.storage.retrieveByFilter(filter);
        
        this.logger.debug('Retrieved memories', { 
            count: memories.length,
            types: [...new Set(memories.map(m => m.memoryType))]
        });

        // Update cache and access stats
        for (const memory of memories) {
            this.cache.set(memory.id, memory);
            await this.updateAccessStats(memory);
        }

        return memories;
    }

    protected async updateAccessStats(memory: IMemoryUnit): Promise<void> {
        const updatedMemory = {
            ...memory,
            accessCount: (memory.accessCount || 0) + 1,
            lastAccessed: new Date()
        };

        this.logger.debug('Updating access stats', { 
            id: memory.id,
            accessCount: updatedMemory.accessCount,
            type: memory.memoryType
        });

        await this.storage.store(updatedMemory);
        this.cache.set(updatedMemory.id, updatedMemory);
    }

    public async update(memory: IMemoryUnit): Promise<void> {
        this.logger.debug('Updating memory', { 
            id: memory.id,
            type: memory.memoryType
        });

        await this.storage.update(memory);
        await this.index.update(memory);
    }

    public async delete(id: string): Promise<void> {
        this.logger.debug('Deleting memory', { id });
        await this.storage.delete(id);
        await this.index.delete(id);
        this.cache.delete(id);
    }

    public async batchRetrieve(ids: string[]): Promise<(IMemoryUnit | null)[]> {
        this.logger.debug('Batch retrieving memories', { count: ids.length });
        
        const results = await Promise.all(
            ids.map(async id => {
                try {
                    const results = await this.retrieve({ id });
                    return results[0] || null;
                } catch (error) {
                    this.logger.error('Error retrieving memory', { id, error });
                    return null;
                }
            })
        );

        const successCount = results.filter(r => r !== null).length;
        this.logger.debug('Batch retrieve completed', {
            total: ids.length,
            success: successCount,
            failed: ids.length - successCount
        });

        return results;
    }

    public getCurrentSize(): number {
        const size = this.storage.getSize();
        this.logger.debug('Current memory size', { 
            type: this.memoryType, 
            size,
            capacityUsed: `${((size / this.getCapacity()) * 100).toFixed(1)}%`
        });
        return size;
    }

    public getCapacity(): number {
        const capacity = this.storage.getCapacity();
        this.logger.debug('Memory capacity', { 
            type: this.memoryType, 
            capacity 
        });
        return capacity;
    }

    public abstract cleanup(): Promise<void>;
}