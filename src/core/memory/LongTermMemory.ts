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
        const memoryType = LongTermMemory.classifyMemoryType(content, metadata);
        
        switch (memoryType) {
            case MemoryType.EPISODIC:
            case MemoryType.SEMANTIC:
                await this.declarativeMemory.store(content, metadata);
                break;
            case MemoryType.PROCEDURAL:
                await this.proceduralMemory.store(content, metadata);
                break;
            default:
                throw new Error(`Invalid memory type: ${memoryType}`);
        }
    }

    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const memoryType = filter.metadata?.get('type') as MemoryType | undefined;
        
        switch (memoryType) {
            case MemoryType.EPISODIC:
            case MemoryType.SEMANTIC:
                return this.declarativeMemory.retrieve(filter);
            case MemoryType.PROCEDURAL:
                return this.proceduralMemory.retrieve(filter);
            default:
                // If no specific type is specified, retrieve from all
                const [declarativeResults, proceduralResults] = await Promise.all([
                    this.declarativeMemory.retrieve(filter),
                    this.proceduralMemory.retrieve(filter)
                ]);
                return [...declarativeResults, ...proceduralResults];
        }
    }

    private static classifyMemoryType(content: any, metadata?: Map<string, any>): MemoryType {
        // First check if type is explicitly specified in metadata
        if (metadata?.has('type')) {
            const type = metadata.get('type');
            if (Object.values(MemoryType).includes(type as MemoryType)) {
                return type as MemoryType;
            }
        }

        // Otherwise, try to infer from content structure
        if (typeof content === 'object') {
            if ('timeSequence' in content || 'location' in content || 'actors' in content) {
                return MemoryType.EPISODIC;
            }
            if ('concept' in content || 'relations' in content) {
                return MemoryType.SEMANTIC;
            }
            if ('procedure' in content || 'steps' in content || 'skills' in content) {
                return MemoryType.PROCEDURAL;
            }
        }

        // Default to episodic if can't determine
        return MemoryType.EPISODIC;
    }
}
