import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryFilter, MemoryType, IMemory } from './types';
import { Subject } from 'rxjs';
import crypto from 'crypto';

/**
 * Cache for memory units
 */
class MemoryCache<T extends IMemoryUnit> {
    private cache: Map<string, T>;
    private maxSize: number;

    constructor(maxSize: number = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(id: string): T | undefined {
        return this.cache.get(id);
    }

    set(id: string, unit: T): void {
        if (this.cache.size >= this.maxSize) {
            // Remove oldest entry if cache is full
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(id, unit);
    }

    clear(): void {
        this.cache.clear();
    }

    delete(id: string): boolean {
        return this.cache.delete(id);
    }
}

/**
 * Base class for long-term memory types
 */
export abstract class LongTermMemory<T extends IMemoryUnit> implements IMemory<T> {
    protected storage: IMemoryStorage;
    protected index: IMemoryIndex;
    protected memoryType: MemoryType;
    protected cache: MemoryCache<T>;
    protected events: Subject<T>;

    constructor(storage: IMemoryStorage, index: IMemoryIndex, memoryType: MemoryType) {
        this.storage = storage;
        this.index = index;
        this.memoryType = memoryType;
        this.cache = new MemoryCache<T>();
        this.events = new Subject<T>();
    }

    /**
     * Create a new memory unit of type T
     * This must be implemented by concrete classes to ensure type safety
     */
    protected abstract createMemoryUnit(content: any, metadata?: Map<string, any>): T;

    /**
     * Store a memory unit
     */
    async store(content: any, metadata?: Map<string, any>): Promise<void> {
        const unit = this.createMemoryUnit(content, metadata);
        unit.id = crypto.randomUUID();
        await this.storage.store(unit);
        await this.index.add(unit);
        this.cache.set(unit.id, unit);
        this.events.next(unit);
    }

    /**
     * Retrieve a memory unit by ID
     */
    async retrieve(id: string): Promise<T | null> {
        // Check cache first
        const cached = this.cache.get(id);
        if (cached) {
            return cached;
        }

        // If not in cache, check storage
        const unit = await this.storage.retrieve(id);
        if (unit && this.isMemoryUnitOfType(unit)) {
            this.cache.set(unit.id, unit);
            this.events.next(unit);
            return unit as T;
        }
        return null;
    }

    /**
     * Query memory units based on filter
     */
    async query(filter: MemoryFilter): Promise<T[]> {
        const units = await this.storage.retrieveByFilter(filter);
        return units.filter(this.isMemoryUnitOfType.bind(this)) as T[];
    }

    /**
     * Delete a memory unit
     */
    async delete(id: string): Promise<void> {
        await this.storage.delete(id);
        await this.index.remove(id);
        this.cache.delete(id);
    }

    /**
     * Clear all memory units
     */
    async clear(): Promise<void> {
        await this.storage.clear();
        // Removed await this.index.clear(); as IMemoryIndex does not have a clear method
        this.cache.clear();
    }

    /**
     * Subscribe to memory events
     */
    onEvent(callback: (unit: T) => void): void {
        this.events.subscribe(callback);
    }

    /**
     * Type guard to ensure retrieved memory unit is of correct type
     */
    isMemoryUnitOfType(unit: any): unit is T {
        return unit && typeof unit === 'object' && 'memoryType' in unit && unit.memoryType === this.memoryType;
    }
}
