import { ISimpleStorage } from '../storage';
import { IMemoryUnit, MemoryFilter } from '../base';

export class InMemorySimpleStorage implements ISimpleStorage {
    private items: Map<string, IMemoryUnit>;
    private maxCapacity: number;

    constructor(maxCapacity: number = 1000) {
        this.items = new Map();
        this.maxCapacity = maxCapacity;
    }

    async store(memory: IMemoryUnit): Promise<void> {
        if (this.items.size >= this.maxCapacity) {
            // Remove oldest item when at capacity
            const oldestKey = this.items.keys().next().value;
            if (oldestKey) {
                this.items.delete(oldestKey);
            }
        }
        this.items.set(memory.id, memory);
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        return this.items.get(id) || null;
    }

    async retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const results: IMemoryUnit[] = [];
        for (const memory of this.items.values()) {
            if (this.matchesFilter(memory, filter)) {
                results.push(memory);
            }
        }
        return results;
    }

    async update(memory: IMemoryUnit): Promise<void> {
        if (!this.items.has(memory.id)) {
            throw new Error(`Memory ${memory.id} not found`);
        }
        this.items.set(memory.id, memory);
    }

    async delete(id: string): Promise<void> {
        this.items.delete(id);
    }

    async add(id: string, memory: IMemoryUnit): Promise<void> {
        await this.store(memory);
    }

    async get(id: string): Promise<IMemoryUnit | null> {
        return this.retrieve(id);
    }

    async remove(id: string): Promise<void> {
        await this.delete(id);
    }

    async getAll(): Promise<IMemoryUnit[]> {
        return Array.from(this.items.values());
    }

    getSize(): number {
        return this.items.size;
    }

    getCapacity(): number {
        return this.maxCapacity;
    }

    async clear(): Promise<void> {
        this.items.clear();
    }

    private matchesFilter(memory: IMemoryUnit, filter: MemoryFilter): boolean {
        if (filter.memoryType && memory.memoryType !== filter.memoryType) {
            return false;
        }
        if (filter.createdAfter && memory.createdAt < filter.createdAfter) {
            return false;
        }
        if (filter.createdBefore && memory.createdAt > filter.createdBefore) {
            return false;
        }
        // Add more filter conditions as needed
        return true;
    }
}
