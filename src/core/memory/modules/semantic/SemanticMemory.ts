import { 
    MemoryType,
    MemoryFilter,
} from '../../base';
import { DeclarativeMemory } from '../../DeclarativeMemory';
import { IMemoryStorage, IMemoryIndex } from '../../storage';
import { ISemanticMemoryUnit, ConceptNode, ConceptRelation, RelationType, createSemanticMetadata } from './types';
import { SemanticMemoryFactory } from './SemanticMemoryFactory';
import crypto from 'crypto';
import { z } from 'zod';

/**
 * Semantic memory implementation
 */
export class SemanticMemory extends DeclarativeMemory {
    private conceptGraph: Map<string, ConceptNode>;
    private relationGraph: Map<string, ConceptRelation>;

    constructor(
        storage: IMemoryStorage, 
        index: IMemoryIndex,
    ) {
        super(storage, index, MemoryType.SEMANTIC);
        this.conceptGraph = new Map();
        this.relationGraph = new Map();
    }

    /**
     * Create a semantic memory unit
     */
    public createMemoryUnit<C>(
        content: C | string, 
        schema?: z.ZodType<C>, 
        metadata?: Map<string, any>
    ): ISemanticMemoryUnit {
        let validatedContent: ConceptNode | ConceptRelation;

        if (typeof content === 'string') {
            validatedContent = {
                id: crypto.randomUUID(),
                name: content,
                confidence: 1.0,
                source: 'direct-input',
                lastVerified: new Date(),
                properties: new Map()
            } as ConceptNode;
        } else {
            if (!schema) {
                throw new Error('Schema is required for object content');
            }
            const validationResult = schema.safeParse(content);
            if (!validationResult.success) {
                throw new Error(`Invalid semantic memory content: ${validationResult.error}`);
            }
            
            if (!this.isValidSemanticContent(validationResult.data)) {
                throw new Error('Content must be either a ConceptNode or ConceptRelation');
            }
            validatedContent = validationResult.data;
        }

        const now = new Date();
        const memoryMetadata = createSemanticMetadata(now);
        if (metadata) {
            for (const [key, value] of metadata) {
                memoryMetadata.set(key, value);
            }
        }

        return {
            id: crypto.randomUUID(),
            content: validatedContent,
            metadata: memoryMetadata,
            timestamp: now,
            memoryType: MemoryType.SEMANTIC
        };
    }

    private isValidSemanticContent(content: any): content is ConceptNode | ConceptRelation {
        if (!content || typeof content !== 'object') return false;
        
        // Check if it's a ConceptNode
        if ('name' in content && 'properties' in content) {
            return true;
        }
        
        // Check if it's a ConceptRelation
        if ('sourceId' in content && 'targetId' in content && 'relationType' in content) {
            return true;
        }
        
        return false;
    }

    /**
     * Construct a semantic memory unit
     */
    public constructMemoryUnit(content: any, metadata?: Map<string, any>): ISemanticMemoryUnit {
        return this.createMemoryUnit(content, z.any(), metadata);
    }

    /**
     * Store a semantic memory unit
     */
    public async store(content: Omit<ISemanticMemoryUnit, 'id' | 'timestamp' | 'memoryType'>): Promise<void> {
        const memoryUnit = this.createMemoryUnit(content.content, z.any(), content.metadata);
        Object.assign(memoryUnit, content);
        await this.storage.store(memoryUnit);
    }

    /**
     * Add a concept to semantic memory
     */
    public async addConcept(name: string, type: string, properties: Map<string, any> = new Map()): Promise<ConceptNode> {
        const content = {
            type: 'concept',
            name,
            conceptType: type,
            properties
        };
        const unit = this.constructMemoryUnit(content);
        const concept = unit.content as ConceptNode;
        this.conceptGraph.set(concept.id, concept);
        await this.store(unit);
        return concept;
    }

    /**
     * Add a relation between concepts
     */
    public async addRelation(
        sourceId: string,
        targetId: string,
        type: RelationType,
        properties: Map<string, any> = new Map()
    ): Promise<ConceptRelation> {
        const content = {
            type: 'relation',
            sourceId,
            targetId,
            relationType: type,
            properties
        };
        const unit = this.constructMemoryUnit(content);
        const relation = unit.content as ConceptRelation;
        this.relationGraph.set(relation.id, relation);
        await this.store(unit);
        return relation;
    }

    /**
     * Retrieve memory by ID
     */
    public async retrieve(id: string): Promise<ISemanticMemoryUnit | null> {
        const memory = await this.storage.retrieve(id);
        if (memory && memory.metadata.get('type') === MemoryType.SEMANTIC) {
            return memory as ISemanticMemoryUnit;
        }
        return null;
    }

    /**
     * Retrieve memories by filter
     */
    public async retrieveByFilter(filter: MemoryFilter): Promise<ISemanticMemoryUnit[]> {
        const memories = await this.storage.retrieveByFilter(filter);
        return memories.filter(memory => memory.metadata.get('type') === MemoryType.SEMANTIC) as ISemanticMemoryUnit[];
    }

    /**
     * Get all concepts
     */
    public async getAllConcepts(): Promise<ConceptNode[]> {
        const memories = await this.retrieveByFilter({ types: [MemoryType.SEMANTIC] });
        return memories.map(memory => memory.content as ConceptNode);
    }

    /**
     * Get all relations
     */
    public async getAllRelations(): Promise<ConceptRelation[]> {
        const memories = await this.retrieveByFilter({ types: [MemoryType.SEMANTIC] });
        return memories.map(memory => memory.content as ConceptRelation);
    }

    isMemoryUnitOfType(unit: any): unit is ISemanticMemoryUnit {
        return unit && 
               typeof unit === 'object' && 
               unit.memoryType === MemoryType.SEMANTIC &&
               this.isValidSemanticContent(unit.content);
    }
}
