import { 
    MemoryType,
    MemoryFilter,
    IMemoryUnit
} from '../../base';
import { 
    IGraphNode, 
    IGraphEdge, 
    IGraphStorage,
    IGraphIndex,
    GraphFilter
} from '../../graph/data/types';
import { GraphTask } from '../../graph/types';
import { 
    ConceptNode, 
    ConceptRelation, 
    RelationType,
    ISemanticMemoryUnit 
} from './types';
import { DeclarativeMemory } from '../../DeclarativeMemory';
import { GraphLLMProcessor } from '../../graph/processing/episodic/processor';
import { MemoryGraph } from '../../graph/data/operations';
import { IMemoryStorage, IMemoryIndex } from '../../storage';
import crypto from 'crypto';
import { z } from 'zod';

interface INodeWithScore {
    id: string;
    score: number;
    node: IGraphNode;
}

/**
 * Adapter to make IGraphStorage work with IMemoryStorage
 */
class GraphStorageAdapter implements IMemoryStorage {
    constructor(private graphStorage: IGraphStorage) {}

    async store(memory: IMemoryUnit): Promise<void> {
        const node = await this.memoryUnitToGraphNode(memory);
        await this.graphStorage.addNode(node);
    }

    async retrieve(id: string): Promise<IMemoryUnit | null> {
        const node = await this.graphStorage.getNode(id);
        return node ? this.graphNodeToMemoryUnit(node) : null;
    }

    async retrieveByFilter(filter: MemoryFilter): Promise<IMemoryUnit[]> {
        const graphFilter: GraphFilter = {
            nodeTypes: ['concept'],
            metadata: filter.metadataFilters?.[0],
            maxResults: filter.limit
        };
        const { nodes } = await this.graphStorage.query(graphFilter);
        return nodes.map(node => this.graphNodeToMemoryUnit(node));
    }

    async update(memory: IMemoryUnit): Promise<void> {
        const node = await this.memoryUnitToGraphNode(memory);
        await this.graphStorage.updateNode(node.id, node);
    }

    async delete(id: string): Promise<void> {
        await this.graphStorage.deleteNode(id);
    }

    getSize(): number {
        return -1; // Unlimited
    }

    getCapacity(): number {
        return -1; // Unlimited
    }

    async add(id: string, memory: IMemoryUnit): Promise<void> {
        const node = await this.memoryUnitToGraphNode(memory);
        node.id = id;
        await this.graphStorage.addNode(node);
    }

    async get(id: string): Promise<IMemoryUnit | null> {
        return this.retrieve(id);
    }

    async remove(id: string): Promise<void> {
        return this.delete(id);
    }

    async clear(): Promise<void> {
        const { nodes } = await this.graphStorage.query({});
        for (const node of nodes) {
            await this.graphStorage.deleteNode(node.id);
        }
    }

    async getAll(): Promise<IMemoryUnit[]> {
        const { nodes } = await this.graphStorage.query({});
        return nodes.map(node => this.graphNodeToMemoryUnit(node));
    }

    private async memoryUnitToGraphNode(unit: IMemoryUnit): Promise<IGraphNode> {
        return {
            id: unit.id || crypto.randomUUID(),
            type: 'concept',
            content: unit.content,
            metadata: unit.metadata || new Map(),
            createdAt: unit.createdAt || new Date(),
            expiredAt: unit.expiredAt,
            validAt: unit.validAt
        };
    }

    private graphNodeToMemoryUnit(node: IGraphNode): IMemoryUnit {
        return {
            id: node.id,
            memoryType: MemoryType.SEMANTIC,
            content: node.content,
            metadata: node.metadata,
            createdAt: node.createdAt,
            expiredAt: node.expiredAt,
            validAt: node.validAt,
            timestamp: node.createdAt // Use createdAt as the legacy timestamp
        };
    }
}

/**
 * Adapter to make IGraphIndex work with IMemoryIndex
 */
class GraphIndexAdapter implements IMemoryIndex {
    constructor(private graphIndex: IGraphIndex) {}

    async add(unit: IMemoryUnit): Promise<void> {
        const node: IGraphNode = {
            id: unit.id,
            type: 'concept',
            content: unit.content,
            metadata: unit.metadata,
            createdAt: unit.createdAt,
            expiredAt: unit.expiredAt,
            validAt: unit.validAt
        };
        await this.graphIndex.indexNode(node);
    }

    async search(query: string): Promise<string[]> {
        // For now, just search by metadata
        return this.graphIndex.searchByMetadata({ query });
    }

    async update(unit: IMemoryUnit): Promise<void> {
        await this.add(unit); // Re-index the unit
    }

    async delete(id: string): Promise<void> {
        // No direct way to delete from index, will be handled by storage cleanup
    }

    async remove(id: string): Promise<void> {
        await this.delete(id);
    }
}

/**
 * Semantic memory implementation using graph-based storage
 */
export class SemanticMemory extends DeclarativeMemory {
    protected graphOps: MemoryGraph;
    protected llm: GraphLLMProcessor;

    constructor(graphStorage: IGraphStorage, graphIndex: IGraphIndex, llmClient?: any) {
        const storageAdapter = new GraphStorageAdapter(graphStorage);
        const indexAdapter = new GraphIndexAdapter(graphIndex);
        super(storageAdapter, indexAdapter, MemoryType.SEMANTIC);
        this.llm = new GraphLLMProcessor(llmClient);
        this.graphOps = new MemoryGraph(graphStorage, this.llm);
    }

    /**
     * Create a semantic memory unit
     */
    public createMemoryUnit<C>(
        content: string | C, 
        schema?: z.ZodType<C>, 
        metadata?: Map<string, any>
    ): IMemoryUnit {
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
                throw new Error(`Invalid memory content: ${validationResult.error}`);
            }
            validatedContent = validationResult.data as ConceptNode | ConceptRelation;
        }

        return {
            id: crypto.randomUUID(),
            content: validatedContent,
            metadata: metadata || new Map(),
            timestamp: now,
            memoryType: MemoryType.SEMANTIC,
            lastAccessed: now,
            accessCount: 0,
            createdAt: now,
            validAt: now
        };
    }

    /**
     * Check if a memory unit is of semantic type
     */
    public isMemoryUnitOfType(unit: IMemoryUnit): unit is ISemanticMemoryUnit {
        return unit.memoryType === MemoryType.SEMANTIC;
    }

    /**
     * Find semantically similar memories
     */
    public async findSimilar(query: string): Promise<ISemanticMemoryUnit[]> {
        // Use graph operations to find similar concepts
        const nodes = await this.graphOps.getNodes({
            nodeTypes: ['concept']
        } as GraphFilter);

        // Use LLM to rerank results
        const results = await this.llm.process<INodeWithScore[]>(GraphTask.RERANK_RESULTS, { 
            query,
            nodes,
            maxResults: 10
        });

        // Convert back to memory units
        return results.map((result: { node: IGraphNode }) => this.graphNodeToMemoryUnit(result.node) as ISemanticMemoryUnit);
    }

    /**
     * Find related concepts
     */
    public async findRelatedConcepts(conceptId: string): Promise<ISemanticMemoryUnit[]> {
        const { nodes } = await this.graphOps.getNeighbors(conceptId);
        return nodes.map(node => this.graphNodeToMemoryUnit(node));
    }

    /**
     * Add a relation between concepts
     */
    public async addRelation(sourceId: string, targetId: string, relationType: RelationType): Promise<string> {
        const relationId = crypto.randomUUID();
        const now = new Date();

        const relation: ConceptRelation = {
            id: relationId,
            type: relationType,
            sourceId,
            targetId,
            weight: 1.0,
            confidence: 1.0,
            properties: new Map([['source', 'direct-input'], ['lastVerified', now.toISOString()]])
        };

        const memoryUnit = await this.createMemoryUnit(relation);
        await this.storage.store(memoryUnit);
        return relationId;
    }

    /**
     * Find concepts valid at a specific time
     */
    public async findConceptsValidAt(date: Date): Promise<ISemanticMemoryUnit[]> {
        const nodes = await this.graphOps.getNodes({
            nodeTypes: ['concept'],
            temporal: {
                validAt: date
            }
        } as GraphFilter);
        
        return nodes.map((node: IGraphNode<any>) => this.graphNodeToMemoryUnit(node) as ISemanticMemoryUnit);
    }

    /**
     * Convert graph node to memory unit
     */
    private graphNodeToMemoryUnit(node: IGraphNode<any>): ISemanticMemoryUnit {
        return {
            id: node.id,
            memoryType: MemoryType.SEMANTIC,
            content: node.content,
            metadata: node.metadata,
            createdAt: node.createdAt,
            expiredAt: node.expiredAt,
            validAt: node.validAt,
            timestamp: node.createdAt // Use createdAt as the legacy timestamp
        };
    }

    private isConceptNode(node: IGraphNode<any>): node is IGraphNode<ConceptNode> {
        return node && node.content && node.type === 'concept';
    }

    private isConceptRelation(node: IGraphNode<any>): node is IGraphNode<ConceptRelation> {
        return node && node.content && node.type === 'relation';
    }
}
