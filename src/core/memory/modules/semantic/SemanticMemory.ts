import { 
    MemoryType,
    MemoryFilter,
    IMemoryUnit
} from '../../base';
import { DeclarativeMemory } from '../../DeclarativeMemory';
import { IMemoryStorage, IMemoryIndex, IGraphStorage, IGraphIndex } from '../../storage';
import { ISemanticMemoryUnit, ConceptNode, ConceptRelation, RelationType } from './types';
import { GraphOperations } from '../../graph/operations';
import { IGraphNode, IGraphEdge, TraversalOptions, GraphFilter } from '../../graph/types';
import { EmbeddingSearch } from '../../graph/search/embedding';
import { ResultReranker } from '../../graph/search/reranking';
import { GraphLLMProcessor } from '../../graph/llm/processor';
import { GraphTask } from '../../graph/llm/types';
import crypto from 'crypto';
import { z } from 'zod';

interface INodeWithScore {
    id: string;
    score: number;
    node: IGraphNode;
}

/**
 * Semantic memory implementation using graph-based storage
 */
export class SemanticMemory extends DeclarativeMemory {
    protected graphOps: GraphOperations;
    protected embeddingSearch: EmbeddingSearch;
    protected reranker: ResultReranker;
    protected llm: GraphLLMProcessor;
    protected storage: IGraphStorage;
    protected index: IGraphIndex;

    constructor(storage: IGraphStorage, index: IGraphIndex, llmClient?: any) {
        super(storage, index, MemoryType.SEMANTIC);
        this.storage = storage;
        this.index = index;
        this.llm = new GraphLLMProcessor(llmClient);
        this.graphOps = new GraphOperations(storage, this.llm);
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

        // Create memory unit with validated content
        const memoryUnit: ISemanticMemoryUnit = {
            id: crypto.randomUUID(),
            content: validatedContent,
            metadata: metadata || new Map(),
            timestamp: now,
            memoryType: MemoryType.SEMANTIC,
            createdAt: now,  // Add required createdAt field
            validAt: now    // Semantic memories are valid from creation by default
        };

        // Create graph node
        const graphNode: IGraphNode = {
            id: memoryUnit.id,
            type: 'concept',
            content: memoryUnit.content,
            metadata: memoryUnit.metadata,
            timestamp: memoryUnit.timestamp,
            memoryType: memoryUnit.memoryType,
            createdAt: now,
            validAt: now
        };

        // Store in graph
        (this.storage as IGraphStorage).addNode(graphNode);

        return memoryUnit;
    }

    /**
     * Check if a memory unit is of semantic type
     */
    isMemoryUnitOfType(unit: IMemoryUnit): unit is ISemanticMemoryUnit {
        return unit.memoryType === MemoryType.SEMANTIC &&
               (this.isConceptNode(unit.content) || this.isConceptRelation(unit.content));
    }

    /**
     * Find semantically similar memories
     */
    async findSimilar(query: string): Promise<IMemoryUnit[]> {
        // Get embedding from LLM processor
        const embedding = await this.llm.process(
            GraphTask.PREPARE_FOR_EMBEDDING,
            { text: query },
            z.array(z.number())
        );
        
        // Search using embedding
        const nodeIds = this.embeddingSearch.search(embedding);
        
        // Retrieve full nodes
        const nodes = await Promise.all(
            nodeIds.map(id => this.storage.retrieve(id))
        );
        
        return nodes.filter((node): node is IMemoryUnit => node !== null);
    }

    /**
     * Find memories connected in the knowledge graph
     */
    async findConnected(memoryId: string, options?: TraversalOptions): Promise<IMemoryUnit[]> {
        return this.graphOps.getNeighbors(memoryId, options);
    }

    /**
     * Find memories within a time range
     */
    async findInTimeRange(start: Date, end: Date): Promise<IMemoryUnit[]> {
        return this.storage.findNodes({
            nodeTypes: ['concept'],
            temporal: {
                validAfter: start,
                validBefore: end
            }
        });
    }

    /**
     * Get a memory's context including related memories and associations
     */
    async getMemoryContext(memoryId: string): Promise<{
        memory: IMemoryUnit;
        related: IMemoryUnit[];
        temporal: IMemoryUnit[];
    }> {
        const memory = await this.storage.retrieve(memoryId);
        if (!memory) throw new Error(`Memory ${memoryId} not found`);

        const [related, temporal] = await Promise.all([
            this.findConnected(memoryId),
            this.findInTimeRange(
                new Date(memory.timestamp.getTime() - 24 * 60 * 60 * 1000),
                new Date(memory.timestamp.getTime() + 24 * 60 * 60 * 1000)
            )
        ]);

        return {
            memory,
            related,
            temporal: temporal.filter((m: IMemoryUnit) => m.id !== memoryId)
        };
    }

    /**
     * Find similar concepts using embeddings
     */
    async findSimilarConcepts(conceptId: string): Promise<ISemanticMemoryUnit[]> {
        const concept = await this.storage.retrieve(conceptId);
        if (!concept) throw new Error(`Concept ${conceptId} not found`);
        if (!this.isMemoryUnitOfType(concept)) {
            throw new Error(`Memory ${conceptId} is not a semantic memory unit`);
        }

        const embedding = concept.metadata.get('embedding');
        if (!embedding) throw new Error(`No embedding found for concept ${conceptId}`);

        const nodeIds = this.embeddingSearch.search(embedding);
        const nodes = await Promise.all(
            nodeIds.map(id => this.storage.retrieve(id))
        );

        return nodes
            .filter((node): node is ISemanticMemoryUnit => 
                node !== null && 
                this.isMemoryUnitOfType(node)
            );
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
     * Convert graph node to concept node
     */
    private convertToConceptNode(node: IGraphNode): ConceptNode {
        const content = node.content as ConceptNode;
        const validAt = node.validAt || node.createdAt;
        return {
            id: node.id,
            name: content.name,
            type: content.type,
            confidence: content.confidence,
            source: content.source,
            lastVerified: validAt,
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

    private isConceptNode(content: any): content is ConceptNode {
        return content && 
               typeof content === 'object' &&
               'name' in content &&
               'confidence' in content;
    }

    private isConceptRelation(content: any): content is ConceptRelation {
        return content && 
               typeof content === 'object' &&
               'sourceId' in content &&
               'targetId' in content &&
               'type' in content;
    }

    async addConcept(content: string, metadata?: Map<string, any>): Promise<string> {
        const now = new Date();
        const node: IGraphNode = {
            id: crypto.randomUUID(),
            type: 'concept',
            content,
            metadata: metadata || new Map(),
            timestamp: now,
            memoryType: MemoryType.SEMANTIC,
            createdAt: now,
            validAt: now  // Concept's business time is when it was created
        };
        
        return this.storage.addNode(node);
    }

    async addRelation(sourceId: string, targetId: string, relation: string): Promise<string> {
        const now = new Date();
        const edge: IGraphEdge = {
            id: crypto.randomUUID(),
            type: relation,
            sourceId: sourceId,
            targetId: targetId,
            metadata: new Map(),
            createdAt: now,
            validAt: now,
            episodeIds: [],  // Add required episodeIds
        };
        
        return this.storage.addEdge(edge);
    }

    async findConceptsValidAt(date: Date): Promise<IGraphNode[]> {
        const filter: GraphFilter = {
            nodeTypes: ['concept'],
            temporal: {
                validAfter: date,
                validBefore: date
            }
        };
        
        return this.storage.findNodes(filter);
    }

    protected toSemanticContent(node: IGraphNode): ConceptNode | ConceptRelation {
        const validAt = node.validAt || node.createdAt;
        if (node.type === 'concept') {
            return {
                id: node.id,
                name: (node.content as ConceptNode).name,
                type: 'concept',
                confidence: node.metadata.get('confidence') || 1.0,
                source: node.metadata.get('source') || 'system',
                lastVerified: validAt,
                properties: node.metadata,
                weight: 1.0  // Default weight for concept nodes
            } as ConceptNode;
        } else {
            return {
                id: node.id,
                sourceId: (node.content as ConceptRelation).sourceId,
                targetId: (node.content as ConceptRelation).targetId,
                type: (node.content as ConceptRelation).type,
                weight: node.metadata.get('weight') || 1.0,
                confidence: node.metadata.get('confidence') || 1.0,
                properties: node.metadata
            } as ConceptRelation;
        }
    }
}
