import { BaseMemorySystem } from './BaseMemorySystem';
import { EpisodicMemory } from './EpisodicMemory';
import { SemanticMemory } from './SemanticMemory';
import { IMemoryUnit, MemoryFilter, IMemoryStorage, IMemoryIndex, MemoryType } from './types';

export class DeclarativeMemory extends BaseMemorySystem {
    private episodicMemory: EpisodicMemory;
    private semanticMemory: SemanticMemory;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.episodicMemory = new EpisodicMemory(storage, index);
        this.semanticMemory = new SemanticMemory(storage, index);
    }

    async store(content: any, metadata?: Map<string, any>): Promise<void> {
        const memoryType = this.classifyMemoryType(content, metadata);
        
        switch (memoryType) {
            case MemoryType.EPISODIC:
                await this.episodicMemory.store(content, metadata);
                break;
            case MemoryType.SEMANTIC:
                await this.semanticMemory.store(content, metadata);
                break;
            default:
                throw new Error(`Invalid memory type: ${memoryType}`);
        }
    }

    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const memoryType = filter.metadata?.get('type') as MemoryType | undefined;
        
        if (memoryType === MemoryType.EPISODIC) {
            return this.episodicMemory.retrieve(filter);
        } else if (memoryType === MemoryType.SEMANTIC) {
            return this.semanticMemory.retrieve(filter);
        }

        // If no specific type is specified, retrieve from both
        const [episodicResults, semanticResults] = await Promise.all([
            this.episodicMemory.retrieve(filter),
            this.semanticMemory.retrieve(filter)
        ]);

        return [...episodicResults, ...semanticResults];
    }

    private classifyMemoryType(content: any, metadata?: Map<string, any>): MemoryType {
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
        }

        // Default to episodic if can't determine
        return MemoryType.EPISODIC;
    }
}
