import { BaseMemorySystem } from './BaseMemorySystem';
import { SemanticMemoryFactory } from './SemanticMemoryFactory';
import { IMemoryUnit, ISemanticMemoryUnit, MemoryFilter, IMemoryStorage, IMemoryIndex } from './types';

export class SemanticMemory extends BaseMemorySystem {
    private factory: SemanticMemoryFactory;
    private conceptGraph: Map<string, Set<string>>;

    constructor(storage: IMemoryStorage, index: IMemoryIndex) {
        super(storage, index);
        this.factory = new SemanticMemoryFactory();
        this.conceptGraph = new Map();
    }

    async store(content: any, metadata?: Map<string, any>): Promise<void> {
        const memory = this.factory.createMemoryUnit(content, metadata) as ISemanticMemoryUnit;
        await this.storage.store(memory);
        await this.index.index(memory);
        this.cache.set(memory.id, memory);
        this.updateConceptGraph(memory);
    }

    async retrieve(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const query = this.buildSemanticQuery(filter);
        const ids = await this.index.search(query);
        const memories: IMemoryUnit[] = [];

        for (const id of ids) {
            const cached = this.cache.get(id);
            if (cached) {
                memories.push(cached);
                continue;
            }

            const memory = await this.storage.retrieve(id);
            if (memory) {
                this.cache.set(id, memory);
                memories.push(memory);
            }
        }

        return memories;
    }

    async findRelatedConcepts(concept: string): Promise<string[]> {
        const relatedConcepts = this.conceptGraph.get(concept);
        return relatedConcepts ? Array.from(relatedConcepts) : [];
    }

    private updateConceptGraph(memory: ISemanticMemoryUnit): void {
        if (!this.conceptGraph.has(memory.concept)) {
            this.conceptGraph.set(memory.concept, new Set());
        }

        for (const [relation, concepts] of memory.relations) {
            const relatedSet = this.conceptGraph.get(memory.concept)!;
            concepts.forEach(concept => {
                relatedSet.add(concept);
                
                // Create bidirectional relationship
                if (!this.conceptGraph.has(concept)) {
                    this.conceptGraph.set(concept, new Set([memory.concept]));
                } else {
                    this.conceptGraph.get(concept)!.add(memory.concept);
                }
            });
        }
    }

    private buildSemanticQuery(filter: MemoryFilter): string {
        const queryParts = [];

        if (filter.metadata?.has('concept')) {
            const concept = filter.metadata.get('concept');
            if (concept) {
                queryParts.push(`concept:${concept}`);
            }
        }
        
        if (filter.query) {
            queryParts.push(filter.query);
        }
        
        if (filter.metadata) {
            for (const [key, value] of filter.metadata) {
                if (key !== 'concept') {
                    queryParts.push(`metadata.${key}:${value}`);
                }
            }
        }

        return queryParts.join(' AND ');
    }
}
