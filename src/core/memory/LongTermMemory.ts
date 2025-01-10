import { BaseMemorySystem } from './BaseMemorySystem';
import { DeclarativeMemory } from './DeclarativeMemory';
import { ProceduralMemory } from './ProceduralMemory';
import { IMemoryUnit, MemoryFilter, IMemoryStorage, IMemoryIndex, MemoryType } from './types';

export class LongTermMemory extends BaseMemorySystem {
    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.startCleanupTimer();
    }

    /**
     * Store content in long-term memory
     */
    public async store(content: any, metadata: any = {}): Promise<void> {
        const metadataMap = metadata instanceof Map ? metadata : new Map(Object.entries(metadata || {}));
        
        // Determine memory type based on content and metadata
        let type = metadataMap.get('type');
        if (!type) {
            // Default classification logic
            if (typeof content === 'object') {
                if ('event' in content || 'temporal' in content || 'location' in content) {
                    type = MemoryType.EPISODIC;
                } else if ('procedure' in content || 'steps' in content) {
                    type = MemoryType.PROCEDURAL;
                } else if ('concept' in content || 'relations' in content) {
                    type = MemoryType.SEMANTIC;
                } else {
                    // Default to EPISODIC if no clear indicators
                    type = MemoryType.EPISODIC;
                }
            } else {
                // Default to EPISODIC for non-object content
                type = MemoryType.EPISODIC;
            }
            metadataMap.set('type', type);
        }

        // Set memory ID if not provided
        if (!metadataMap.has('id')) {
            metadataMap.set('id', this.generateId());
        }

        await this.storeWithType(content, metadataMap, type);
    }

    /**
     * Retrieve long-term memories
     */
    public async retrieve(idOrFilter: string | MemoryFilter): Promise<IMemoryUnit[]> {
        if (typeof idOrFilter === 'string') {
            const memory = await this.storage.retrieve(idOrFilter);
            if (!memory || 
                ![MemoryType.SEMANTIC, MemoryType.EPISODIC, MemoryType.PROCEDURAL].includes(memory.metadata.get('type'))) {
                return [];
            }
            memory.accessCount = (memory.accessCount || 0) + 1;
            memory.lastAccessed = new Date();
            await this.update(memory);
            return [memory];
        }

        // For long-term memory, we can retrieve multiple types
        const types = idOrFilter.types || [MemoryType.SEMANTIC, MemoryType.EPISODIC, MemoryType.PROCEDURAL];
        const allMemories = await Promise.all(
            types.map(type => this.retrieveWithType(idOrFilter, type))
        );

        return allMemories.flat();
    }

    /**
     * Clean up old or irrelevant memories
     */
    public async cleanup(): Promise<void> {
        await this.performCleanup();
    }

    protected async performCleanup(): Promise<void> {
        // Implement cleanup logic for long-term memory
        // For now, we don't clean up long-term memories as they should be permanent
        // unless explicitly deleted
    }
}
