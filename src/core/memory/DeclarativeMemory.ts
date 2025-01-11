import { LongTermMemory } from './LongTermMemory';
import { IMemoryUnit, IMemoryStorage, IMemoryIndex, MemoryFilter, MemoryType } from './types';

/**
 * Base class for declarative (explicit) memory types.
 * Includes both semantic (facts, concepts) and episodic (events, experiences) memories.
 */
export abstract class DeclarativeMemory extends LongTermMemory {
    protected subType: MemoryType;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.subType = MemoryType.DECLARATIVE;
    }

    /**
     * Store content with metadata in declarative memory
     */
    async store(content: any, metadata?: Map<string, any>): Promise<IMemoryUnit> {
        const metadataMap = new Map(metadata || []);
        metadataMap.set('subType', this.subType);
        metadataMap.set('declarative', true);

        return super.store(content, metadataMap);
    }

    /**
     * Retrieve memories based on filter
     */
    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return super.retrieve({
            ...filter,
            types: [this.subType],
            metadataFilters: [
                ...(filter.metadataFilters || []),
                new Map([['declarative', true]])
            ]
        });
    }

    /**
     * Clean up resources
     */
    async cleanup(): Promise<void> {
        // Implement cleanup logic specific to declarative memory
        await super.cleanup();
    }
}
