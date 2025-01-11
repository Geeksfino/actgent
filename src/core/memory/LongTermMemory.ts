import { AbstractMemory } from './AbstractMemory';
import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryFilter, MemoryType } from './types';

/**
 * Base class for long-term memory types
 */
export abstract class LongTermMemory extends AbstractMemory {
    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index, MemoryType.LONG_TERM);
    }

    /**
     * Store content with metadata in long-term memory
     */
    async store(content: any, metadata?: Map<string, any>): Promise<IMemoryUnit> {
        const memoryId = this.generateId();
        const metadataMap = new Map(metadata || []);
        metadataMap.set('id', memoryId);
        metadataMap.set('type', this.memoryType);

        const memory: IMemoryUnit = {
            id: memoryId,
            content,
            metadata: metadataMap,
            timestamp: new Date()
        };

        await this.storage.store(memory);
        this.cache.set(memoryId, memory);
        return memory;
    }

    /**
     * Retrieve memories based on filter
     */
    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return this.storage.retrieveByFilter({
            ...filter,
            types: [this.memoryType]
        });
    }

    /**
     * Clean up resources
     */
    async cleanup(): Promise<void> {
        // Implement cleanup logic specific to long-term memory
        this.cache.clear();
    }
}
