import { IMemory, MemoryFilter, MemoryType } from '../../types';
import { EphemeralMemoryItem } from './types';
import crypto from 'crypto';

class EphemeralMemory implements IMemory<EphemeralMemoryItem> {
    private duration: number;
    private items: { [id: string]: { item: EphemeralMemoryItem; expiry: number } };

    constructor(duration: number = 2000) { // Default duration is 2 seconds
        this.duration = duration;
        this.items = {};
    }

    createMemoryUnit(content: any, metadata?: Map<string, any>): EphemeralMemoryItem {
        return {
            id: crypto.randomUUID(),
            content,
            metadata: metadata || new Map(),
            timestamp: new Date(),
            source: 'ephemeral',
            type: 'ephemeral',
            memoryType: MemoryType.EPHEMERAL,
        };
    }

    async store(item: Omit<EphemeralMemoryItem, 'id' | 'timestamp' | 'source' | 'type' | 'memoryType'>): Promise<void> {
        const memoryUnit = this.createMemoryUnit(item.content, item.metadata);
        this.items[memoryUnit.id] = {
            item: memoryUnit,
            expiry: Date.now() + this.duration
        };
    }

    purgeExpired(): void {
        const now = Date.now();
        for (const id in this.items) {
            if (this.items[id].expiry <= now) {
                delete this.items[id];
            }
        }
    }

    async getAll(): Promise<EphemeralMemoryItem[]> {
        this.purgeExpired();
        return Object.values(this.items).map(i => i.item);
    }

    async clear(): Promise<void> {
        this.items = {};
    }

    async retrieve(id: string): Promise<EphemeralMemoryItem | null> {
        this.purgeExpired();
        const entry = this.items[id];
        return entry ? entry.item : null;
    }

    async query(filter: MemoryFilter): Promise<EphemeralMemoryItem[]> {
        this.purgeExpired();
        return Object.values(this.items)
            .map(entry => entry.item)
            .filter(item => {
                // Implement filter logic based on MemoryFilter criteria
                return true; // Placeholder for actual filtering logic
            });
    }

    async delete(id: string): Promise<void> {
        delete this.items[id];
    }

    onEvent(callback: (unit: EphemeralMemoryItem) => void): void {
        // Ephemeral memory typically doesn't use events, so this is a no-op
    }

    isMemoryUnitOfType(unit: any): unit is EphemeralMemoryItem {
        return unit && typeof unit === 'object' && 'type' in unit && unit.type === 'ephemeral';
    }
}

export { EphemeralMemory };
