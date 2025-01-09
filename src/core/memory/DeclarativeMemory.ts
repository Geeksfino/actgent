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
        const memoryType = DeclarativeMemory.classifyMemoryType(content, metadata);
        
        switch (memoryType) {
            case MemoryType.EPISODIC:
                await this.episodicMemory.store(content, metadata);
                break;
            case MemoryType.SEMANTIC:
                await this.semanticMemory.store(content, metadata);
                break;
            case MemoryType.CONTEXTUAL:
                await this.episodicMemory.store(content, metadata);
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

    protected async cleanup(): Promise<void> {
        // Declarative memory could implement importance-based cleanup
        // For now, just resolve
        return Promise.resolve();
    }

    private static classifyMemoryType(content: any, metadata?: Map<string, any>): MemoryType {
        // First check if type is explicitly specified in metadata
        if (metadata?.has('type')) {
            const type = metadata.get('type');
            if (type in MemoryType) {
                return type as MemoryType;
            }
        }

        // If no type is specified, try to infer from content
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
