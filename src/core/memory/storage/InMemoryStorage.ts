import { IMemoryStorage, IMemoryUnit, MemoryFilter, MemoryType, ConsolidationMetrics } from '../types';
import crypto from 'crypto';
import { logger } from '../../Logger';

/**
 * In-memory implementation of IMemoryStorage
 */
export class InMemoryStorage implements IMemoryStorage {
    private memories: Map<string, IMemoryUnit> = new Map();

    async store(memory: IMemoryUnit): Promise<void> {
        // Deep clone memory to prevent reference issues
        const clonedMemory: IMemoryUnit = {
            ...memory,
            id: memory.id || crypto.randomUUID(),
            content: this.deepCloneWithMaps(memory.content),
            metadata: memory.metadata instanceof Map ? 
                new Map(memory.metadata) : 
                new Map(Object.entries(memory.metadata || {})),
            timestamp: memory.timestamp || new Date(),
            priority: memory.priority || 1.0,
            consolidationMetrics: memory.consolidationMetrics || {
                semanticSimilarity: 0,
                contextualOverlap: 0,
                temporalProximity: 0,
                sourceReliability: 0,
                confidenceScore: 0,
                accessCount: 0,
                lastAccessed: new Date(),
                createdAt: new Date(),
                importance: 1.0,
                relevance: 1.0
            },
            associations: memory.associations || new Set<string>()
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

        // Update consolidation metrics
        if (memory.consolidationMetrics) {
            memory.consolidationMetrics.accessCount = (memory.consolidationMetrics.accessCount || 0) + 1;
            memory.consolidationMetrics.lastAccessed = new Date();
        }

        return this.deepCloneWithMaps(memory);
    }

    async update(memory: IMemoryUnit): Promise<void> {
        if (!memory.id || !this.memories.has(memory.id)) {
            throw new Error(`Memory with id ${memory.id} not found`);
        }

        await this.store(memory);
    }

    async delete(id: string): Promise<void> {
        const memory = this.memories.get(id);
        if (memory && memory.associations) {
            // Remove this memory from all associated memories
            for (const associatedId of memory.associations) {
                const associatedMemory = this.memories.get(associatedId);
                if (associatedMemory && associatedMemory.associations) {
                    associatedMemory.associations.delete(id);
                }
            }
        }
        this.memories.delete(id);
    }

    async batchStore(memories: IMemoryUnit[]): Promise<void> {
        for (const memory of memories) {
            await this.store(memory);
        }
    }

    async batchRetrieve(ids: string[]): Promise<(IMemoryUnit | null)[]> {
        const memories: (IMemoryUnit | null)[] = [];
        for (const id of ids) {
            const memory = await this.retrieve(id);
            memories.push(memory);
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

    private matchesFilter(memory: IMemoryUnit, filter: MemoryFilter): boolean {
        // Check ID
        if (filter.id && memory.id !== filter.id) return false;

        // Check memory types
        if (filter.types && filter.types.length > 0) {
            const memoryType = memory.metadata.get('type');
            if (!memoryType || !filter.types.includes(memoryType)) return false;
        }

        // Check priority range
        if (filter.minPriority !== undefined && (memory.priority || 0) < filter.minPriority) return false;
        if (filter.maxPriority !== undefined && (memory.priority || 0) > filter.maxPriority) return false;

        // Check date range
        if (filter.dateRange) {
            const timestamp = memory.timestamp.getTime();
            if (filter.dateRange.start && timestamp < filter.dateRange.start.getTime()) return false;
            if (filter.dateRange.end && timestamp > filter.dateRange.end.getTime()) return false;
        }

        // Check metadata filters
        if (filter.metadataFilters && filter.metadataFilters.length > 0) {
            for (const metadataFilter of filter.metadataFilters) {
                let matches = true;
                for (const [key, value] of metadataFilter.entries()) {
                    const memoryValue = memory.metadata.get(key);
                    if (memoryValue !== value) {
                        matches = false;
                        break;
                    }
                }
                if (!matches) return false;
            }
        }

        // Check content filters
        if (filter.contentFilters && filter.contentFilters.length > 0) {
            for (const contentFilter of filter.contentFilters) {
                let matches = true;
                for (const [key, value] of contentFilter.entries()) {
                    if (typeof memory.content !== 'object' || memory.content[key] !== value) {
                        matches = false;
                        break;
                    }
                }
                if (!matches) return false;
            }
        }

        return true;
    }

    private deepCloneWithMaps<T>(obj: T): T {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Map) {
            return new Map(Array.from(obj, ([key, val]) => [key, this.deepCloneWithMaps(val)])) as T;
        }

        if (obj instanceof Set) {
            return new Set(Array.from(obj).map(item => this.deepCloneWithMaps(item))) as T;
        }

        if (obj instanceof Date) {
            return new Date(obj) as T;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.deepCloneWithMaps(item)) as T;
        }

        const clonedObj = {} as T;
        for (const [key, value] of Object.entries(obj)) {
            clonedObj[key as keyof T] = this.deepCloneWithMaps(value);
        }

        return clonedObj;
    }
}
