import { 
    IMemoryUnit, 
    MemoryType, 
    ConceptNode, 
    ConceptRelation, 
    MemoryFilter,
    RelationType
} from '../types';
import { AbstractMemory } from '../AbstractMemory';
import { IMemoryStorage, IMemoryIndex } from '../types';
import { IConceptGraph } from './IConceptGraph';
import { logger } from '../../Logger';
import crypto from 'crypto';

/**
 * Semantic memory implementation
 */
export class SemanticMemory extends AbstractMemory {
    private conceptGraph: IConceptGraph;

    constructor(
        storage: IMemoryStorage, 
        index: IMemoryIndex,
        conceptGraph: IConceptGraph
    ) {
        super(storage, index, MemoryType.SEMANTIC);
        this.conceptGraph = conceptGraph;
    }

    /**
     * Add a concept to semantic memory
     */
    public async addConcept(concept: string, properties: Map<string, any>): Promise<void> {
        const node: ConceptNode = {
            id: crypto.randomUUID(),
            name: concept,
            confidence: 1.0,
            source: 'user',
            lastVerified: new Date(),
            properties
        };

        await this.conceptGraph.addNode(node);
    }

    /**
     * Add a relationship between concepts
     */
    public async addRelation(
        sourceConcept: string,
        targetConcept: string,
        type: RelationType,
        weight: number = 1.0
    ): Promise<void> {
        const relation: ConceptRelation = {
            id: crypto.randomUUID(),
            sourceId: sourceConcept,
            targetId: targetConcept,
            type,
            weight,
            confidence: 1.0
        };

        await this.conceptGraph.addRelation(relation);
    }

    /**
     * Get related concepts
     */
    public async getRelated(concept: string): Promise<ConceptNode[]> {
        return this.conceptGraph.getNeighbors(concept);
    }

    /**
     * Store semantic memory
     */
    public override async store(content: any, metadata?: Map<string, any>): Promise<IMemoryUnit> {
        const metadataMap = metadata instanceof Map ? metadata : new Map(Object.entries(metadata || {}));
        
        // Set semantic memory specific metadata
        metadataMap.set('type', MemoryType.SEMANTIC);
        metadataMap.set('confidence', 1.0);
        metadataMap.set('source', 'user');
        metadataMap.set('lastVerified', new Date());

        return super.store(content, metadataMap);
    }

    /**
     * Override retrieve to handle both string and filter inputs
     */
    public override async retrieve(filter: MemoryFilter | string | { concept: string }): Promise<IMemoryUnit[]> {
        if (typeof filter === 'string') {
            // Search by concept name
            return this.retrieveByConcept(filter);
        } else if ('concept' in filter) {
            // Search by concept object
            return this.retrieveByConcept(filter.concept);
        } else {
            // Use parent class retrieve with filter
            return super.retrieve(filter);
        }
    }

    /**
     * Find concepts matching a pattern
     */
    public async findConcepts(pattern: string): Promise<ConceptNode[]> {
        return this.conceptGraph.findConcepts(pattern);
    }

    /**
     * Find relations matching criteria
     */
    public async findRelations(criteria: {
        type?: RelationType;
        source?: string;
        target?: string;
    }): Promise<ConceptRelation[]> {
        return this.conceptGraph.findRelations(criteria);
    }

    /**
     * Retrieve memories by concept
     */
    private async retrieveByConcept(concept: string): Promise<IMemoryUnit[]> {
        const nodes = await this.conceptGraph.getNeighbors(concept);
        const nodeIds = nodes.map(node => node.id);
        
        return super.retrieve({
            types: [MemoryType.SEMANTIC],
            ids: nodeIds
        });
    }

    /**
     * Update concept properties
     */
    public async updateConcept(concept: string, properties: Map<string, any>): Promise<void> {
        const node = await this.conceptGraph.getNode(concept);
        if (node) {
            node.properties = properties;
            node.lastVerified = new Date();
            await this.conceptGraph.addNode(node);
        }
    }

    /**
     * Update relationship weight
     */
    public async updateRelation(
        sourceConcept: string,
        targetConcept: string,
        weight: number
    ): Promise<void> {
        const relation = await this.conceptGraph.getRelation(sourceConcept, targetConcept);
        if (relation) {
            relation.weight = weight;
            await this.conceptGraph.addRelation(relation);
        }
    }

    /**
     * Delete concept and its relationships
     */
    public async deleteConcept(concept: string): Promise<void> {
        await this.conceptGraph.deleteNode(concept);
    }

    /**
     * Delete relationship between concepts
     */
    public async deleteRelation(sourceConcept: string, targetConcept: string): Promise<void> {
        const relation = await this.conceptGraph.getRelation(sourceConcept, targetConcept);
        if (relation) {
            await this.conceptGraph.deleteRelation(relation);
        }
    }

    /**
     * Get all concepts
     */
    public async getAllConcepts(): Promise<ConceptNode[]> {
        return this.conceptGraph.getAllNodes();
    }

    /**
     * Get all relationships
     */
    public async getAllRelations(): Promise<ConceptRelation[]> {
        return this.conceptGraph.getAllRelations();
    }

    /**
     * Find path between concepts
     */
    public async findPath(
        sourceConcept: string,
        targetConcept: string,
        maxDepth: number = 5
    ): Promise<ConceptNode[]> {
        return this.conceptGraph.findPath(sourceConcept, targetConcept);
    }

    /**
     * Cleanup any resources
     */
    public override async cleanup(): Promise<void> {
        await this.conceptGraph.clear();
    }
}
