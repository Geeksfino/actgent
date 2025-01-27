import { 
    IGraphNode, 
    IGraphEdge, 
    GraphFilter, 
    TraversalOptions, 
    IGraphStorage,
    GraphMemoryType
} from './types';
import { GraphLLMProcessor } from '../processing/llm/processor';
import { TimeMode } from '../processing/temporal/temporal';

import { 
    GraphTask,
    PathResult,
    CommunityResult,
    SearchResult,
    TemporalResult
} from '../processing/llm/types';

/**
 * Core graph operations implementation using LLM for complex operations
 */
export class GraphOperations {
    constructor(
        private storage: IGraphStorage,
        private llm: GraphLLMProcessor
    ) {}

    /**
     * Add a node to the graph
     */
    async addNode(node: IGraphNode): Promise<void> {
        await this.storage.addNode(node);
    }

    /**
     * Add an edge to the graph
     */
    async addEdge(edge: IGraphEdge): Promise<void> {
        await this.storage.addEdge(edge);
    }

    /**
     * Get nodes matching filter
     */
    async getNodes(filter: GraphFilter): Promise<IGraphNode[]> {
        const result = await this.storage.query({
            nodeTypes: filter.nodeTypes,
            timeWindow: filter.timeWindow,
            maxResults: filter.maxResults,
            temporal: filter.temporal,
            metadata: filter.metadata
        });
        return result.nodes;
    }

    /**
     * Get edges matching filter
     */
    async getEdges(filter: GraphFilter): Promise<IGraphEdge[]> {
        const result = await this.storage.query({
            edgeTypes: filter.edgeTypes,
            timeWindow: filter.timeWindow,
            maxResults: filter.maxResults,
            temporal: filter.temporal,
            metadata: filter.metadata
        });
        return result.edges;
    }

    /**
     * Find paths between nodes
     */
    async findPaths(sourceId: string, targetId: string, options?: TraversalOptions): Promise<PathResult[]> {
        const result = await this.storage.query({});
        const paths = await this.llm.process<PathResult[]>(
            GraphTask.EVALUATE_PATHS,
            {
                start: sourceId,
                end: targetId,
                nodes: result.nodes,
                edges: result.edges,
                options
            }
        );
        return paths;
    }

    /**
     * Get neighboring nodes and edges for a given node
     */
    async getNeighbors(nodeId: string): Promise<{ nodes: IGraphNode[], edges: IGraphEdge[] }> {
        const result = await this.storage.query({
            nodeIds: [nodeId],
            includeNeighbors: true
        });
        return {
            nodes: result.nodes.filter(n => n.id !== nodeId),
            edges: result.edges
        };
    }

    /**
     * Find communities
     */
    async findCommunities(nodeIds: string[]): Promise<CommunityResult[]> {
        // Implementation
        return [];
    }

    /**
     * Search
     */
    async search(query: string): Promise<SearchResult[]> {
        // Implementation
        return [];
    }

    /**
     * Update node temporal info
     */
    async updateNodeTemporalInfo(nodeId: string, timeMode: TimeMode): Promise<void> {
        const result = await this.llm.process<TemporalResult[]>(
            GraphTask.EXTRACT_TEMPORAL,
            { nodeId, timeMode }
        );

        const edges = result.map((r: TemporalResult) => ({
            id: `${r.source}_${r.target}_${r.relationship}`,
            sourceId: r.source,
            targetId: r.target,
            type: r.relationship,
            metadata: new Map([['confidence', r.confidence]]),
            createdAt: new Date(),
            memoryType: GraphMemoryType.SEMANTIC,
            content: r.relationship,
            episodeIds: []
        } as IGraphEdge));

        await Promise.all(edges.map(edge => this.storage.addEdge(edge)));
    }
}
