import { IMemory, IMemoryUnit, MemoryFilter, MemoryType } from '../../base';
import { IMemoryStorage, IMemoryIndex } from '../../storage';
import { logger } from '../../../Logger';
import crypto from 'crypto';
import { WorkingMemoryFactory } from './WorkingMemoryFactory';
import { Subject } from 'rxjs';
import { z } from 'zod';

export class WorkingMemory implements IMemory<IMemoryUnit> {
    private storage: IMemoryStorage;
    private index: IMemoryIndex;
    private maxSize: number;
    private events: Subject<IMemoryUnit>;
    protected size: number = 0;
    private logger = logger.withContext({ 
        module: 'memory', 
        component: 'working'
    });

    constructor(storage: IMemoryStorage, index: IMemoryIndex, maxSize: number = 100) {
        this.storage = storage;
        this.index = index;
        this.maxSize = maxSize;
        this.events = new Subject<IMemoryUnit>();
    }

    public getCapacity(): number {
        return this.maxSize;
    }

    public getCurrentSize(): number {
        return this.size;
    }

    createMemoryUnit<C>(
        content: C | string, 
        schema?: z.ZodType<C>, 
        metadata?: Map<string, any>
    ): IMemoryUnit {
        let validatedContent: any;

        if (typeof content === 'string') {
            validatedContent = content;
        } else {
            if (!schema) {
                throw new Error('Schema is required for object content');
            }
            const validationResult = schema.safeParse(content);
            if (!validationResult.success) {
                throw new Error(`Invalid working memory content: ${validationResult.error}`);
            }
            validatedContent = validationResult.data;
        }

        const now = new Date();
        return {
            id: crypto.randomUUID(),
            content: validatedContent,
            metadata: metadata || new Map(),
            timestamp: now,
            memoryType: MemoryType.WORKING,
            accessCount: 0,
            lastAccessed: now,
            priority: metadata?.get('priority') as number || 0.5
        };
    }

    async store(content: Omit<IMemoryUnit, 'memoryType'>): Promise<void> {
        const memoryUnit = {
            ...content,
            memoryType: MemoryType.WORKING
        } as IMemoryUnit;

        await this.storage.add(memoryUnit.id, memoryUnit);
        this.events.next(memoryUnit);
        this.size++;
        await this.ensureCapacity();
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        const unit = await this.storage.get(id);
        if (unit && unit.memoryType === MemoryType.WORKING) {
            return unit;
        }
        this.logger.debug('Memory not found or not working memory: %s', id);
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
        return unit && 
               typeof unit === 'object' && 
               'memoryType' in unit && 
               unit.memoryType === MemoryType.WORKING;
    }

    /**
     * Ensure working memory stays within capacity
     */
    private async ensureCapacity(): Promise<void> {
        if (this.size <= this.maxSize) {
            return;
        }

        // Get all items sorted by priority and last access time
        const items = await this.storage.getAll();
        items.sort((a, b) => {
            const priorityA = a.metadata?.get('priority') as number || 0;
            const priorityB = b.metadata?.get('priority') as number || 0;
            
            if (priorityA !== priorityB) {
                return priorityB - priorityA; // Higher priority items stay
            }
            
            // If priorities are equal, compare last access times
            return (b.lastAccessed?.getTime() || 0) - (a.lastAccessed?.getTime() || 0);
        });

        // Remove lowest priority/least recently used items
        while (this.size > this.maxSize && items.length > 0) {
            const itemToRemove = items.pop();
            if (itemToRemove) {
                await this.storage.remove(itemToRemove.id);
                this.size--;
            }
        }
    }
}
