import { IGraphNode, IGraphEdge, GraphFilter, TraversalOptions } from './types';
import { IGraphStorage } from '../storage';
import { GraphLLMProcessor } from './llm/processor';
import { 
    GraphTask, 
    PathSchema, 
    CommunitySchema, 
    EmbeddingSchema, 
    SearchResultSchema,
    TemporalSchema,
    SearchResult
} from './llm/types';

/**
 * Core graph operations implementation using LLM for complex operations
 */
export class GraphOperations {
    constructor(
        private storage: IGraphStorage,
        private llm: GraphLLMProcessor
    ) {}

    /**
     * Find nodes connected to the given node using LLM-based path finding
     */
    async getNeighbors(nodeId: string, options?: TraversalOptions): Promise<IGraphNode[]> {
        const node = await this.storage.retrieve(nodeId);
        if (!node) return [];

        // Get all potential neighbors
        const candidates = await this.storage.getNeighbors(nodeId);
        
        // Use LLM to rank and filter most relevant neighbors
        const ranked = await this.llm.process<SearchResult>(
            GraphTask.RERANK_RESULTS,
            { 
                query: node.content,
                results: candidates
            },
            SearchResultSchema
        );

        return candidates.filter(c => 
            ranked.find(r => r.id === c.id)
        );
    }

    /**
     * Find meaningful path between two nodes using LLM
     */
    async findPath(sourceId: string, targetId: string): Promise<IGraphEdge[]> {
        const source = await this.storage.retrieve(sourceId) as IGraphNode;
        const target = await this.storage.retrieve(targetId) as IGraphNode;
        if (!source || !target) return [];

        // Get relevant subgraph
        const nodes = await this.storage.findNodes({
            maxDistance: 3,
            metadata: new Map([['centerId', sourceId]])
        });
        const edges = await this.storage.getEdges(nodes.map(n => n.id));

        // Use LLM to find meaningful path
        const path = await this.llm.process(
            GraphTask.FIND_PATH,
            { start: source, end: target, nodes, edges },
            PathSchema
        );

        return edges.filter(e => path.edges.includes(e.id));
    }

    /**
     * Get temporal context using LLM for understanding
     */
    async getTemporalContext(nodeId: string, contextSize: number = 4): Promise<IGraphNode[]> {
        const node = await this.storage.retrieve(nodeId) as IGraphNode;
        if (!node) return [];

        // Extract temporal understanding from node content
        const temporal = await this.llm.process(
            GraphTask.EXTRACT_TEMPORAL,
            { 
                text: node.content,
                referenceTime: node.temporal.eventTime.toISOString()
            },
            TemporalSchema
        );

        // Find nodes within temporal context
        const filter: GraphFilter = {
            temporal: {
                from: new Date(temporal.validFrom || temporal.eventTime),
                to: new Date(temporal.validTo || temporal.eventTime),
                timelineType: 'event'
            }
        };

        return this.storage.findNodes(filter);
    }

    /**
     * Find related nodes using LLM-based community detection
     */
    async findRelated(nodeId: string, maxDistance: number = 2): Promise<IGraphNode[]> {
        const nodes = await this.storage.findNodes({
            maxDistance,
            metadata: new Map([['centerId', nodeId]])
        });

        const edges = await this.storage.getEdges(nodes.map(n => n.id));

        // Use LLM to detect communities
        const communities = await this.llm.process(
            GraphTask.DETECT_COMMUNITIES,
            { nodes, edges },
            CommunitySchema
        );

        // Find community containing our node
        const community = communities.communities.find(c => 
            c.nodes.includes(nodeId)
        );

        if (!community) return [];

        return nodes.filter(n => community.nodes.includes(n.id));
    }

    /**
     * Search nodes using LLM-generated embeddings
     */
    async searchNodes(query: string): Promise<IGraphNode[]> {
        // Generate embedding using LLM
        const embedding = await this.llm.process(
            GraphTask.GENERATE_EMBEDDING,
            { text: query },
            EmbeddingSchema
        );

        // Search using embedding
        const results = await this.storage.search(embedding);

        // Rerank using LLM
        const ranked = await this.llm.process<SearchResult>(
            GraphTask.RERANK_RESULTS,
            { query, results },
            SearchResultSchema
        );

        return results.filter(r => 
            ranked.find(rank => rank.id === r.id)
        );
    }
}
