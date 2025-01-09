import { IMemoryStorage, IMemoryUnit, MemoryFilter, MemoryType } from '../types';
import crypto from 'crypto';
import { logger } from '../../Logger';

/**
 * In-memory implementation of IMemoryStorage
 */
export class InMemoryStorage implements IMemoryStorage {
    private memories: Map<string, IMemoryUnit> = new Map();

    async store(memory: IMemoryUnit): Promise<void> {
        // Deep clone memory to prevent reference issues
        const clonedMemory = {
            ...memory,
            id: memory.id || crypto.randomUUID(),
            content: this.deepCloneWithMaps(memory.content),
            metadata: memory.metadata instanceof Map ? 
                new Map(memory.metadata) : 
                new Map(Object.entries(memory.metadata || {})),
            timestamp: memory.timestamp || new Date(),
            accessCount: memory.accessCount || 0,
            lastAccessed: memory.lastAccessed || new Date()
        };
        
        // Ensure metadata type is set
        if (!clonedMemory.metadata.has('type')) {
            clonedMemory.metadata.set('type', MemoryType.WORKING);
        }
        
        logger.debug('Storing memory: %o', clonedMemory);
        this.memories.set(clonedMemory.id, clonedMemory);
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        const memory = this.memories.get(id);
        if (!memory) return null;

        // Update access count and timestamp
        memory.accessCount = (memory.accessCount || 0) + 1;
        memory.lastAccessed = new Date();

        return this.deepCloneWithMaps(memory);
    }

    async update(memory: IMemoryUnit): Promise<void> {
        if (!memory.id || !this.memories.has(memory.id)) {
            throw new Error(`Memory with id ${memory.id} not found`);
        }

        await this.store(memory);
    }

    async delete(id: string): Promise<void> {
        this.memories.delete(id);
    }

    async batchStore(memories: IMemoryUnit[]): Promise<void> {
        for (const memory of memories) {
            await this.store(memory);
        }
    }

    async batchRetrieve(ids: string[]): Promise<IMemoryUnit[]> {
        const memories: IMemoryUnit[] = [];
        for (const id of ids) {
            const memory = await this.retrieve(id);
            if (memory) memories.push(memory);
        }
        return memories;
    }

    async retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const results: IMemoryUnit[] = [];

        for (const memory of this.memories.values()) {
            if (this.matchesFilter(memory, filter)) {
                results.push(this.deepCloneWithMaps(memory));
            }
        }

        return results;
    }

    async clear(): Promise<void> {
        this.memories.clear();
    }

    private matchesFilter(memory: IMemoryUnit, filter: MemoryFilter): boolean {
        // Check types
        if (filter.types && filter.types.length > 0) {
            const memoryType = memory.metadata.get('type');
            if (!memoryType || !filter.types.includes(memoryType)) {
                return false;
            }
        }

        // Check metadata filters
        if (filter.metadataFilters) {
            for (const metadataFilter of filter.metadataFilters) {
                let matched = true;
                for (const [key, value] of metadataFilter.entries()) {
                    if (memory.metadata.get(key) !== value) {
                        matched = false;
                        break;
                    }
                }
                if (matched) return true;
            }
            return false;
        }

        return true;
    }

    private deepCloneWithMaps(obj: any): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Map) {
            return new Map(
                Array.from(obj.entries()).map(([key, value]) => [
                    key,
                    this.deepCloneWithMaps(value)
                ])
            );
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.deepCloneWithMaps(item));
        }

        const cloned: any = {};
        for (const [key, value] of Object.entries(obj)) {
            cloned[key] = this.deepCloneWithMaps(value);
        }
        return cloned;
    }
}
