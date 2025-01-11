import { IMemoryStorage, IMemoryIndex, IMemoryUnit, MemoryFilter, MemoryType } from '../../../src/core/memory/types';
import crypto from 'crypto';
import { logger } from '../../../src/core/Logger';

// Debug flag that can be controlled via environment variable
const DEBUG = process.env.DEBUG === 'true';

export class MockMemoryStorage implements IMemoryStorage {
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

        const clonedObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
            clonedObj[key] = this.deepCloneWithMaps(value);
        }
        return clonedObj;
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        const memory = this.memories.get(id);
        logger.debug('Retrieved memory %s: %o', id, memory);
        return memory || null;
    }

    async retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        logger.debug('Memories:', Array.from(this.memories.values()).map(m => ({
            id: m.id,
            content: m.content,
            metadata: Object.fromEntries(m.metadata.entries())
        })));
        logger.debug('Filter:', filter);
        
        const memories = Array.from(this.memories.values()).filter(memory => {
            // Type check
            if (filter.types && filter.types.length > 0) {
                const memoryType = memory.metadata.get('type');
                if (!memoryType || !filter.types.some(t => t === memoryType)) {
                    return false;
                }
            }

            // Metadata filters
            if (filter.metadataFilters) {
                const matchesAnyFilter = filter.metadataFilters.some(metadataFilter => {
                    return Array.from(metadataFilter.entries()).every(([key, value]) => {
                        const memoryValue = memory.metadata.get(key);
                        if (value instanceof Date && memoryValue instanceof Date) {
                            return value.getTime() === memoryValue.getTime();
                        }
                        if (value instanceof Map && memoryValue instanceof Map) {
                            return Array.from(value.entries()).every(([k, v]) => 
                                memoryValue.get(k) === v
                            );
                        }
                        return memoryValue === value;
                    });
                });
                if (!matchesAnyFilter) {
                    return false;
                }
            }

            // Query match
            const query = filter.query;
            if (typeof query === 'string' && query.length > 0) {
                const content = typeof memory.content === 'string' ? memory.content : JSON.stringify(memory.content);
                const contentMatch = content.toLowerCase().includes(query.toLowerCase());
                
                const tags = memory.metadata.get('tags');
                const tagsMatch = Array.isArray(tags) && tags.some(tag => 
                    typeof tag === 'string' && tag.toLowerCase().includes(query.toLowerCase())
                );
                
                if (!contentMatch && !tagsMatch) {
                    return false;
                }
            }

            // Priority check
            if (filter.minPriority !== undefined || filter.maxPriority !== undefined) {
                const priority = memory.priority || 0;
                if (filter.minPriority !== undefined && priority < filter.minPriority) {
                    return false;
                }
                if (filter.maxPriority !== undefined && priority > filter.maxPriority) {
                    return false;
                }
            }

            // Date range check
            if (filter.dateRange) {
                const timestamp = memory.timestamp.getTime();
                if (filter.dateRange.start && timestamp < filter.dateRange.start.getTime()) {
                    return false;
                }
                if (filter.dateRange.end && timestamp > filter.dateRange.end.getTime()) {
                    return false;
                }
            }

            return true;
        });

        // Clone memories to prevent reference issues
        return memories.map(memory => ({
            ...memory,
            metadata: new Map(memory.metadata.entries())
        }));
    }

    async update(memory: IMemoryUnit): Promise<void> {
        if (!(memory.metadata instanceof Map)) {
            memory.metadata = new Map(Object.entries(memory.metadata || {}));
        }
        logger.debug('Updating memory: %o', memory);
        this.memories.set(memory.id, memory);
    }

    async delete(id: string): Promise<void> {
        logger.debug('Deleting memory: %s', id);
        this.memories.delete(id);
    }

    async clear(): Promise<void> {
        logger.debug('Clearing all memories');
        this.memories.clear();
    }

    async batchStore(memories: IMemoryUnit[]): Promise<void> {
        for (const memory of memories) {
            await this.store(memory);
        }
    }

    async batchRetrieve(ids: string[]): Promise<(IMemoryUnit | null)[]> {
        return Promise.all(ids.map(id => this.retrieve(id)));
    }
}

export class MockMemoryIndex implements IMemoryIndex {
    private memories: Map<string, IMemoryUnit> = new Map();

    async add(memory: IMemoryUnit): Promise<void> {
        this.memories.set(memory.id, memory);
    }

    async search(query: string): Promise<string[]> {
        return Array.from(this.memories.keys());
    }

    async update(memory: IMemoryUnit): Promise<void> {
        this.memories.set(memory.id, memory);
    }

    async delete(id: string): Promise<void> {
        this.memories.delete(id);
    }

    async index(memory: IMemoryUnit): Promise<void> {
        await this.add(memory);
    }
}
