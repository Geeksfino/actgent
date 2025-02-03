import { 
    MemoryType,
    MemoryFilter,
    IMemoryUnit
} from '../../base';
import { DeclarativeMemory } from '../../DeclarativeMemory';
import { 
    IGraphStorage, 
    IGraphIndex, 
    IGraphNode, 
    IGraphEdge, 
    GraphFilter,
    TraversalOptions
} from '../../graph/data/types';
import { IMemoryStorage, IMemoryIndex } from '../../storage';
import { IEpisodicMemoryUnit } from './types';
import { MemoryGraph } from '../../graph/data/operations';
import { GraphLLMProcessor } from '../../graph/processing/episodic/processor';
import { GraphTask } from '../../graph/types';
import { SearchResult } from '../../graph/processing/episodic/types';
import {
    EpisodicNodeType,
    EpisodicEdgeType,
    EpisodeNode,
    LocationNode,
    ActorNode,
    ActionNode,
    EpisodicEdge,
    memoryUnitToGraphNode,
    graphNodeToMemoryUnit
} from './graph';
import crypto from 'crypto';
import * as z from 'zod';
import { EmotionalContextImpl } from '../../context/EmotionalContextImpl';

interface ConsolidationResult extends IEpisodicMemoryUnit {
    sourceEpisodeIds: string[];  // IDs of the episodes that were consolidated
}

/**
 * Episodic memory implementation using graph-based storage
 * 
 * Key features:
 * 1. Graph-based representation of episodes with locations, actors, and actions
 * 2. Temporal and semantic relationships between episodes
 * 3. LLM-powered memory consolidation and retrieval
 * 4. Efficient indexing of embeddings and metadata
 */
export class EpisodicMemory extends DeclarativeMemory {
    protected graphStorage: IGraphStorage;
    protected graphIndex: IGraphIndex;
    protected graphOps: MemoryGraph;
    protected llm: GraphLLMProcessor;

    constructor(storage: IGraphStorage, index: IGraphIndex, llmClient?: any) {
        // Create wrapper adapters for IMemoryStorage and IMemoryIndex
        const memoryStorage: IMemoryStorage = {
            store: async (unit: IMemoryUnit) => {
                const node = memoryUnitToGraphNode(unit as IEpisodicMemoryUnit);
                await storage.addNode(node);
            },
            retrieve: async (id: string) => {
                const node = await storage.getNode(id);
                return node ? graphNodeToMemoryUnit(node as EpisodeNode) : null;
            },
            retrieveByFilter: async (filter: MemoryFilter) => {
                const { nodes } = await storage.query(filter);
                return nodes
                    .filter((node: IGraphNode): node is EpisodeNode => node.type === EpisodicNodeType.EPISODE)
                    .map(node => graphNodeToMemoryUnit(node));
            },
            update: async (unit: IMemoryUnit) => {
                const node = memoryUnitToGraphNode(unit as IEpisodicMemoryUnit);
                await storage.updateNode(node.id, node);
            },
            delete: async (id: string) => {
                await storage.deleteNode(id);
            },
            remove: async (id: string) => {
                await storage.deleteNode(id);
            },
            clear: async () => {
                // Delete all nodes by querying and deleting them
                const { nodes } = await storage.query({});
                for (const node of nodes) {
                    await storage.deleteNode(node.id);
                }
            },
            getSize: () => {
                // Return a fixed size or -1 for unlimited
                // This is a synchronous operation as required by the interface
                return -1;
            },
            getCapacity: () => {
                // Return a fixed capacity or -1 for unlimited
                return -1;
            },
            add: async (id: string, memory: IMemoryUnit) => {
                const node = memoryUnitToGraphNode(memory as IEpisodicMemoryUnit);
                node.id = id;
                await storage.addNode(node);
            },
            get: async (id: string) => {
                const node = await storage.getNode(id);
                return node ? graphNodeToMemoryUnit(node as EpisodeNode) : null;
            },
            getAll: async () => {
                const { nodes } = await storage.query({});
                return nodes
                    .filter((node: IGraphNode): node is EpisodeNode => node.type === EpisodicNodeType.EPISODE)
                    .map(node => graphNodeToMemoryUnit(node));
            }
        };

        const memoryIndex: IMemoryIndex = {
            add: async (unit: IMemoryUnit) => {
                const node = memoryUnitToGraphNode(unit as IEpisodicMemoryUnit);
                await index.indexNode(node);
            },
            search: async (query: string) => {
                // Use embedding search if available
                return [];
            },
            update: async (unit: IMemoryUnit) => {
                const node = memoryUnitToGraphNode(unit as IEpisodicMemoryUnit);
                await index.indexNode(node);
            },
            delete: async (id: string) => {
                // Graph index handles this automatically
            },
            remove: async (id: string) => {
                // Graph index handles this automatically
            }
        };

        super(memoryStorage, memoryIndex, MemoryType.EPISODIC);
        this.graphStorage = storage;
        this.graphIndex = index;
        this.llm = new GraphLLMProcessor(llmClient);
        this.graphOps = new MemoryGraph(storage, this.llm);
    }

    /**
     * Create a new episodic memory unit
     */
    public createMemoryUnit<C>(
        content: C | string,
        schema?: z.ZodType<C>,
        metadata?: Map<string, any>
    ): IEpisodicMemoryUnit {
        const baseContent = typeof content === 'string' ? {
            timeSequence: Date.now(),
            location: '',
            actors: [],
            actions: [content],
            emotions: new EmotionalContextImpl(),
            coherenceScore: 1,
            emotionalIntensity: 1,
            contextualRelevance: 1,
            temporalDistance: 0,
            timestamp: new Date()
        } : {
            ...content as object,
            timestamp: 'timestamp' in (content as object) ? (content as any).timestamp : new Date()
        };

        return {
            id: crypto.randomUUID(),
            memoryType: MemoryType.EPISODIC,
            content: {
                ...baseContent,
                timestamp: baseContent.timestamp || new Date()
            } as IEpisodicMemoryUnit['content'],
            metadata: metadata || new Map(),
            timestamp: new Date(),
            createdAt: new Date()
        };
    }

    /**
     * Type guard for episodic memory units
     */
    public isMemoryUnitOfType(unit: any): unit is IEpisodicMemoryUnit {
        return unit && 
               typeof unit === 'object' && 
               'memoryType' in unit && 
               unit.memoryType === MemoryType.EPISODIC;
    }

    /**
     * Store a new episodic memory unit with graph relationships
     */
    public async store(unit: IEpisodicMemoryUnit): Promise<void> {
        // First store in base storage
        await super.store(unit);

        // Create graph nodes and relationships
        const episodeNode = memoryUnitToGraphNode(unit);
        
        // Create location node
        const locationNode: LocationNode = {
            id: crypto.randomUUID(),
            type: EpisodicNodeType.LOCATION,
            content: { name: unit.content.location },
            metadata: new Map(),
            createdAt: new Date()
        };

        // Create actor nodes
        const actorNodes: ActorNode[] = unit.content.actors.map(actor => ({
            id: crypto.randomUUID(),
            type: EpisodicNodeType.ACTOR,
            content: { name: actor },
            metadata: new Map(),
            createdAt: new Date()
        }));

        // Create action nodes
        const actionNodes: ActionNode[] = unit.content.actions.map(action => ({
            id: crypto.randomUUID(),
            type: EpisodicNodeType.ACTION,
            content: { name: action },
            metadata: new Map(),
            createdAt: new Date()
        }));

        // Store all nodes
        await this.graphStorage.addNode(episodeNode);
        await this.graphStorage.addNode(locationNode);
        for (const node of [...actorNodes, ...actionNodes]) {
            await this.graphStorage.addNode(node);
        }

        // Create edges
        const edges: EpisodicEdge[] = [
            // Episode -> Location
            {
                id: crypto.randomUUID(),
                type: EpisodicEdgeType.HAPPENED_AT,
                sourceId: episodeNode.id,
                targetId: locationNode.id,
                content: null,
                metadata: new Map(),
                createdAt: new Date()
            },
            // Episode -> Actors
            ...actorNodes.map(actor => ({
                id: crypto.randomUUID(),
                type: EpisodicEdgeType.INVOLVES,
                sourceId: episodeNode.id,
                targetId: actor.id,
                content: null,
                metadata: new Map(),
                createdAt: new Date()
            })),
            // Episode -> Actions
            ...actionNodes.map(action => ({
                id: crypto.randomUUID(),
                type: EpisodicEdgeType.CONTAINS,
                sourceId: episodeNode.id,
                targetId: action.id,
                content: null,
                metadata: new Map(),
                createdAt: new Date()
            }))
        ];

        // Store edges
        for (const edge of edges) {
            await this.graphStorage.addEdge(edge);
        }

        // Index nodes for efficient retrieval
        await this.graphIndex.indexNode(episodeNode);
        await this.graphIndex.indexNode(locationNode);
        for (const node of [...actorNodes, ...actionNodes]) {
            await this.graphIndex.indexNode(node);
        }

        // Find and link to temporally adjacent episodes
        await this.linkTemporalEpisodes(episodeNode);

        // Trigger memory consolidation if needed
        await this.consolidateMemories(episodeNode);
    }

    /**
     * Query memories based on filter criteria
     */
    public async query(filter: MemoryFilter): Promise<IEpisodicMemoryUnit[]> {
        // Build graph query
        const graphFilter: GraphFilter = {
            nodeTypes: [EpisodicNodeType.EPISODE],
            timeWindow: filter.dateRange ? {
                start: filter.dateRange.start || new Date(0),
                end: filter.dateRange.end || new Date()
            } : undefined,
            metadata: filter.metadataFilters?.[0],
            maxResults: filter.limit
        };

        // First try metadata-based search
        const nodeIds = await this.graphIndex.searchByMetadata(filter.metadataFilters?.[0] || {});
        
        // If embedding provided, also try similarity search
        if (filter.embedding) {
            const similarIds = await this.graphIndex.searchByEmbedding(filter.embedding);
            nodeIds.push(...similarIds);
        }

        // Add found IDs to filter
        if (nodeIds.length > 0) {
            graphFilter.nodeIds = nodeIds;
        }

        // Query the graph
        const { nodes } = await this.graphStorage.query(graphFilter);
        
        // Convert nodes back to memory units
        return nodes
            .filter((node: IGraphNode): node is EpisodeNode => node.type === EpisodicNodeType.EPISODE)
            .map(node => graphNodeToMemoryUnit(node));
    }

    /**
     * Link new episode to temporally adjacent episodes
     */
    private async linkTemporalEpisodes(episodeNode: EpisodeNode): Promise<void> {
        const timeSequence = episodeNode.content.timeSequence;
        
        // Find episodes before and after
        const adjacentFilter: GraphFilter = {
            nodeTypes: [EpisodicNodeType.EPISODE],
            timeWindow: {
                start: new Date(timeSequence - 24 * 60 * 60 * 1000), // Last 24 hours
                end: new Date(timeSequence + 24 * 60 * 60 * 1000) // Next 24 hours
            },
            maxResults: 2
        };

        const { nodes } = await this.graphStorage.query(adjacentFilter);
        
        // Create temporal edges
        for (const node of nodes) {
            if (node.content.timeSequence < timeSequence) {
                await this.graphStorage.addEdge({
                    id: crypto.randomUUID(),
                    type: EpisodicEdgeType.FOLLOWS,
                    sourceId: episodeNode.id,
                    targetId: node.id,
                    content: null,
                    metadata: new Map(),
                    createdAt: new Date()
                });
            }
        }
    }

    /**
     * Consolidate memories by finding patterns and creating higher-level episodes
     */
    private async consolidateMemories(newEpisode: EpisodeNode): Promise<void> {
        // Query for recent episodes to consider for consolidation
        const recentFilter: GraphFilter = {
            nodeTypes: [EpisodicNodeType.EPISODE],
            timeWindow: {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
                end: new Date()
            }
        };

        const { nodes, edges } = await this.graphStorage.query(recentFilter);
        
        // Use LLM to identify patterns and create consolidated memories
        const consolidation = await this.llm.process<ConsolidationResult>(GraphTask.CONSOLIDATE_EPISODES, { nodes, edges });
        
        if (consolidation) {
            const consolidatedNode = memoryUnitToGraphNode(consolidation);
            await this.graphStorage.addNode(consolidatedNode);
            
            // Link consolidated node to source episodes
            for (const sourceId of consolidation.sourceEpisodeIds) {
                await this.graphStorage.addEdge({
                    id: crypto.randomUUID(),
                    type: EpisodicEdgeType.CONSOLIDATED_FROM,
                    sourceId: consolidatedNode.id,
                    targetId: sourceId,
                    content: null,
                    metadata: new Map(),
                    createdAt: new Date()
                });
            }
        }
    }

    /**
     * Find related episodes based on semantic similarity
     */
    public async findRelatedEpisodes(episodeId: string, options?: {
        maxResults?: number;
        minSimilarity?: number;
    }): Promise<IEpisodicMemoryUnit[]> {
        const episode = await this.graphStorage.getNode(episodeId);
        if (!episode || episode.type !== EpisodicNodeType.EPISODE) {
            return [];
        }

        // Get relevant nodes for search
        const { nodes: relevantNodes } = await this.graphOps.getNeighbors(episodeId);

        // Get results and convert to memory units
        const results = await this.llm.process<SearchResult[]>(GraphTask.RERANK_RESULTS, { 
            query: episodeId,
            nodes: relevantNodes,
            maxResults: options?.maxResults || 10,
            minScore: options?.minSimilarity || 0.5
        });

        return Promise.all(
            results.map(async result => {
                const node = await this.graphStorage.getNode(result.nodeId);
                return node ? graphNodeToMemoryUnit(node as EpisodeNode) : null;
            })
        ).then(units => units.filter((unit): unit is IEpisodicMemoryUnit => unit !== null));
    }
}
