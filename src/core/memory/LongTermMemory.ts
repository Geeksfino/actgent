import { BaseMemorySystem } from './BaseMemorySystem';
import { DeclarativeMemory } from './DeclarativeMemory';
import { ProceduralMemory } from './ProceduralMemory';
import { IMemoryUnit, MemoryFilter, IMemoryStorage, IMemoryIndex, MemoryType } from './types';

export class LongTermMemory extends BaseMemorySystem {
    private declarativeMemory: DeclarativeMemory;
    private proceduralMemory: ProceduralMemory;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.declarativeMemory = new DeclarativeMemory(storage, index);
        this.proceduralMemory = new ProceduralMemory(storage, index);
    }

    async store(content: any, metadata?: Map<string, any>): Promise<void> {
        const memoryMetadata = new Map(metadata || []);
        if (!memoryMetadata.has('type')) {
            // Classify memory type based on content
            const memoryType = LongTermMemory.classifyMemoryType(content, memoryMetadata);
            memoryMetadata.set('type', memoryType);
        }

        const memory: IMemoryUnit = {
            id: crypto.randomUUID(),
            content,
            metadata: memoryMetadata,
            timestamp: new Date()
        };

        await this.storage.store(memory);
        await this.index.index(memory);
    }

    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        return this.storage.retrieveByFilter(filter);
    }

    private static classifyMemoryType(content: any, metadata?: Map<string, any>): MemoryType {
        // First check if type is explicitly specified in metadata
        if (metadata?.has('type')) {
            return metadata.get('type') as MemoryType;
        }

        // Try to infer from content structure
        if (content && typeof content === 'object') {
            if ('concept' in content || 'relations' in content) {
                return MemoryType.SEMANTIC;
            }
            if ('timeSequence' in content || 'location' in content || 'actors' in content) {
                return MemoryType.EPISODIC;
            }
            if ('contextKey' in content || metadata?.has('contextKey')) {
                return MemoryType.CONTEXTUAL;
            }
        }

        // Default to episodic memory
        return MemoryType.EPISODIC;
    }
}
