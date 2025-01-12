import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryFilter, MemoryType } from './types';
import crypto from 'crypto';
import { Logger } from '../Logger';

/**
 * Memory cache implementation for optimizing memory access
 */
export class MemoryCache {
    private cache: Map<string, IMemoryUnit> = new Map();
    private accessOrder: string[] = [];
    private maxSize: number = 1000;
    private logger = Logger.getInstance();

    set(id: string, memory: IMemoryUnit): void {
        if (this.cache.size >= this.maxSize) {
            // Remove least recently used entry
            const oldestId = this.accessOrder.shift();
            if (oldestId) {
                this.logger.debug('Cache eviction', { id: oldestId });
                this.cache.delete(oldestId);
            }
        }
        this.cache.set(id, memory);
        // Add to access order
        this.accessOrder.push(id);
        this.logger.debug('Cache set', { id, type: memory.memoryType });
    }

    get(id: string): IMemoryUnit | undefined {
        const memory = this.cache.get(id);
        if (memory) {
            // Update access order
            const index = this.accessOrder.indexOf(id);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
                this.accessOrder.push(id);
            }
        }
        this.logger.debug('Cache access', { 
            id, 
            hit: !!memory,
            type: memory?.memoryType 
        });
        return memory;
    }

    delete(id: string): void {
        this.cache.delete(id);
        const index = this.accessOrder.indexOf(id);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.logger.debug('Cache delete', { id });
    }

    clear(): void {
        const size = this.cache.size;
        this.cache.clear();
        this.accessOrder = [];
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

        this.logger.debug('Storing memory unit', { 
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
        this.logger.debug('Retrieving memory unit', { filter });

        // Check cache first for id-based queries
        if (filter.id) {
            const cached = this.cache.get(filter.id);
            if (cached) {
                const updated = await this.updateAccessStats(cached);
                this.logger.debug('Cache hit', { id: filter.id });
                return [updated];
            }
            this.logger.debug('Cache miss', { id: filter.id });
        }

        const memories = await this.storage.retrieveByFilter(filter);
        
        this.logger.debug('Retrieved memories', { 
            count: memories.length,
            types: [...new Set(memories.map(m => m.memoryType))]
        });

        // Update cache and access stats
        const updatedMemories = await Promise.all(
            memories.map(async memory => {
                const updated = await this.updateAccessStats(memory);
                this.cache.set(updated.id, updated);
                return updated;
            })
        );

        return updatedMemories;
    }

    protected async updateAccessStats(memory: IMemoryUnit): Promise<IMemoryUnit> {
        const updatedMemory = {
            ...memory,
            accessCount: (memory.accessCount || 0) + 1,
            lastAccessed: new Date()
        };

        this.logger.debug('Updating memory unit', { 
            id: memory.id,
            accessCount: updatedMemory.accessCount,
            type: memory.memoryType
        });

        await this.storage.update(updatedMemory);
        this.cache.set(updatedMemory.id, updatedMemory);
        return updatedMemory;
    }

    public async update(memory: IMemoryUnit): Promise<void> {
        this.logger.debug('Updating memory unit', { 
            id: memory.id, 
            type: memory.memoryType 
        });

        await this.storage.update(memory);
        await this.index.update(memory);
        this.cache.set(memory.id, memory);
    }

    public async delete(id: string): Promise<void> {
        const memory = await this.storage.retrieve(id);
        if (!memory) {
            this.logger.error('Memory unit not found', { id });
            return;
        }

        this.logger.debug('Deleting memory unit', { 
            id, 
            type: memory.memoryType 
        });

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

    public async search(query: string): Promise<IMemoryUnit[]> {
        this.logger.debug('Searching memories', { query });
        
        const ids = await this.index.search(query);
        if (ids.length === 0) {
            return [];
        }

        const filter: MemoryFilter = { ids };
        return this.retrieve(filter);
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