import { BaseMemorySystem } from './BaseMemorySystem';
import { EpisodicMemory } from './EpisodicMemory';
import { SemanticMemory } from './semantic/SemanticMemory';
import { ConceptGraph } from './semantic/ConceptGraph';
import { IMemoryUnit, MemoryFilter, IMemoryStorage, IMemoryIndex, MemoryType } from './types';

export class DeclarativeMemory extends BaseMemorySystem {
    private episodicMemory: EpisodicMemory;
    private semanticMemory: SemanticMemory;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.episodicMemory = new EpisodicMemory(storage, index);
        const conceptGraph = new ConceptGraph();
        this.semanticMemory = new SemanticMemory(conceptGraph);
    }

    async store(content: any, metadata: Map<string, any> = new Map()): Promise<void> {
        const memoryType = DeclarativeMemory.classifyMemoryType(content, metadata);
        
        switch (memoryType) {
            case MemoryType.EPISODIC:
                await this.episodicMemory.store(content, metadata);
                break;
            case MemoryType.SEMANTIC:
                // Create a memory unit
                const memory: IMemoryUnit = {
                    id: crypto.randomUUID(),
                    content,
                    metadata: new Map(metadata),
                    timestamp: new Date(),
                    accessCount: 0,
                    lastAccessed: new Date()
                };

                // Store in semantic memory
                await this.semanticMemory.store(memory);
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
            // For now, just retrieve from semantic memory
            return this.semanticMemory.retrieve(filter.query || '');
        }

        // If no specific type is specified, retrieve from both
        const [episodicResults, semanticResults] = await Promise.all([
            this.episodicMemory.retrieve(filter),
            this.semanticMemory.retrieve(filter.query || '')
        ]);

        return [...episodicResults, ...semanticResults];
    }

    protected async cleanup(): Promise<void> {
        // Declarative memory could implement importance-based cleanup
        // For now, just resolve
        return Promise.resolve();
    }

    private static classifyMemoryType(content: any, metadata: Map<string, any>): MemoryType {
        // First check if type is explicitly specified in metadata
        if (metadata.has('type')) {
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
            if ('contextKey' in content || metadata.has('contextKey')) {
                return MemoryType.CONTEXTUAL;
            }
        }

        // Default to episodic memory
        return MemoryType.EPISODIC;
    }
}
