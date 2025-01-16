import { IMemoryUnit, MemoryFilter, MemoryType, IMemory } from './base';
import { IMemoryStorage, IMemoryIndex } from './storage';
import { Subject } from 'rxjs';
import * as z from 'zod';
import crypto from 'crypto';

/**
 * Cache for memory units
 */
class MemoryCache<T extends IMemoryUnit> {
    private cache: Map<string, T>;
    private maxSize: number;

    constructor(maxSize: number = 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(id: string): T | undefined {
        return this.cache.get(id);
    }

    set(id: string, unit: T): void {
        if (this.cache.size >= this.maxSize) {
            // Remove oldest entry when cache is full
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }
        this.cache.set(id, unit);
    }

    delete(id: string): void {
        this.cache.delete(id);
    }

    clear(): void {
        this.cache.clear();
    }
}

/**
 * Base class for long-term memory implementations
 */
export abstract class LongTermMemory<T extends IMemoryUnit> implements IMemory<T> {
    protected storage: IMemoryStorage;
    protected index: IMemoryIndex;
    protected memoryType: MemoryType;
    protected cache: MemoryCache<T>;
    protected memoryEvents$: Subject<T>;

    constructor(storage: IMemoryStorage, index: IMemoryIndex, memoryType: MemoryType) {
        this.storage = storage;
        this.index = index;
        this.memoryType = memoryType;
        this.cache = new MemoryCache<T>();
        this.memoryEvents$ = new Subject<T>();
    }

    /**
     * Create a memory unit with the appropriate type
     * This must be implemented by concrete classes to ensure type safety
     * @param content The content to store, can be either a string or an object of type C
     * @param schema Optional schema for validating object content
     * @param metadata Optional metadata for the memory unit
     */
    public abstract createMemoryUnit<C>(content: C | string, schema?: z.ZodType<C>, metadata?: Map<string, any>): T;

    /**
     * Store a memory unit
     */
    async store(content: Omit<T, 'memoryType'>): Promise<void> {
        const memoryUnit = {
            ...content,
            memoryType: this.memoryType
        } as T;

        await this.storage.store(memoryUnit);
        this.memoryEvents$.next(memoryUnit);
    }

    /**
     * Retrieve a memory unit by ID
     */
    async retrieve(id: string): Promise<T | null> {
        // Check cache first
        const cached = this.cache.get(id);
        if (cached) return cached;

        // Retrieve from storage
        const unit = await this.storage.retrieve(id);
        if (unit && this.isMemoryUnitOfType(unit)) {
            this.cache.set(unit.id, unit);
            this.memoryEvents$.next(unit);
            return unit as T;
        }
        return null;
    }

    /**
     * Query memory units based on filter
     */
    async query(filter: MemoryFilter): Promise<T[]> {
        const results = await this.storage.retrieveByFilter(filter);
        return results
            .filter((unit: IMemoryUnit) => this.isMemoryUnitOfType(unit))
            .map((unit: IMemoryUnit) => unit as T);
    }

    /**
     * Delete a memory unit
     */
    async delete(id: string): Promise<void> {
        this.cache.delete(id);
        await this.storage.delete(id);
    }

    /**
     * Clear all memory units
     */
    async clear(): Promise<void> {
        this.cache.clear();
        await this.storage.clear();
    }

    /**
     * Subscribe to memory events
     */
    onEvent(callback: (unit: T) => void): void {
        this.memoryEvents$.subscribe(callback);
    }

    /**
     * Type guard to ensure memory unit is of correct type
     */
    abstract isMemoryUnitOfType(unit: any): unit is T;
}
