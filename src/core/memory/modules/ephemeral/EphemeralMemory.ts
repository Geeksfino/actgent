import { IMemory, MemoryFilter, MemoryType } from '../../base';
import { EphemeralMemoryUnit } from './types';
import { z } from 'zod';
import crypto from 'crypto';
import { Subject } from 'rxjs';
import { logger } from '../../../Logger';  // Fix logger import

class EphemeralMemory implements IMemory<EphemeralMemoryUnit> {
    private duration: number;
    private items: { [id: string]: { item: EphemeralMemoryUnit; expiry: number } };
    private maxItems: number;
    private events: Subject<EphemeralMemoryUnit>;

    constructor(duration: number = 2000, maxItems: number = 5) { // Default duration is 2 seconds, max 5 items
        this.duration = duration;
        this.maxItems = maxItems;
        this.items = {};
        this.events = new Subject<EphemeralMemoryUnit>();
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
        const currentSize = Object.keys(this.items).length;
        
        logger.debug(`Storing new item in ephemeral memory (current size: ${currentSize}/${this.maxItems})`);
        
        // Instead of throwing, try to make space first
        if (currentSize >= this.maxItems) {
            // Remove oldest items to make space
            const entries = Object.entries(this.items);
            entries.sort(([, a], [, b]) => a.expiry - b.expiry);
            
            // Remove 20% of items or at least 1
            const itemsToRemove = Math.max(1, Math.ceil(this.maxItems * 0.2));
            logger.info(`Memory full, removing ${itemsToRemove} oldest items to make space`);
            
            for (let i = 0; i < itemsToRemove && i < entries.length; i++) {
                delete this.items[entries[i][0]];
                logger.debug(`Removed old item ${entries[i][0]} (expiry: ${entries[i][1].expiry})`);
            }
        }

        const memoryUnit: EphemeralMemoryUnit = {
            ...item,
            memoryType: MemoryType.EPHEMERAL
        };

        const expiry = Date.now() + this.duration;
        this.items[memoryUnit.id] = { item: memoryUnit, expiry };
        logger.debug(`Stored item ${memoryUnit.id} with expiry ${expiry}`);
        
        this.events.next(memoryUnit);

        // Cleanup expired items
        this.purgeExpired();
        
        const newSize = Object.keys(this.items).length;
        logger.debug(`Current memory size after store: ${newSize}/${this.maxItems}`);
    }

    private purgeExpired(): void {
        const now = Date.now();
        let purgedCount = 0;
        
        logger.debug(`Checking for expired items (current time: ${now})`);
        
        for (const [id, entry] of Object.entries(this.items)) {
            if (entry.expiry <= now) {
                delete this.items[id];
                purgedCount++;
                logger.debug(`Purged expired item ${id} (expiry: ${entry.expiry})`);
            }
        }
        
        if (purgedCount > 0) {
            logger.info(`Purged ${purgedCount} expired items from ephemeral memory`);
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
        this.events.subscribe(callback);
    }

    isMemoryUnitOfType(unit: any): unit is EphemeralMemoryUnit {
        return unit && 
               typeof unit === 'object' && 
               'memoryType' in unit && 
               unit.memoryType === MemoryType.EPHEMERAL;
    }

    /**
     * Get current number of items in memory
     */
    size(): number {
        this.purgeExpired();  // First purge expired items
        return Object.keys(this.items).length;
    }

    /**
     * Get maximum capacity
     */
    capacity(): number {
        return this.maxItems;
    }
}

export { EphemeralMemory };
