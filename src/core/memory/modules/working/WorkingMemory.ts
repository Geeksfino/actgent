import { IMemory, IMemoryUnit, MemoryFilter, MemoryType } from '../../types';
import { IMemoryStorage, IMemoryIndex } from '../../types';
import { logger } from '../../../Logger';
import crypto from 'crypto';
import { WorkingMemoryFactory } from './WorkingMemoryFactory';
import { Subject } from 'rxjs';

export class WorkingMemory implements IMemory<IMemoryUnit> {
    private storage: IMemoryStorage;
    private index: IMemoryIndex;
    private maxCapacity: number;
    private events: Subject<IMemoryUnit>;
    protected readonly DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
    protected readonly expirationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    protected size: number = 0;

    constructor(storage: IMemoryStorage, index: IMemoryIndex, maxCapacity: number = 100) {
        this.storage = storage;
        this.index = index;
        this.maxCapacity = maxCapacity;
        this.events = new Subject<IMemoryUnit>();
    }

    public getCapacity(): number {
        return this.maxCapacity;
    }

    public getCurrentSize(): number {
        return this.size;
    }

    async store(memory: IMemoryUnit): Promise<void> {
        await this.storage.add(memory.id, memory);
        this.events.next(memory);
        this.size++;
        await this.ensureCapacity();
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        const unit = await this.storage.get(id);
        if (unit && unit.memoryType === MemoryType.WORKING) {
            return unit;
        }
        logger.debug('Memory not found or not working memory: %s', id);
        return null;
    }

    async query(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        // Simplified query implementation
        const allUnits = await this.getAll();
        return allUnits.filter(unit => this.isMemoryUnitOfType(unit));
    }

    async delete(id: string): Promise<void> {
        await this.storage.remove(id);
        this.size--;
    }

    async clear(): Promise<void> {
        await this.storage.clear();
        this.size = 0;
    }

    async getAll(): Promise<IMemoryUnit[]> {
        // Retrieve all items in working memory
        return this.storage.getAll();
    }

    onEvent(callback: (unit: IMemoryUnit) => void): void {
        this.events.subscribe(callback);
    }

    isMemoryUnitOfType(unit: any): unit is IMemoryUnit {
        return unit && typeof unit === 'object' && 'memoryType' in unit && unit.memoryType === MemoryType.WORKING;
    }

    /**
     * Create a working memory unit
     */
    private createMemoryUnit(content: any, metadata?: Map<string, any>): IMemoryUnit {
        const priority = metadata?.get('priority') as number || 0.5;
        const relevance = metadata?.get('relevance') as number || 0.5;
        return WorkingMemoryFactory.createMemoryUnit(content, priority, relevance);
    }

    /**
     * Ensure working memory stays within capacity
     */
    private async ensureCapacity(): Promise<void> {
        const memories = await this.getAll();

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
        await this.storage.add(episodicMemory.id, episodicMemory);
        await this.index.add(episodicMemory);
        await this.storage.remove(memory.id);
        this.size--;
    }
}
