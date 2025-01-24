import { 
    MemoryType,
    MemoryFilter,
    IMemoryUnit
} from '../../base';
import { DeclarativeMemory } from '../../DeclarativeMemory';
import { IMemoryStorage, IMemoryIndex, IGraphStorage, IGraphIndex } from '../../storage';
import { ISemanticMemoryUnit, ConceptNode, ConceptRelation, RelationType, createSemanticMetadata } from './types';
import { GraphOperations } from '../../graph/operations';
import { IGraphNode, IGraphEdge } from '../../graph/types';
import { EmbeddingSearch } from '../../graph/search/embedding';
import { ResultReranker } from '../../graph/search/reranking';
import crypto from 'crypto';
import { z } from 'zod';

/**
 * Semantic memory implementation using graph-based storage
 */
export class SemanticMemory extends DeclarativeMemory {
    private graphOps: GraphOperations;
    private embeddingSearch: EmbeddingSearch;
    private reranker: ResultReranker;

    constructor(storage: IGraphStorage, index: IGraphIndex) {
        super(storage, index, MemoryType.SEMANTIC);
        this.graphOps = new GraphOperations(storage);
        this.embeddingSearch = new EmbeddingSearch();
        this.reranker = new ResultReranker();
    }

    /**
     * Create a semantic memory unit
     */
    public override createMemoryUnit<C>(
        content: string | C, 
        schema?: z.ZodType<C>, 
        metadata?: Map<string, any>
    ): ISemanticMemoryUnit {
        let validatedContent: ConceptNode | ConceptRelation;
        const now = new Date();

        if (typeof content === 'string') {
            validatedContent = {
                id: crypto.randomUUID(),
                name: content,
                type: 'concept',
                confidence: 1.0,
                source: 'direct-input',
                lastVerified: now,
                properties: new Map()
            } as ConceptNode;
        } else {
            if (!schema) {
                throw new Error('Schema is required for object content');
            }
            const validationResult = schema.safeParse(content);
            if (!validationResult.success) {
                throw new Error(`Invalid content: ${validationResult.error}`);
            }
            validatedContent = validationResult.data as ConceptNode | ConceptRelation;
            if (!this.isConceptNode(validatedContent) && !this.isConceptRelation(validatedContent)) {
                throw new Error('Content must be either a ConceptNode or ConceptRelation');
            }
        }

        const memoryUnit: ISemanticMemoryUnit = {
            id: crypto.randomUUID(),
            content: validatedContent,
            metadata: metadata || createSemanticMetadata(now),
            timestamp: now,
            memoryType: MemoryType.SEMANTIC
        };

        // Create graph node
        const graphNode: IGraphNode = {
            id: memoryUnit.id,
            type: 'concept',
            content: memoryUnit.content,
            metadata: memoryUnit.metadata,
            timestamp: memoryUnit.timestamp,
            memoryType: memoryUnit.memoryType,
            temporal: {
                eventTime: 'lastVerified' in validatedContent ? validatedContent.lastVerified : now,
                ingestionTime: now,
                validFrom: 'lastVerified' in validatedContent ? validatedContent.lastVerified : now
            }
        };

        // Store in graph
        (this.storage as IGraphStorage).addNode(graphNode);

        return memoryUnit;
    }

    /**
     * Add a concept to semantic memory
     */
    public async addConcept(
        name: string,
        type: string,
        properties: Map<string, any> = new Map()
    ): Promise<ConceptNode> {
        const concept: ConceptNode = {
            id: crypto.randomUUID(),
            name,
            type,
            confidence: 1.0,
            source: 'direct-input',
            lastVerified: new Date(),
            properties
        };

        // Store as memory unit and graph node
        const memoryUnit = this.createMemoryUnit(concept);
        await this.storage.store(memoryUnit);

        // If embedding is provided, index it
        if (properties.has('embedding')) {
            this.embeddingSearch.addEmbedding(concept.id, properties.get('embedding'));
        }

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
        const relation: ConceptRelation = {
            id: crypto.randomUUID(),
            sourceId,
            targetId,
            type,
            weight: properties.get('weight') || 1.0,
            confidence: properties.get('confidence') || 1.0,
            properties
        };

        // Create graph edge
        const edge: IGraphEdge = {
            id: relation.id,
            type: relation.type,
            sourceId: relation.sourceId,
            targetId: relation.targetId,
            metadata: relation.properties,
            temporal: {
                eventTime: new Date(),
                ingestionTime: new Date()
            },
            weight: relation.weight
        };

        // Store in graph
        await (this.storage as IGraphStorage).addEdge(edge);

        return relation;
    }

    /**
     * Find similar concepts using embeddings
     */
    public async findSimilarConcepts(conceptId: string): Promise<ConceptNode[]> {
        const concept = await this.retrieve(conceptId);
        if (!concept || !concept.metadata.get('embedding')) return [];

        const embedding = concept.metadata.get('embedding');
        const similarIds = await this.embeddingSearch.searchSimilar(embedding);
        
        const concepts = await Promise.all(
            similarIds.map(({ id }) => this.retrieve(id))
        );

        return concepts
            .filter((c): c is ISemanticMemoryUnit => 
                c !== null && c.memoryType === MemoryType.SEMANTIC)
            .map(c => c.content as ConceptNode)
            .filter((c): c is ConceptNode => 'name' in c);
    }

    /**
     * Find concepts by traversing the graph
     */
    public async findRelatedConcepts(conceptId: string, maxDistance: number = 2): Promise<ConceptNode[]> {
        const nodes = await this.graphOps.findRelated(conceptId, maxDistance);
        return nodes
            .filter(node => node.type === 'concept')
            .map(node => this.convertToConceptNode(node));
    }

    /**
     * Find path between concepts
     */
    public async findConceptPath(sourceId: string, targetId: string): Promise<ConceptRelation[]> {
        const edges = await this.graphOps.findPath(sourceId, targetId);
        return edges.map(edge => this.convertToConceptRelation(edge));
    }

    /**
     * Get subgraph around a concept
     */
    public async getConceptSubgraph(centerId: string, maxDepth: number = 2): Promise<{
        concepts: ConceptNode[];
        relations: ConceptRelation[];
    }> {
        const { nodes, edges } = await this.graphOps.getSubgraph(centerId, { maxDepth });
        
        return {
            concepts: nodes
                .filter(node => node.type === 'concept')
                .map(node => this.convertToConceptNode(node)),
            relations: edges.map(edge => this.convertToConceptRelation(edge))
        };
    }

    /**
     * Convert graph node to concept node
     */
    private convertToConceptNode(node: IGraphNode): ConceptNode {
        const content = node.content as ConceptNode;
        return {
            id: node.id,
            name: content.name,
            type: content.type,
            confidence: content.confidence,
            source: content.source,
            lastVerified: node.temporal.eventTime,
            properties: node.metadata
        };
    }

    /**
     * Convert graph edge to concept relation
     */
    private convertToConceptRelation(edge: IGraphEdge): ConceptRelation {
        return {
            id: edge.id,
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            type: edge.type as RelationType,
            weight: edge.weight || 1.0,
            confidence: edge.metadata.get('confidence') || 1.0,
            properties: edge.metadata
        };
    }

    /**
     * Check if a memory unit is of semantic type
     */
    public isMemoryUnitOfType(unit: IMemoryUnit): unit is ISemanticMemoryUnit {
        return unit.memoryType === MemoryType.SEMANTIC &&
               'content' in unit &&
               (this.isConceptNode(unit.content) || this.isConceptRelation(unit.content));
    }

    private isConceptNode(content: any): content is ConceptNode {
        return content && 
               typeof content === 'object' &&
               'name' in content &&
               'type' in content &&
               'properties' in content;
    }

    private isConceptRelation(content: any): content is ConceptRelation {
        return content && 
               typeof content === 'object' &&
               'sourceId' in content &&
               'targetId' in content &&
               'type' in content;
    }
}
