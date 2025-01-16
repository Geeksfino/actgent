import { IMemory, MemoryFilter, MemoryType } from '../../base';
import { EphemeralMemoryUnit } from './types';
import { z } from 'zod';
import crypto from 'crypto';

class EphemeralMemory implements IMemory<EphemeralMemoryUnit> {
    private duration: number;
    private items: { [id: string]: { item: EphemeralMemoryUnit; expiry: number } };
    private maxItems: number;

    constructor(duration: number = 2000, maxItems: number = 1000) { // Default duration is 2 seconds, max 1000 items
        this.duration = duration;
        this.maxItems = maxItems;
        this.items = {};
    }

    createMemoryUnit<C>(
        content: C | string, 
        schema?: z.ZodType<C>, 
        metadata?: Map<string, any>
    ): EphemeralMemoryUnit {
        let validatedContent: any;

        if (typeof content === 'string') {
            validatedContent = content;
        } else {
            if (!schema) {
                throw new Error('Schema is required for object content');
            }
            const validationResult = schema.safeParse(content);
            if (!validationResult.success) {
                throw new Error(`Invalid memory content: ${validationResult.error}`);
            }
            validatedContent = validationResult.data;
        }

        return {
            id: crypto.randomUUID(),
            content: validatedContent,
            metadata: metadata || new Map(),
            timestamp: new Date(),
            memoryType: MemoryType.EPHEMERAL
        };
    }

    async store(item: Omit<EphemeralMemoryUnit, 'memoryType'>): Promise<void> {
        if (Object.keys(this.items).length >= this.maxItems) {
            throw new Error('Memory is full');
        }

        const memoryUnit: EphemeralMemoryUnit = {
            ...item,
            memoryType: MemoryType.EPHEMERAL
        };

        const expiry = Date.now() + this.duration;
        this.items[memoryUnit.id] = { item: memoryUnit, expiry };

        // Cleanup expired items
        this.purgeExpired();
    }

    private purgeExpired(): void {
        const now = Date.now();
        for (const [id, entry] of Object.entries(this.items)) {
            if (entry.expiry <= now) {
                delete this.items[id];
            }
        }
    }

    async getAll(): Promise<EphemeralMemoryUnit[]> {
        this.purgeExpired();
        return Object.values(this.items).map(i => i.item);
    }

    async clear(): Promise<void> {
        this.items = {};
    }

    async retrieve(id: string): Promise<EphemeralMemoryUnit | null> {
        this.purgeExpired();
        const entry = this.items[id];
        return entry ? entry.item : null;
    }

    async query(filter: MemoryFilter): Promise<EphemeralMemoryUnit[]> {
        this.purgeExpired();
        return Object.values(this.items)
            .map(entry => entry.item)
            .filter(item => {
                if (filter.types && !filter.types.includes(item.memoryType)) return false;
                if (filter.query && !item.content.toString().includes(filter.query)) return false;
                return true;
            });
    }

    async delete(id: string): Promise<void> {
        delete this.items[id];
    }

    onEvent(callback: (unit: EphemeralMemoryUnit) => void): void {
        // Ephemeral memory typically doesn't use events, so this is a no-op
    }

    isMemoryUnitOfType(unit: any): unit is EphemeralMemoryUnit {
        return unit && typeof unit === 'object' && unit.memoryType === MemoryType.EPHEMERAL;
    }

    /** Get current number of items in memory */
    public size(): number {
        this.purgeExpired();
        return Object.keys(this.items).length;
    }

    /** Get maximum capacity */
    public capacity(): number {
        return this.maxItems;
    }
}

export { EphemeralMemory };
